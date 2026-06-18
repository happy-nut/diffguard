#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

type AgentName = "manual" | "codex" | "claude";
type PromptRole = "worker" | "reviewer";

type FlowConfig = {
  version: 1;
  projectName: string;
  defaultAgent: AgentName;
  verification: {
    commands: string[];
  };
};

type GitSnapshot = {
  branch: string;
  status: string;
  diffStat: string;
  recentCommits: string;
};

type Task = {
  id: string;
  title: string;
  done: boolean;
  raw: string;
};

const FLOW_DIR = ".ai-flow";
const CONFIG_FILE = "config.json";
const STATE_FILE = "state.md";
const TASKS_FILE = "tasks.md";
const DECISIONS_FILE = "decisions.md";

function main(): void {
  const [command = "--help", ...args] = process.argv.slice(2);

  try {
    switch (command) {
      case "init":
        initFlow(args);
        break;
      case "status":
        printStatus();
        break;
      case "next":
        printNext(args);
        break;
      case "prompt":
        printPromptCommand(args);
        break;
      case "report":
        recordReport(args);
        break;
      case "verify":
        runVerification(args);
        break;
      case "run":
        runAgent(args);
        break;
      case "--help":
      case "-h":
      case "help":
        printHelp();
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ai-flow: ${message}`);
    process.exit(1);
  }
}

function initFlow(args: string[]): void {
  const force = args.includes("--force");
  const root = process.cwd();
  const flowPath = join(root, FLOW_DIR);
  mkdirSync(flowPath, { recursive: true });
  mkdirSync(join(flowPath, "prompts"), { recursive: true });
  mkdirSync(join(flowPath, "reports"), { recursive: true });
  mkdirSync(join(flowPath, "logs"), { recursive: true });

  const config: FlowConfig = {
    version: 1,
    projectName: basename(root),
    defaultAgent: "manual",
    verification: {
      commands: detectVerificationCommands(root),
    },
  };

  writeIfMissing(
    join(flowPath, CONFIG_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
    force,
  );
  writeIfMissing(join(flowPath, STATE_FILE), initialState(config), force);
  writeIfMissing(join(flowPath, TASKS_FILE), initialTasks(), force);
  writeIfMissing(join(flowPath, DECISIONS_FILE), initialDecisions(), force);

  console.log(`Initialized ${FLOW_DIR}/ in ${root}`);
  console.log("Next: edit .ai-flow/tasks.md, then run `ai-flow next --agent codex`.");
}

function printStatus(): void {
  ensureInitialized();
  const config = loadConfig();
  const git = readGitSnapshot(process.cwd());
  const tasks = parseTasks(readFlowFile(TASKS_FILE));
  const active = tasks.find((task) => !task.done);
  const completed = tasks.filter((task) => task.done).length;
  const reports = listRecentFiles(join(process.cwd(), FLOW_DIR, "reports"), 5);

  console.log(`# ${config.projectName} status`);
  console.log("");
  console.log(`Branch: ${git.branch || "(unknown)"}`);
  console.log(`Tasks: ${completed}/${tasks.length} complete`);
  console.log(`Next task: ${active ? `${active.id} ${active.title}` : "none"}`);
  console.log("");
  console.log("## Git status");
  console.log(git.status || "clean");
  console.log("");
  console.log("## Diff stat");
  console.log(git.diffStat || "no diff");
  console.log("");
  console.log("## Verification commands");
  for (const command of getVerificationCommands(config)) {
    console.log(`- ${command}`);
  }
  console.log("");
  console.log("## Recent reports");
  if (reports.length === 0) {
    console.log("none");
  } else {
    for (const report of reports) {
      console.log(`- ${relative(process.cwd(), report)}`);
    }
  }
}

function printNext(args: string[]): void {
  ensureInitialized();
  const agent = parseAgent(readOption(args, "--agent") ?? loadConfig().defaultAgent);
  const role = parseRole(readOption(args, "--role") ?? "worker");
  const taskId = readOption(args, "--task");
  const save = !args.includes("--no-save");
  const prompt = buildPrompt({ agent, role, taskId, save });
  console.log(prompt);
}

function printPromptCommand(args: string[]): void {
  const [roleArg = "worker", ...rest] = args;
  const role = parseRole(roleArg);
  const agent = parseAgent(readOption(rest, "--agent") ?? loadConfig().defaultAgent);
  const taskId = readOption(rest, "--task");
  const save = !rest.includes("--no-save");
  const prompt = buildPrompt({ agent, role, taskId, save });
  console.log(prompt);
}

function recordReport(args: string[]): void {
  ensureInitialized();
  const file = readOption(args, "--file");
  const taskId = readOption(args, "--task") ?? "unknown-task";
  const body = file ? readFileSync(file, "utf8") : readStdin();
  if (body.trim().length === 0) {
    throw new Error("No report content provided. Pass --file or pipe report text on stdin.");
  }

  const timestamp = timestampForFile();
  const reportName = `${timestamp}-${sanitizeFilePart(taskId)}.md`;
  const reportPath = join(process.cwd(), FLOW_DIR, "reports", reportName);
  const report = [
    `# Worker Report: ${taskId}`,
    "",
    `Recorded: ${new Date().toISOString()}`,
    "",
    body.trim(),
    "",
  ].join("\n");

  writeFileSync(reportPath, report);
  appendToState(`\n## Report ${timestamp} (${taskId})\n\n${summarizeForState(body)}\n`);
  console.log(`Recorded ${relative(process.cwd(), reportPath)}`);
}

function runVerification(args: string[]): void {
  ensureInitialized();
  const separator = args.indexOf("--");
  const explicitCommand = separator >= 0 ? args.slice(separator + 1).join(" ") : "";
  const config = loadConfig();
  const commands = explicitCommand ? [explicitCommand] : getVerificationCommands(config);
  if (commands.length === 0) {
    throw new Error("No verification commands found. Add them to .ai-flow/config.json.");
  }

  const logPath = join(process.cwd(), FLOW_DIR, "logs", `verify-${timestampForFile()}.log`);
  const chunks: string[] = [];
  let failed = false;

  for (const command of commands) {
    chunks.push(`$ ${command}\n`);
    const result = spawnSync(command, {
      cwd: process.cwd(),
      shell: true,
      encoding: "utf8",
      env: process.env,
    });
    chunks.push(result.stdout ?? "");
    chunks.push(result.stderr ?? "");
    chunks.push(`\nexit: ${result.status ?? 1}\n\n`);
    if ((result.status ?? 1) !== 0) {
      failed = true;
      break;
    }
  }

  writeFileSync(logPath, chunks.join(""));
  console.log(`Verification log: ${relative(process.cwd(), logPath)}`);
  if (failed) {
    console.error("Verification failed.");
    process.exit(1);
  }
  console.log("Verification passed.");
}

function runAgent(args: string[]): void {
  ensureInitialized();
  const [roleArg = "worker", ...rest] = args;
  const role = parseRole(roleArg);
  const agent = parseAgent(readOption(rest, "--agent") ?? loadConfig().defaultAgent);
  if (agent === "manual") {
    throw new Error("Use --agent codex or --agent claude with `run`, or use `prompt` for manual copy.");
  }

  const taskId = readOption(rest, "--task");
  const dryRun = rest.includes("--dry-run");
  const nonInteractive = rest.includes("--print") || rest.includes("--non-interactive");
  const prompt = buildPrompt({ agent, role, taskId, save: true });
  const launch = buildLaunch(agent, prompt, nonInteractive);

  if (dryRun) {
    console.log([launch.command, ...launch.args.map(shellQuote)].join(" "));
    return;
  }

  const result = spawnSync(launch.command, launch.args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

function buildPrompt(options: {
  agent: AgentName;
  role: PromptRole;
  taskId?: string;
  save: boolean;
}): string {
  ensureInitialized();
  const root = process.cwd();
  const config = loadConfig();
  const git = readGitSnapshot(root);
  const tasksText = readFlowFile(TASKS_FILE);
  const tasks = parseTasks(tasksText);
  const task = selectTask(tasks, options.taskId);
  const commands = getVerificationCommands(config);
  const state = readFlowFile(STATE_FILE);
  const decisions = readFlowFile(DECISIONS_FILE);

  const prompt =
    options.role === "reviewer"
      ? reviewerPrompt({ config, git, task, commands, state, decisions })
      : workerPrompt({ config, git, task, commands, state, decisions, agent: options.agent });

  if (options.save) {
    const promptPath = join(
      root,
      FLOW_DIR,
      "prompts",
      `${timestampForFile()}-${task.id}-${options.role}-${options.agent}.md`,
    );
    writeFileSync(promptPath, prompt);
  }

  return prompt;
}

function workerPrompt(input: {
  config: FlowConfig;
  git: GitSnapshot;
  task: Task;
  commands: string[];
  state: string;
  decisions: string;
  agent: AgentName;
}): string {
  return [
    `# AI Flow Worker Task (${input.task.id})`,
    "",
    "You are the implementation worker for this repository. Complete exactly one slice, verify it, and then stop.",
    "",
    "## Task",
    `${input.task.id}: ${input.task.title}`,
    "",
    "## Operating Rules",
    "- Inspect the relevant code before editing.",
    "- Do not expand scope beyond this task unless the current code makes that impossible.",
    "- Prefer existing project patterns over new abstractions.",
    "- Keep the diff small and reviewable.",
    "- Run the listed verification commands, or explain precisely why a command cannot run.",
    "- Finish with the required report format. Do not claim completion without verification evidence.",
    "",
    "## Current Repository State",
    `Project: ${input.config.projectName}`,
    `Branch: ${input.git.branch || "(unknown)"}`,
    "",
    "### Git Status",
    codeBlock(input.git.status || "clean"),
    "",
    "### Diff Stat",
    codeBlock(input.git.diffStat || "no diff"),
    "",
    "## Durable State",
    truncateMarkdown(input.state, 2400),
    "",
    "## Decisions",
    truncateMarkdown(input.decisions, 1600),
    "",
    "## Verification",
    input.commands.length > 0
      ? input.commands.map((command) => `- \`${command}\``).join("\n")
      : "- No commands detected. Identify and run the smallest meaningful validation.",
    "",
    "## Required Final Report",
    "- Changed files",
    "- Verification commands and results",
    "- Behavior completed",
    "- Remaining risks or follow-up tasks",
    "",
  ].join("\n");
}

function reviewerPrompt(input: {
  config: FlowConfig;
  git: GitSnapshot;
  task: Task;
  commands: string[];
  state: string;
  decisions: string;
}): string {
  return [
    `# AI Flow Reviewer Task (${input.task.id})`,
    "",
    "You are the read-focused reviewer. Review the current repository state against the assigned task and report findings first.",
    "",
    "## Review Target",
    `${input.task.id}: ${input.task.title}`,
    "",
    "## Rules",
    "- Do not edit files unless explicitly asked in a later prompt.",
    "- Prioritize correctness bugs, regressions, missing tests, and scope creep.",
    "- Ground each finding in a file path and line number when possible.",
    "- If there are no findings, say that clearly and name the residual risk.",
    "",
    "## Current Repository State",
    `Project: ${input.config.projectName}`,
    `Branch: ${input.git.branch || "(unknown)"}`,
    "",
    "### Git Status",
    codeBlock(input.git.status || "clean"),
    "",
    "### Diff Stat",
    codeBlock(input.git.diffStat || "no diff"),
    "",
    "## Durable State",
    truncateMarkdown(input.state, 2200),
    "",
    "## Decisions",
    truncateMarkdown(input.decisions, 1400),
    "",
    "## Suggested Verification",
    input.commands.length > 0
      ? input.commands.map((command) => `- \`${command}\``).join("\n")
      : "- No commands detected. Suggest targeted validation.",
    "",
    "## Required Output",
    "Findings first, ordered by severity. Then list test gaps and a short summary.",
    "",
  ].join("\n");
}

function buildLaunch(
  agent: Exclude<AgentName, "manual">,
  prompt: string,
  nonInteractive: boolean,
): { command: string; args: string[] } {
  if (agent === "codex") {
    return nonInteractive
      ? { command: "codex", args: ["exec", "--cd", process.cwd(), prompt] }
      : { command: "codex", args: ["--cd", process.cwd(), prompt] };
  }

  return nonInteractive
    ? { command: "claude", args: ["-p", prompt] }
    : { command: "claude", args: [prompt] };
}

function ensureInitialized(): void {
  if (!existsSync(join(process.cwd(), FLOW_DIR, CONFIG_FILE))) {
    throw new Error(`Missing ${FLOW_DIR}/. Run \`ai-flow init\` first.`);
  }
}

function loadConfig(): FlowConfig {
  ensureInitialized();
  return JSON.parse(readFlowFile(CONFIG_FILE)) as FlowConfig;
}

function getVerificationCommands(config: FlowConfig): string[] {
  return config.verification.commands.filter((command) => command.trim().length > 0);
}

function readFlowFile(name: string): string {
  return readFileSync(join(process.cwd(), FLOW_DIR, name), "utf8");
}

function writeIfMissing(path: string, content: string, force: boolean): void {
  if (!force && existsSync(path)) {
    return;
  }
  writeFileSync(path, content);
}

function initialState(config: FlowConfig): string {
  return [
    "# AI Flow State",
    "",
    `Project: ${config.projectName}`,
    `Initialized: ${new Date().toISOString()}`,
    "",
    "## Goal",
    "- Define the current outcome in one or two sentences.",
    "",
    "## Current Status",
    "- Initialized ai-flow.",
    "",
    "## Completed",
    "",
    "## Active",
    "",
    "## Known Risks",
    "",
    "## Reports",
    "",
  ].join("\n");
}

function initialTasks(): string {
  return [
    "# AI Flow Tasks",
    "",
    "Use one checkbox per small vertical slice. Keep each task verifiable.",
    "",
    "- [ ] T001: Define the first implementation slice.",
    "",
  ].join("\n");
}

function initialDecisions(): string {
  return [
    "# AI Flow Decisions",
    "",
    "Record durable project decisions here so new sessions do not depend on chat memory.",
    "",
  ].join("\n");
}

function readGitSnapshot(root: string): GitSnapshot {
  return {
    branch: git(root, ["branch", "--show-current"]),
    status: git(root, ["status", "--short"]),
    diffStat: git(root, ["diff", "--stat"]),
    recentCommits: git(root, ["log", "--oneline", "-5"]),
  };
}

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return "";
  }
  return (result.stdout ?? "").trim();
}

function detectVerificationCommands(root: string): string[] {
  const commands = new Set<string>();
  const packagePath = join(root, "package.json");
  if (existsSync(packagePath)) {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    const packageManager = detectPackageManager(root);
    const scripts = packageJson.scripts ?? {};
    for (const script of ["typecheck", "lint", "test", "build"]) {
      if (scripts[script]) {
        commands.add(packageScriptCommand(packageManager, script));
      }
    }
  }

  if (existsSync(join(root, "pyproject.toml"))) {
    commands.add(existsSync(join(root, "poetry.lock")) ? "poetry run pytest" : "pytest");
  }

  if (existsSync(join(root, "Cargo.toml"))) {
    commands.add("cargo test");
  }

  if (existsSync(join(root, "go.mod"))) {
    commands.add("go test ./...");
  }

  return Array.from(commands);
}

function detectPackageManager(root: string): "npm" | "pnpm" | "yarn" | "bun" {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return "bun";
  return "npm";
}

function packageScriptCommand(manager: "npm" | "pnpm" | "yarn" | "bun", script: string): string {
  if (manager === "npm") {
    return script === "test" ? "npm test" : `npm run ${script}`;
  }
  if (manager === "yarn") {
    return `yarn ${script}`;
  }
  if (manager === "bun") {
    return `bun run ${script}`;
  }
  return `pnpm ${script}`;
}

function parseTasks(content: string): Task[] {
  const tasks: Task[] = [];
  for (const line of content.split(/\r?\n/)) {
    const checkbox = line.match(/^\s*[-*]\s+\[([ xX])\]\s*(?:(T\d+|[A-Za-z][\w-]*)[:.)-]?\s*)?(.*)$/);
    const plain = line.match(/^\s*(T\d+)[:.)-]\s+(.+)$/);
    if (checkbox) {
      const id = checkbox[2] ?? `T${String(tasks.length + 1).padStart(3, "0")}`;
      const title = checkbox[3]?.trim() || "Untitled task";
      tasks.push({ id, title, done: checkbox[1].toLowerCase() === "x", raw: line });
    } else if (plain) {
      tasks.push({ id: plain[1], title: plain[2].trim(), done: false, raw: line });
    }
  }
  return tasks;
}

