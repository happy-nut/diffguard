// Load a standalone review HTML into jsdom and drive it like a user would.
//
// The page ships its client as one inline <script> (viewer.client.js). jsdom runs it for us when
// `runScripts: "dangerously"` is set; `beforeParse` installs the handful of browser APIs the viewer
// feature-detects (IntersectionObserver, ResizeObserver, matchMedia, scrollTo) so the script boots
// without throwing. We give the document a real http origin so localStorage works — the viewer keys
// its persistence on `location.pathname`, and an opaque (file://) origin would make localStorage
// throw on access.
//
// Helpers below speak in the viewer's own vocabulary (open a file, click a line, open the composer,
// save) and deliberately locate the *visible* composer the way a user's eyes would — never by raw
// DOM order — so a test that "types and saves" exercises the same wrong-textarea hazard the
// regression came from, instead of papering over it.
import { JSDOM } from "jsdom";

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {string} html standalone review HTML
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.seedStorage] localStorage entries to install BEFORE the
 *   viewer boots — used to simulate "reopen the app" so persistence/restore can be asserted.
 */
export async function loadViewer(html, opts = {}) {
  const dom = new JSDOM(html, {
    url: "http://localhost/review.html",
    runScripts: "dangerously",
    pretendToBeVisual: true, // provides requestAnimationFrame/cancelAnimationFrame
    beforeParse(window) {
      if (opts.seedStorage) {
        for (const [k, val] of Object.entries(opts.seedStorage)) {
          try {
            window.localStorage.setItem(k, val);
          } catch {
            /* localStorage not ready — caller falls back to a same-instance assertion */
          }
        }
      }
      const noopObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      };
      window.IntersectionObserver = noopObserver;
      window.ResizeObserver = noopObserver;
      if (!window.matchMedia) {
        window.matchMedia = () => ({
          matches: false,
          media: "",
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          },
        });
      }
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = () => {};

      // Simulate Electron's settings bridge. contextBridge DEEP-FREEZES everything it exposes, so the
      // persisted `all` snapshot is immutable — the renderer must clone before mutating. Without this
      // the tests only ever exercise the localStorage path (plain mutable arrays) and miss the
      // "object is not extensible" class of bug entirely.
      if (opts.electronSettings) {
        const frozen = deepFreeze(JSON.parse(JSON.stringify(opts.electronSettings)));
        const writes = {};
        window.__electronWrites = writes;
        window.monacoriSettings = {
          all: frozen,
          set(key, value) {
            writes[key] = value;
          },
        };
      }
    },
  });

  const { window } = dom;
  const { document } = window;
  // Let the inline script finish its synchronous boot + any 0ms timers (lazy-diff setup, the initial
  // refreshComments, the composer focus retry interval which caps at ~300ms).
  await tick(60);

  const api = new Viewer(dom, window, document);
  return api;
}

class Viewer {
  constructor(dom, window, document) {
    this.dom = dom;
    this.window = window;
    this.document = document;
  }

