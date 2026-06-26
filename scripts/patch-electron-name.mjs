import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const APP_NAME = "monacori";

// Electron ships Electron.app with bundle name + executable "Electron", which is what macOS shows in
// the Dock / Cmd+Tab. The npm `mo` model spawns node_modules/electron's executable directly (not a
// packaged .app), and a directly-spawned GUI process takes its switcher/Dock name from the *executable*
// name — CFBundleName and app.setName() only affect the menu items, not the switcher. So we rename the
// executable to "monacori" (and repoint electron's path.txt) in addition to patching bundle metadata.
function electronRoot() {
  if (process.platform !== "darwin") return null;
  const require = createRequire(import.meta.url);
  try {
    return dirname(require.resolve("electron/package.json"));
  } catch {
    return null; // electron not installed
  }
}

function main() {
  const root = electronRoot();
  if (!root) return; // not macOS, or electron missing — nothing to do
  const appDir = join(root, "dist", "Electron.app");
  const plistPath = join(appDir, "Contents", "Info.plist");
  const macosDir = join(appDir, "Contents", "MacOS");
  const oldExe = join(macosDir, "Electron");
  const newExe = join(macosDir, APP_NAME);
  const pathTxt = join(root, "path.txt");
  if (!existsSync(plistPath)) {
    console.warn('monacori: Electron.app not found at ' + appDir + ' — skipping rebrand (Dock/menu may show "Electron")');
    return;
  }

  try {
    let changed = false;
    // 1. Bundle metadata: name, display name, AND executable -> monacori.
    const before = readFileSync(plistPath, "utf8");
    const after = before
      .replace(/(<key>CFBundleName<\/key>\s*<string>)[^<]*(<\/string>)/, "$1" + APP_NAME + "$2")
      .replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, "$1" + APP_NAME + "$2")
      .replace(/(<key>CFBundleExecutable<\/key>\s*<string>)[^<]*(<\/string>)/, "$1" + APP_NAME + "$2");
    if (after !== before) { writeFileSync(plistPath, after); changed = true; }

    // 2. Rename the executable so the directly-spawned process is "monacori" (idempotent).
    if (existsSync(oldExe) && !existsSync(newExe)) { renameSync(oldExe, newExe); changed = true; }

    // 3. Repoint electron's path.txt at the renamed binary so require("electron") resolves it.
    if (existsSync(pathTxt)) {
      const pt = readFileSync(pathTxt, "utf8");
      const fixed = pt.replace("MacOS/Electron", "MacOS/" + APP_NAME);
      if (fixed !== pt) { writeFileSync(pathTxt, fixed); changed = true; }
    }

    // Only when something actually changed: refresh LaunchServices so the Dock / Cmd+Tab show "monacori"
    // instead of a cached "Electron". Skipping it when already-branded keeps the startup re-run cheap.
    if (changed) {
      spawnSync(
        "/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister",
        ["-f", appDir],
        { stdio: "ignore" },
      );
      console.log('monacori: branded Electron app + executable as "' + APP_NAME + '"');
    }
  } catch (e) {
    // Surface the reason (perms / read-only) instead of failing SILENTLY — otherwise the Dock/Cmd+Tab/menu
    // keep showing "Electron" with no hint why. Non-fatal: app-main.ts re-runs this at startup.
    console.warn('monacori: could not rebrand the Electron app to "' + APP_NAME + '". Dock/Cmd+Tab/menu may stay "Electron". Reason: ' + (e && e.message ? e.message : e));
  }
}

main();
