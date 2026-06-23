// CORE USER FLOW: the integrated terminal opens a clean login shell.
//
// Launching monacori through npm (`npm run dev`, or a global install behind an npm shim) injects
// npm_config_* vars into the process. Inheriting them into the pty makes nvm warn on every new shell
// ("nvm is not compatible with the npm_config_prefix environment variable") — which doesn't happen in
// iTerm. sanitizeTerminalEnv keeps the integrated terminal indistinguishable from the user's own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeTerminalEnv } from "../dist/util.js";

test("strips every npm_*-injected var (incl. the npm_config_prefix nvm rejects)", () => {
  const out = sanitizeTerminalEnv({
    PATH: "/usr/bin",
    HOME: "/Users/x",
    SHELL: "/bin/zsh",
    npm_config_prefix: "/Users/x/.nvm/versions/node/v22.22.2",
    npm_config_cache: "/Users/x/.npm",
    npm_lifecycle_event: "dev",
    npm_package_name: "@happy-nut/monacori",
    npm_node_execpath: "/usr/bin/node",
  });
  assert.equal("npm_config_prefix" in out, false, "the var nvm rejects is gone");
  assert.equal(
    Object.keys(out).some((k) => k.startsWith("npm_")),
    false,
    "no npm_* var leaks into the shell",
  );
});

test("preserves the user's real shell environment", () => {
  const out = sanitizeTerminalEnv({
    PATH: "/usr/bin",
    HOME: "/Users/x",
    SHELL: "/bin/zsh",
    LANG: "en_US.UTF-8",
  });
  assert.deepEqual(out, {
    PATH: "/usr/bin",
    HOME: "/Users/x",
    SHELL: "/bin/zsh",
    LANG: "en_US.UTF-8",
  });
});

test("drops undefined holes and never mutates the input", () => {
  const input = { FOO: undefined, BAR: "1" };
  const out = sanitizeTerminalEnv(input);
  assert.equal("FOO" in out, false, "undefined values are dropped");
  assert.equal(out.BAR, "1");
  assert.deepEqual(input, { FOO: undefined, BAR: "1" }, "input object is untouched");
});
