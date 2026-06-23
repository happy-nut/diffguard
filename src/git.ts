import { spawnSync } from "node:child_process";
import type { GitSnapshot } from "./types.js";

export function isGitRepository(root: string): boolean {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: root,
    encoding: "utf8",
  });
  return result.status === 0 && (result.stdout ?? "").trim() === "true";
}

export function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    return "";
  }
  return (result.stdout ?? "").trim();
}

// Resolve the repository root. `git diff` and `git ls-files` print paths relative to it, and the
// desktop tree shows them as-is — so every filesystem read of those paths must resolve against the
// SAME root, not process.cwd(). When `mo` runs from a monorepo subdirectory (cwd != root), joining a
// repo-root-relative path onto cwd points at a file that doesn't exist, which surfaced as a diff with
// no source preview ("file is not present in the working tree"). Falls back to cwd outside a repo.
export function repoRoot(cwd: string = process.cwd()): string {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  return top || cwd;
}

export function readGitSnapshot(root: string): GitSnapshot {
  return {
    branch: git(root, ["branch", "--show-current"]),
    status: git(root, ["status", "--short"]),
    diffStat: git(root, ["diff", "--stat"]),
    recentCommits: git(root, ["log", "--oneline", "-5"]),
  };
}
