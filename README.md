# JanusX

JanusX is an Electron desktop workspace for AI-assisted development. It combines workspace and file management, persistent terminals, project runners, checkpoints, LLM providers, knowledge workflows, Office tooling, and Janus Blueprint analysis.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run verify
```

The unified gate runs both workspace type checks and test suites, strict unused-symbol checks, a production build, the package-boundary check, and a real built-Electron desktop smoke on Windows. The desktop smoke covers startup plus Workspace, Terminal, and Project typed APIs.

Focused end-to-end commands remain separate:

```bash
npm run test:e2e:desktop
npm run test:e2e:island
```

## Packaging

```bash
npm run package:win
npm run package:mac
npm run package:linux
```

Architecture and module navigation start at [`wiki/README.md`](wiki/README.md). The current optimization status and remaining roadmap are recorded in [`wiki/06-architecture-optimization-plan.md`](wiki/06-architecture-optimization-plan.md).
