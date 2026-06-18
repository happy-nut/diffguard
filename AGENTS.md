# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

`ai-flow` is a small TypeScript CLI. Its job is to coordinate external coding agents by generating prompts, tracking durable state, and running verification commands.

It is not an autonomous coding agent. Keep the core simple and adapter-oriented.

## Development

```bash
npm install
npm run build
npm run smoke
```

## Conventions

- Runtime code lives in `src/`.
- The CLI should have no runtime dependencies unless there is a strong reason.
- Keep generated project state under `.ai-flow/`.
- Prefer plain Markdown and JSON artifacts so users can inspect and edit everything.
- Do not introduce git worktree as a required workflow.
- Treat Claude and Codex as adapters, not as core dependencies.

## Quality Bar

Every behavior change should include:

- a focused implementation
- a smoke test or command-level verification
- documentation updates when CLI behavior changes

When adding commands, update both `src/cli.ts` help output and `README.md`.
