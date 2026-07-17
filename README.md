# JanusX

JanusX is an Electron desktop workspace for AI-assisted development. It combines workspace and file management, persistent terminals, project runners, checkpoints, LLM providers, knowledge workflows, Office tooling, and Janus Blueprint analysis.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run typecheck
npm run typecheck:strict-unused
npm run test:unit -- --run
npm run typecheck:llm-core
npm run test:llm-core
npm run build
npm run check:package-boundary
```

## Packaging

```bash
npm run package:win
npm run package:mac
npm run package:linux
```

Architecture and module navigation start at [`wiki/README.md`](wiki/README.md). The current optimization status and remaining roadmap are recorded in [`wiki/06-architecture-optimization-plan.md`](wiki/06-architecture-optimization-plan.md).