  // ---- lifecycle -------------------------------------------------------------------------------
  close() {
    this.window.close();
  }
  /** Wait for the viewer's async work (focus retry interval, in-place re-renders) to settle. */
  settle(ms = 50) {
    return tick(ms);
  }
  /** Read the persisted comments exactly as the viewer wrote them to localStorage. */
  storedComments() {
    const raw = this.window.localStorage.getItem("monacori-comments:/review.html");
    return raw ? JSON.parse(raw) : [];
  }
  /** What the simulated Electron settings bridge (monacoriSettings.set) was asked to persist. */
  electronWrites() {
    return this.window.__electronWrites || {};
  }
  /** Snapshot the whole localStorage — feed it back via loadViewer(html, { seedStorage }). */
  exportStorage() {
    const out = {};
    const ls = this.window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      out[k] = ls.getItem(k);
    }
    return out;
  }

  // ---- queries ---------------------------------------------------------------------------------
  $(sel) {
    return this.document.querySelector(sel);
  }
  $all(sel) {
    return Array.from(this.document.querySelectorAll(sel));
  }
  visibleView() {
    const sv = this.document.getElementById("source-viewer");
    const dv = this.document.getElementById("diff-view");
    if (sv && !sv.classList.contains("hidden")) return "source";
    if (dv && !dv.classList.contains("hidden")) return "diff";
    return null;
  }
  /** The composer textarea the user can actually see — the gate the regression turned on. */
  visibleComposerInput() {
    const inputs = this.$all(".mc-composer .mc-input");
    return (
      inputs.find((i) => {
        const dv = this.document.getElementById("diff-view");
        const sv = this.document.getElementById("source-viewer");
        if (i.closest("#diff-view") && dv && dv.classList.contains("hidden")) return false;
        if (i.closest("#source-viewer") && sv && sv.classList.contains("hidden")) return false;
        return true;
      }) || null
    );
  }
  /** Text bodies of saved comment cards rendered in whichever view is on screen. */
  visibleCardTexts() {
    const root = this.visibleView() === "diff" ? "#diff2html-container" : "#source-body";
    return this.$all(`${root} .mc-card:not(.mc-composer) .mc-card-body`).map((b) => b.textContent);
  }

  // ---- low-level events ------------------------------------------------------------------------
  click(el) {
    if (!el) throw new Error("click: element not found");
    // A real browser blurs the focused field when you click a non-focusable target (e.g. a code row);
    // jsdom's synthetic clicks don't, which would leave a textarea "focused" and make the viewer's
    // `?`/`>` composer shortcuts no-op (they skip when activeElement is editable). Mirror the browser.
    const active = this.document.activeElement;
    if (active && active !== el && typeof active.blur === "function") active.blur();
    const opts = { bubbles: true, cancelable: true, view: this.window };
    el.dispatchEvent(new this.window.MouseEvent("mousedown", opts));
    el.dispatchEvent(new this.window.MouseEvent("mouseup", opts));
    el.dispatchEvent(new this.window.MouseEvent("click", opts));
  }
  key(key, mods = {}) {
    this.document.dispatchEvent(
      new this.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }),
    );
  }
  typeInto(el, value) {
    if (!el) throw new Error("typeInto: element not found");
    el.focus();
    el.value = value;
    el.dispatchEvent(new this.window.Event("input", { bubbles: true }));
  }

  // ---- viewer vocabulary -----------------------------------------------------------------------
  async openSourceFile(path) {
    const link =
      this.document.querySelector(`.source-link[data-source-file="${cssEscape(path)}"]`) ||
      this.document.querySelector(".source-link");
    this.click(link);
    await this.settle(80);
  }
  async openDiffFor(path) {
    const row =
      this.document.querySelector(`.change-row[data-file="${cssEscape(path)}"]`) ||
      this.document.querySelector(".change-row, #changes-panel .file-link");
    this.click(row);
    await this.settle(80);
  }
  /** Place the caret on a source row by its 0-based line index (markdown/csv rows are sparse). */
  async clickSourceLine(lineIndex) {
    const row = this.document.querySelector(`.source-row[data-line-index="${lineIndex}"]`);
    if (!row) throw new Error(`clickSourceLine: no source row at line-index ${lineIndex}`);
    this.click(row.querySelector(".source-code") || row);
    await this.settle(20);
  }
  /** Place the caret on the first changed line of the active diff (right/new side). */
  async clickFirstDiffLine() {
    const wrap = this.document.querySelector("#diff2html-container .d2h-file-wrapper");
    if (!wrap) throw new Error("clickFirstDiffLine: no diff wrapper");
    const sides = wrap.querySelectorAll(".d2h-file-side-diff");
    const right = sides[sides.length - 1];
    const numCell = Array.from(right.querySelectorAll(".d2h-code-side-linenumber")).find(
      (n) => (n.textContent || "").trim() !== "",
    );
    const tr = numCell.closest("tr");
    this.click(tr.querySelector(".d2h-code-line, .d2h-code-side-line") || numCell);
    await this.settle(20);
  }
  /** Open the composer for the caret line. kind: 'q' (question, "?") or 'c' (change request, ">"). */
  async openComposer(kind = "q") {
    this.key(kind === "q" ? "?" : ">");
    await this.settle(40);
  }
  /** Type into the *visible* composer and click its own Save ("Comment") button. */
  async writeAndSave(text) {
    const input = this.visibleComposerInput();
    if (!input) throw new Error("writeAndSave: no visible composer input");
    this.typeInto(input, text);
    const saveBtn = input.closest(".mc-comment-row").querySelector(".mc-save");
    this.click(saveBtn);
    await this.settle(40);
  }
  /** Toggle markdown/CSV between rendered and raw line-numbered text (the toolbar button). */
  async clickRenderToggle() {
    const btn = this.$("#render-toggle");
    if (!btn || btn.classList.contains("hidden")) throw new Error("render toggle not available");
    this.click(btn);
    await this.settle(60);
  }
  /** 0-based line indices of the rows currently in the source body, in document order. */
  sourceRowLineIndices() {
    return this.$all("#source-body .source-row").map((r) => Number(r.dataset.lineIndex));
  }
  /** Open the merged-prompt modal (Cmd+Shift+/ for questions, Cmd+Shift+. for change requests). */
  async openMergedView(kind = "q") {
    this.key(kind === "q" ? "?" : ">", {
      metaKey: true,
      shiftKey: true,
      code: kind === "q" ? "Slash" : "Period",
    });
    await this.settle(40);
  }
  /** The read-only text of the open merged-prompt modal, or null if none is open. */
  mergedModalText() {
    const area = this.$("#mc-modal .mc-modal-text");
    return area ? area.value : null;
  }
  /** Type into the visible composer and save with Cmd+Enter (the keyboard path). */
  async writeAndSaveWithKeyboard(text) {
    const input = this.visibleComposerInput();
    if (!input) throw new Error("writeAndSaveWithKeyboard: no visible composer input");
    this.typeInto(input, text);
    input.dispatchEvent(
      new this.window.KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await this.settle(40);
  }
}

// Minimal CSS.escape for attribute selectors (jsdom has CSS.escape, but keep helpers self-contained).
function cssEscape(value) {
  return String(value).replace(/["\\]/g, "\\$&");
}

// Recursively freeze an object graph the way Electron's contextBridge does to exposed values.
function deepFreeze(obj) {
  if (obj && typeof obj === "object") {
    for (const key of Object.keys(obj)) deepFreeze(obj[key]);
    Object.freeze(obj);
  }
  return obj;
}
