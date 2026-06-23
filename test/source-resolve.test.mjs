// CORE USER FLOW: the source preview shows the changed file's content.
//
// `git diff` prints paths relative to the repository root, and the desktop tree shows them as-is. The
// source preview must therefore read those files relative to the repo root too — NOT process.cwd().
// When `mo` runs from a monorepo subdirectory (cwd != root), resolving against cwd points at a
// non-existent path, so the diff renders but the source preview says "file is not present in the
// working tree". This guards both the repo-root run and the subdirectory run.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIST_BUILD = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "build.js");
const made = [];
after(() => {
  for (const d of made) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

// A repo whose changed file lives in a subdirectory, so repo-root-relative != cwd-relative.
function repoWithSubdirChange() {
  const dir = mkdtempSync(join(tmpdir(), "mc-subroot-"));
  made.push(dir);
  const g = (a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  g(["init", "-q"]);
  g(["config", "user.email", "t@monacori.test"]);
  g(["config", "user.name", "monacori test"]);
  g(["config", "commit.gpgsign", "false"]);
  mkdirSync(join(dir, "pkg"), { recursive: true });
  writeFileSync(join(dir, "pkg/app.ts"), "export const value = 1;\n");
  g(["add", "-A"]);
  g(["commit", "-qm", "base"]);
  writeFileSync(join(dir, "pkg/app.ts"), "export const value = 2;\n");
  return dir;
}

async function buildFrom(cwd) {
  const { buildDiffReview } = await import(DIST_BUILD);
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    return buildDiffReview({
      staged: false,
      includeUntracked: true,
      context: 12,
      title: "t",
      lazyLoad: false, // embed source so we can assert on it directly
      app: false,
    });
  } finally {
    process.chdir(prev);
  }
}

test("repo root run: the changed file's source is embedded (not missing)", async () => {
  const build = await buildFrom(repoWithSubdirChange());
  assert.doesNotMatch(build.html, /not present in the working tree/);
});

test("subdirectory run (cwd != repo root): source still resolves against the repo root", async () => {
  const dir = repoWithSubdirChange();
  const build = await buildFrom(join(dir, "pkg")); // run `mo` from a subdir
  assert.doesNotMatch(
    build.html,
    /not present in the working tree/,
    "source must resolve against the repo root, not cwd",
  );
  assert.match(build.html, /export const value = 2/, "the new source content is embedded");
});
