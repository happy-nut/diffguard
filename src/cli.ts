#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./commands.js";

export { main };
export { buildDiffReview, renderLazyDiffBody } from "./build.js";
export { performHttpRequest } from "./server.js";
export type { HttpSendRequest, HttpSendResult } from "./types.js";

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return resolve(entry) === fileURLToPath(import.meta.url);
  }
}

if (isDirectRun()) {
  main();
}
