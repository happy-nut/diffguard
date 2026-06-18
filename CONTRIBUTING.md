# Contributing

Thanks for considering a contribution.

## Local Setup

```bash
npm install
npm run build
npm run smoke
```

## Pull Requests

Keep changes small and explain:

- what changed
- why it changed
- how you verified it

For CLI behavior changes, update `README.md` and the built-in help text.

## Project Direction

The project should stay agent-agnostic. New integrations should be adapters around the same durable state model, not hard dependencies in the core workflow.
