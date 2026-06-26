import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } from "electron";
import { buildDiffReview, performHttpRequest, type HttpSendRequest } from "./cli.js";
import { sanitizeTerminalEnv } from "./util.js";
import { readUnifiedDiff } from "./diff.js";
import { isGitRepository } from "./git.js";
import { renderWelcomeHtml } from "./render.js";
import { createHash } from "node:crypto";
import { spawn as spawnPty, type IPty } from "node-pty";

type AppOptions = {
  root: string;
  base?: string;
  staged: boolean;
  includeUntracked: boolean;
  context: number;
  watch: boolean;
  ignoreWhitespace: boolean;
};

// `npm run dev` sets MONACORI_DEV=1 so a locally-built app announces itself — a window-title suffix
// plus a boot log with its on-disk path — making it obvious whether `mo` launched THIS checkout or
// the globally-installed package (their version numbers can be identical; the path is the tell).
const DEV_BUILD = process.env.MONACORI_DEV === "1";
const APP_TITLE = DEV_BUILD ? "monacori (dev)" : "monacori";
const FLOW_DIR = ".monacori";
const REVIEW_FILE = "app-review.html";
const WATCH_INTERVAL_MS = 1000;

// Painted immediately while the first review build + HTML render run, so startup shows a spinner instead
// of a blank window. Inlined as a data: URL so it needs no file on disk and appears before any review
// work. Theme-aware so a light-theme user doesn't get a dark flash before the renderer applies the theme.
function loadingHtml(light: boolean): string {
  const bg = light ? "#ffffff" : "#2b2b2b";
  const fg = light ? "#6e7781" : "#9aa4af";
  const ring = light ? "#d0d7de" : "#3a3a3a";
  const accent = light ? "#0969da" : "#4a9eff";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100vh;background:${bg};color:${fg};display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:18px;
    font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .s{width:34px;height:34px;border:3px solid ${ring};border-top-color:${accent};border-radius:50%;
    animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
</style></head><body><div class="s"></div><div>monacori</div></body></html>`;
}
// The persisted theme (set by the renderer via monacoriSettings). Read at startup so the native window
// chrome + loading screen match before the renderer boots. Defaults to dark.
function isLightTheme(): boolean {
  try {
    return readSettings()["monacori-theme"] === "light";
  } catch {
    return false;
  }
}

app.setName("monacori");
// Best-effort re-brand at startup. macOS shows the Dock / Cmd+Tab / menu-bar name from Electron.app's
// CFBundleName + executable name, which app.setName() CANNOT change — only scripts/patch-electron-name.mjs
// (run at postinstall) renames them. That postinstall step can be skipped (npm --ignore-scripts) or fail on
// perms, leaving "Electron" everywhere. Re-run the patch here in a Node context (ELECTRON_RUN_AS_NODE) so a
// fresh install self-heals; it's idempotent and takes effect on the NEXT launch.
if (process.platform === "darwin") {
  try {
    const patchScript = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "patch-electron-name.mjs");
    if (existsSync(patchScript)) {
      spawn(process.execPath, [patchScript], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: "ignore", detached: true }).unref();
    }
  } catch { /* best-effort — postinstall remains the primary path */ }
}

ipcMain.handle("monacori:http-send", (_event, request: HttpSendRequest) => performHttpRequest(request));

// Phase 2 lazy-LOAD: serve a single file's diff body to the renderer on demand. Retained from the
// most recent writeReviewFile() build so navigation/scroll can materialize bodies without embedding.
let currentBodies: string[] = [];
let currentSourceData = "[]";
ipcMain.handle("monacori:get-file", (_event, request: { index?: number }) => {
  const i = Number(request?.index);
  return Number.isInteger(i) && i >= 0 && i < currentBodies.length ? currentBodies[i] : "";
});
// Phase 2b lazy-LOAD: serve the full source files JSON (with content) on demand.
ipcMain.handle("monacori:get-source-data", () => currentSourceData);

// Welcome screen's "Open Folder" button: pick a directory; load it if it's a git repo, else report back.
ipcMain.handle("monacori:open-folder", async () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Open a Git repository",
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false };
  const root = result.filePaths[0];
  if (!isGitRepository(root)) return { ok: false, error: "not-git" };
  await openReview(root);
  return { ok: true };
});

// Self-update: install the latest published package globally, then relaunch so the updated code loads.
// Runs in the main process because the sandboxed renderer can't spawn npm. Returns {ok:true} (and
// relaunches shortly after) or {ok:false,error} so the renderer can fall back to the manual command.
ipcMain.handle("monacori:self-update", () => new Promise<{ ok: boolean; error?: string }>((resolve) => {
  // Async, NOT spawnSync: spawnSync froze the ENTIRE main process for the whole npm install (up to
  // minutes), so the app looked hung and "nothing happened" — even the renderer's "Updating…" couldn't
  // paint and the user saw no restart. Stream it so the UI stays responsive; resolve on close.
  let out = "";
  let child: import("node:child_process").ChildProcess;
  try {
    child = spawn("npm", ["install", "-g", "@happy-nut/monacori@latest"], { shell: true, env: process.env });
  } catch (error) {
    resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
    return;
  }
  child.stdout?.on("data", (d) => { out += String(d); });
  child.stderr?.on("data", (d) => { out += String(d); });
  child.on("error", (error) => resolve({ ok: false, error: (error instanceof Error ? error.message : String(error)).slice(-600) }));
  child.on("close", (code) => {
    if (code !== 0) { resolve({ ok: false, error: (out || "npm install failed").trim().slice(-600) }); return; }
    resolve({ ok: true });
    // The global install replaced our on-disk dist, so THIS process is stale. Start the freshly-installed
    // CLI as a NEW detached process, then exit. If `mo` isn't on the (GUI) app's PATH it errors or exits
    // non-zero — fall back to app.relaunch() so the user is never left without a restart (the bug: a failed
    // `mo` spawn under detached/unref went unnoticed and the app just exited without relaunching).
    setTimeout(() => {
      let done = false;
      const relaunch = () => { if (done) return; done = true; try { app.relaunch(); } catch { /* nothing else to try */ } app.exit(0); };
      try {
        const c = spawn("mo", [], { cwd: options.root, detached: true, stdio: "ignore", env: sanitizeTerminalEnv(process.env), shell: true });
        c.on("error", relaunch);
        c.on("exit", (exitCode) => { if (exitCode && exitCode !== 0) relaunch(); });
        c.unref();
        setTimeout(() => { if (!done) { done = true; app.exit(0); } }, 800); // `mo` launched fine -> hand off and exit
      } catch {
        relaunch();
      }
    }, 600);
  });
}));

// Integrated terminal: own node-pty sessions in the main process (the sandboxed renderer can't spawn
// them) and relay bytes to the renderer's xterm panes. Each split pane gets its own pty, keyed by id, so
// the renderer can route data/resize/kill per pane.
const terms = new Map<number, IPty>();
let nextPtyId = 0;
ipcMain.handle("monacori:pty-spawn", (_event, size: { cols?: number; rows?: number }) => {
  const id = ++nextPtyId;
  const shell = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "/bin/zsh");
  const t = spawnPty(shell, [], {
    name: "xterm-color",
    cols: size?.cols ?? 80,
    rows: size?.rows ?? 24,
    cwd: options.root,
    env: sanitizeTerminalEnv(process.env),
  });
  terms.set(id, t);
  // mainWindow?. only guards null, NOT a *destroyed* window — sending to a closed window's webContents
  // throws "Object has been destroyed". The pty can outlive the window (close races pty teardown), so
  // guard every relay with isDestroyed().
  const deliver = (channel: string, payload: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };
  // Relay pty output to the renderer immediately, one IPC per chunk. (A coalescing buffer was tried as an
  // optimization but it broke terminal I/O — the shell prompt and echo stopped appearing — so it's removed.)
  t.onData((data) => deliver("monacori:pty-data", { id, data }));
  t.onExit(() => { terms.delete(id); deliver("monacori:pty-exit", { id }); });
  return { ok: true, id };
});
ipcMain.on("monacori:pty-write", (_event, msg: { id: number; data: string }) => { terms.get(msg?.id)?.write(msg.data); });
ipcMain.on("monacori:pty-resize", (_event, msg: { id: number; cols: number; rows: number }) => {
  try { terms.get(msg?.id)?.resize(msg.cols, msg.rows); } catch { /* resize can race the pty teardown — ignore */ }
});
ipcMain.on("monacori:pty-kill", (_event, msg: { id: number }) => {
  const t = terms.get(msg?.id);
  if (t) { try { t.kill(); } catch { /* already exited */ } terms.delete(msg.id); }
});

// Persisted global settings (locale, …) live in a JSON file under userData and reach the renderer
// via preload + the two handlers below. The renderer's file:// localStorage is NOT reliably persisted
// across app restarts, so settings that must survive a reopen round-trip through the main process.
function settingsFile(): string {
  return join(app.getPath("userData"), "monacori-settings.json");
}
function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(settingsFile(), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}
function writeSettings(settings: Record<string, unknown>): void {
  try {
    writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch {
    /* best-effort: a failed write just means the setting isn't persisted */
  }
}
ipcMain.on("monacori:get-settings", (event) => {
  event.returnValue = readSettings();
});
ipcMain.on("monacori:set-setting", (_event, msg: { key?: string; value?: unknown }) => {
  if (!msg || typeof msg.key !== "string") return;
  const settings = readSettings();
  settings[msg.key] = msg.value;
  writeSettings(settings);
});

const iconPath = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "icon.png");
const preloadPath = join(dirname(fileURLToPath(import.meta.url)), "preload.cjs");

const options = parseArgs(process.argv.slice(2));
// A packaged .app (double-clicked) has no useful cwd — it's "/" or the bundle, not a git repo. Start in
// "welcome" mode (an Open Folder button) instead of crashing on chdir("/")+mkdir or showing an empty diff.
const guideMode = app.isPackaged && !isGitRepository(options.root);
let mainWindow: BrowserWindow | undefined;
let currentSignature = "";
let refreshTimer: NodeJS.Timeout | undefined;
let refreshing = false;

if (!existsSync(options.root)) {
  throw new Error(`Repository path does not exist: ${options.root}`);
}

app.whenReady().then(async () => {
  // Foreground (`npm run dev` / `mo --foreground`) surfaces this in the terminal; detached `mo` drops
  // it. Either way the path disambiguates a local checkout from the installed package.
  console.error(`[monacori] ${DEV_BUILD ? "DEV build" : "build"} — ${app.getAppPath()} (electron ${process.versions.electron})`);
  // Packaged double-click defers chdir/mkdir until a folder is picked (openReview); chdir("/")+mkdir crashes.
  if (!guideMode) {
    process.chdir(options.root);
    mkdirSync(FLOW_DIR, { recursive: true });
  }
  // Keep the standard Edit/Window roles so Cmd+C/V/X/A (copy comments into prompts) and Cmd+Q work.
  // The in-window menu bar stays hidden on Windows/Linux via autoHideMenuBar; macOS shows it in the top bar.
  const sendMerged = (kind: "q" | "c") => mainWindow?.webContents.send("monacori:merged-view", kind);
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [];
  if (process.platform === "darwin") menuTemplate.push({ role: "appMenu" });
  menuTemplate.push({ role: "editMenu" });
  // Ctrl+Cmd+Shift+/ ("?") and Ctrl+Cmd+Shift+. (">") open the merged question / change-request views.
  // ? and > are Shift+/ and Shift+. so Shift is part of the combo; Ctrl+Cmd avoids macOS's Cmd+? Help grab.
  menuTemplate.push({
    label: "Review",
    submenu: [
      { label: "All questions", accelerator: "Control+Command+Shift+/", click: () => sendMerged("q") },
      { label: "All change requests", accelerator: "Control+Command+Shift+.", click: () => sendMerged("c") },
      // Cmd/Ctrl+Shift+N opens (and toggles) the single freeform prompt memo — a Markdown scratchpad.
      { label: "Prompt memo", accelerator: "CommandOrControl+Shift+N", click: () => mainWindow?.webContents.send("monacori:open-memo") },
      { type: "separator" },
      // Whitespace-ignore re-runs git diff with --ignore-all-space and reloads (main-process action,
      // so a menu checkbox is simpler than a renderer IPC round-trip).
      {
        label: "Ignore whitespace",
        type: "checkbox",
        checked: options.ignoreWhitespace,
        accelerator: "CommandOrControl+Shift+W",
        click: (item) => {
          options.ignoreWhitespace = item.checked;
          currentSignature = writeReviewFile(options).signature;
          mainWindow?.webContents.reloadIgnoringCache();
        },
      },
    ],
  });
  // Cmd/Ctrl+W closes the active Files-mode tab (routed to the renderer) instead of the window, matching
  // editor/browser tab behavior. Closing the window stays available via the menu item and Cmd/Ctrl+Q.
  menuTemplate.push({
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      { type: "separator" },
      { label: "Close Tab", accelerator: "CommandOrControl+W", click: () => mainWindow?.webContents.send("monacori:close-tab") },
      { label: "Close Window", click: () => mainWindow?.close() },
    ],
  });
  // Terminal toggle/split as menu accelerators: Chromium swallows Cmd+D before it reaches the renderer
  // (Cmd+A and friends arrive fine), so route the split — and the toggles — through the menu instead.
  menuTemplate.push({
    label: "Terminal",
    submenu: [
      { label: "Toggle Terminal", accelerator: "Control+`", click: () => mainWindow?.webContents.send("monacori:terminal-toggle") },
      { label: "Toggle Terminal (F12)", accelerator: "Alt+F12", click: () => mainWindow?.webContents.send("monacori:terminal-toggle") },
      { label: "Split Terminal", accelerator: "CommandOrControl+D", click: () => mainWindow?.webContents.send("monacori:terminal-split") },
      { type: "separator" },
      { label: "Focus Previous Pane", accelerator: "CommandOrControl+Alt+[", click: () => mainWindow?.webContents.send("monacori:terminal-pane-focus", -1) },
      { label: "Focus Next Pane", accelerator: "CommandOrControl+Alt+]", click: () => mainWindow?.webContents.send("monacori:terminal-pane-focus", 1) },
      { label: "Rename Pane", accelerator: "CommandOrControl+Alt+R", click: () => mainWindow?.webContents.send("monacori:terminal-pane-rename") },
    ],
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  const appIcon = nativeImage.createFromPath(iconPath);
  if (process.platform === "darwin" && app.dock && !appIcon.isEmpty()) {
    app.dock.setIcon(appIcon);
  }

  const themeLight = isLightTheme();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: APP_TITLE,
    icon: iconPath,
    backgroundColor: themeLight ? "#ffffff" : "#2b2b2b",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (DEV_BUILD) mainWindow?.webContents.openDevTools({ mode: "detach" });
  });
  // Paint the window with a spinner immediately, then build the (potentially heavy) review off the first
  // paint and swap it in. The first build used to run synchronously *before* the window existed, so the
  // screen stayed blank for the first few seconds of startup; now the user sees a loading screen instead.
  await mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(loadingHtml(themeLight)));
  // Give the loading spinner a few frames to actually paint before the (synchronous) first build blocks
  // the main process — otherwise the spinner looks frozen until the build finishes. The boot overlay in
  // the review HTML then takes over, so there's no blank gap when loadFile swaps the page in.
  setTimeout(() => {
    try {
      if (guideMode) { void showWelcome(); return; } // packaged, no cwd repo -> Open Folder screen
      const firstBuild = writeReviewFile(options);
      currentSignature = firstBuild.signature;
      if (mainWindow && !mainWindow.isDestroyed()) void mainWindow.loadFile(reviewPath());
      if (options.watch) refreshTimer = setInterval(refreshIfChanged, WATCH_INTERVAL_MS);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      app.quit();
    }
  }, 60);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (refreshTimer) clearInterval(refreshTimer);
  for (const t of terms.values()) { try { t.kill(); } catch { /* already exited */ } }
  terms.clear();
  app.quit();
});