function selectTask(tasks: Task[], taskId?: string): Task {
  if (tasks.length === 0) {
    throw new Error(`No tasks found in ${FLOW_DIR}/${TASKS_FILE}.`);
  }
  if (taskId) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }
  const next = tasks.find((task) => !task.done);
  if (!next) {
    throw new Error("All tasks are complete.");
  }
  return next;
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function parseAgent(value: string): AgentName {
  if (value === "manual" || value === "codex" || value === "claude") {
    return value;
  }
  throw new Error(`Unsupported agent: ${value}`);
}

function parseRole(value: string): PromptRole {
  if (value === "worker" || value === "reviewer") {
    return value;
  }
  throw new Error(`Unsupported role: ${value}`);
}

function listRecentFiles(dir: string, limit: number): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, limit);
}

function readStdin(): string {
  if (process.stdin.isTTY) {
    return "";
  }
  return readFileSync(0, "utf8");
}

function appendToState(content: string): void {
  const path = join(process.cwd(), FLOW_DIR, STATE_FILE);
  const current = readFileSync(path, "utf8");
  writeFileSync(path, `${current.trimEnd()}\n${content}`);
}

function summarizeForState(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  return lines.map((line) => `- ${line.replace(/^-+\s*/, "")}`).join("\n");
}

function truncateMarkdown(content: string, maxChars: number): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars)}\n\n...[truncated]`;
}

function codeBlock(content: string): string {
  return ["```", content, "```"].join("\n");
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sanitizeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}

function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_./:=+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function printHelp(): void {
  console.log(`ai-flow

Lightweight planning and verification control plane for AI coding agents.

Usage:
  ai-flow init [--force]
  ai-flow status
  ai-flow next [--agent manual|codex|claude] [--role worker|reviewer] [--task T001] [--no-save]
  ai-flow prompt worker|reviewer [--agent manual|codex|claude] [--task T001] [--no-save]
  ai-flow report [--task T001] [--file report.md]
  ai-flow verify [-- <command>]
  ai-flow run worker|reviewer --agent codex|claude [--task T001] [--dry-run] [--print]

Workflow:
  1. ai-flow init
  2. Edit .ai-flow/tasks.md
  3. ai-flow next --agent codex
  4. Give the prompt to a worker, or run: ai-flow run worker --agent claude
  5. ai-flow verify
  6. ai-flow report --task T001 --file worker-report.md
`);
}

main();
