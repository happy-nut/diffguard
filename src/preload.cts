import { contextBridge, ipcRenderer } from "electron";

// Bridges the sandboxed renderer to the main process so .http requests can be
// executed without CORS or sandbox restrictions. Kept intentionally tiny: the
// renderer only ever asks main to perform a single fetch and return the result.
contextBridge.exposeInMainWorld("monacoriHttp", {
  send: (request: unknown): Promise<unknown> => ipcRenderer.invoke("monacori:http-send", request),
});

// Lets the Review menu's Cmd/Ctrl+Shift+/ and +. accelerators open the merged comment views in
// the renderer (the keys macOS would otherwise reserve for its Help search).
contextBridge.exposeInMainWorld("monacoriMenu", {
  onMergedView: (cb: (kind: string) => void): void => {
    ipcRenderer.on("monacori:merged-view", (_event, kind: string) => cb(kind));
  },
  // Cmd/Ctrl+W from the Window menu -> close the active Files-mode tab in the renderer.
  onCloseTab: (cb: () => void): void => {
    ipcRenderer.on("monacori:close-tab", () => cb());
  },
});

// Phase 2 lazy-LOAD: fetch a single file's diff body from the main process on demand, so the initial
// HTML can omit the embedded diff bodies (tens of MB on big repos) and stay small.
contextBridge.exposeInMainWorld("monacoriFile", {
  get: (index: number, kind: string): Promise<string> => ipcRenderer.invoke("monacori:get-file", { index, kind }),
  getSourceData: (): Promise<string> => ipcRenderer.invoke("monacori:get-source-data"),
});

// Self-update: ask the main process to install the latest version globally and relaunch. Only present
// in the Electron app (not browser/watch mode), so the renderer hides the in-app update button there.
contextBridge.exposeInMainWorld("monacoriUpdate", {
  run: (): Promise<unknown> => ipcRenderer.invoke("monacori:self-update"),
});

// Global settings (locale, …) persisted by the main process under userData so they survive app
// restarts — the renderer's file:// localStorage is not reliably persisted across reopens. `all` is
// read synchronously at preload so the renderer can pick the locale before first paint; `set` writes
// asynchronously. Only present in the Electron app; browser/serve mode falls back to localStorage.
const persistedSettings: Record<string, unknown> = (() => {
  try {
    return (ipcRenderer.sendSync("monacori:get-settings") as Record<string, unknown>) || {};
  } catch {
    return {};
  }
})();
contextBridge.exposeInMainWorld("monacoriSettings", {
  all: persistedSettings,
  set: (key: string, value: unknown): void => {
    try {
      ipcRenderer.send("monacori:set-setting", { key, value });
    } catch {
      /* noop */
    }
  },
});