let lastDiffSig = "";
async function refreshIfChanged(): Promise<void> {
  if (refreshing || !mainWindow || mainWindow.isDestroyed()) return;
  refreshing = true;
  try {
    // Fast path: hash only the git diff (~120ms) before the full build (~1s). The vast majority of
    // watch ticks see no change, so skip the heavy buildDiffReview entirely then — keeping the main
    // process free for IPC/pty so the UI never stalls on an unchanged tree.
    const diffSig = createHash("sha1")
      .update(
        readUnifiedDiff({
          base: options.base,
          staged: options.staged,
          context: options.context,
          includeUntracked: options.includeUntracked,
          ignoreWhitespace: options.ignoreWhitespace,
        }),
      )
      .digest("hex");
    if (diffSig === lastDiffSig) return;
    lastDiffSig = diffSig;
    const next = writeReviewFile(options);
    if (next.signature !== currentSignature) {
      currentSignature = next.signature;
      // Refresh the diff in place instead of reloading the window. A full reload re-runs the renderer,
      // whose beforeunload kills every pty — so an integrated terminal running claude/codex would die on
      // each working-tree change. We send only the compact update payload (diff/trees/status/data — no
      // xterm blob), and the renderer transplants it + re-fetches per-file bodies/source over the existing
      // IPC (currentBodies/currentSourceData were just refreshed by writeReviewFile above).
      if (next.update) mainWindow.webContents.send("monacori:diff-update", next.update);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  } finally {
    refreshing = false;
  }
}

function writeReviewFile(input: AppOptions): { signature: string; html: string; update?: import("./types.js").DiffReviewUpdate } {
  const build = buildDiffReview({
    base: input.base,
    staged: input.staged,
    includeUntracked: input.includeUntracked,
    context: input.context,
    title: APP_TITLE,
    ignoreWhitespace: input.ignoreWhitespace,
    lazyLoad: true, // Electron streams per-file bodies/source over IPC (monacori:get-file / get-source)
    app: true, // gate the integrated terminal (xterm) into the HTML — Electron only
  });
  writeFileSync(reviewPath(), build.html);
  currentBodies = build.lazyBodies ?? [];
  currentSourceData = build.lazySourceData ?? "[]";
  return { signature: build.signature, html: build.html, update: build.update };
}

function reviewPath(): string {
  return join(options.root, FLOW_DIR, REVIEW_FILE);
}

// Welcome screen for the packaged .app (double-clicked, no cwd repo). Written to userData (we can't write
// the review file under "/") and loaded so preload exposes window.monacoriApp.openFolder to its button.
async function showWelcome(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const welcomePath = join(app.getPath("userData"), "welcome.html");
  mkdirSync(dirname(welcomePath), { recursive: true });
  writeFileSync(welcomePath, renderWelcomeHtml(isLightTheme()));
  await mainWindow.loadFile(welcomePath);
}

// Load a chosen git repo's review — the initial open, or after the welcome screen's folder picker. Switches
// cwd, (re)writes the review, swaps the page, and re-arms the watch timer for the new root.
async function openReview(root: string): Promise<void> {
  options.root = root;
  process.chdir(root);
  mkdirSync(FLOW_DIR, { recursive: true });
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = undefined; }
  const build = writeReviewFile(options);
  currentSignature = build.signature;
  if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadFile(reviewPath());
  if (options.watch) refreshTimer = setInterval(refreshIfChanged, WATCH_INTERVAL_MS);
}

function parseArgs(args: string[]): AppOptions {
  const root = readOption(args, "--cwd") ?? process.cwd();
  const contextValue = readOption(args, "--context");
  return {
    root: resolve(root),
    // staged review and custom --base were removed from the CLI; always diff the working tree against
    // HEAD (base omitted → defaults to HEAD downstream).
    staged: false,
    includeUntracked: args.includes("--include-untracked"),
    context: contextValue ? parsePositiveInteger(contextValue, "--context") : 12,
    watch: !args.includes("--no-watch"),
    ignoreWhitespace: args.includes("--ignore-whitespace"),
  };
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be a non-negative integer`);
  }
  return parsed;
}
