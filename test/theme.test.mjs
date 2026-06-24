// CORE USER FLOW: choosing a light or dark theme.
//
// The whole UI (chrome, diff2html, syntax tokens) reads :root CSS variables, and the light theme just
// overrides them under html[data-theme="light"]. The toggle lives in Settings → General, mirrors the
// language toggle (live switch, persisted), and the choice must survive a reopen.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { makeReviewHtml, cleanupFixtures } from "./helpers/fixture.mjs";
import { loadViewer } from "./helpers/dom.mjs";

let html;
before(async () => {
  ({ html } = await makeReviewHtml([
    { path: "a.ts", before: "export const a = 1;\n", after: "export const a = 2;\n" },
  ]));
});
after(cleanupFixtures);

test("defaults to dark, with a theme selector in settings", async () => {
  const v = await loadViewer(html);
  assert.equal(v.document.documentElement.getAttribute("data-theme"), "dark");
  assert.ok(v.$("#settings-theme"), "a theme selector is rendered in settings");
  v.close();
});

test("switching to light flips data-theme on <html> and persists", async () => {
  const v = await loadViewer(html);
  const sel = v.$("#settings-theme");
  sel.value = "light";
  sel.dispatchEvent(new v.window.Event("change", { bubbles: true }));
  await v.settle(20);

  assert.equal(v.document.documentElement.getAttribute("data-theme"), "light");
  assert.equal(v.window.localStorage.getItem("monacori-theme"), "light");
  v.close();
});

test("the light theme is restored on reopen", async () => {
  const v1 = await loadViewer(html);
  const sel = v1.$("#settings-theme");
  sel.value = "light";
  sel.dispatchEvent(new v1.window.Event("change", { bubbles: true }));
  await v1.settle(20);
  const snapshot = v1.exportStorage();
  v1.close();

  const v2 = await loadViewer(html, { seedStorage: snapshot });
  assert.equal(
    v2.document.documentElement.getAttribute("data-theme"),
    "light",
    "data-theme is light on first paint after reopen",
  );
  assert.equal(v2.$("#settings-theme").value, "light", "the selector reflects the restored theme");
  v2.close();
});
