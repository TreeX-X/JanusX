# Wiki Maintenance

Last analyzed: 2026-06-30

## Purpose

This wiki should reduce fresh-session analysis time. It must stay short enough for Agents to read quickly and specific enough to route code changes to the right files.

## Update Triggers

Update this wiki when any of these change:

- a new top-level subsystem is added,
- an IPC channel group is added/renamed/removed,
- persistence location changes,
- a major UI workflow changes,
- a file is split/renamed and existing tables become misleading,
- new test areas are added,
- project commands or package workspace layout changes.

## Maintenance Rules

1. Keep `wiki/README.md` as the reading index.
2. Add new details to the subsystem page, not all pages.
3. Keep claims tied to file paths.
4. Mark uncertain or planned behavior as `Pending Confirmation`.
5. Do not duplicate long code snippets. Link to source paths and describe responsibilities.
6. Prefer tables for file ownership and flows for runtime behavior.
7. Update `Last analyzed` date when a page is materially reviewed.

## Fast Refresh Checklist

Run these inspections before updating:

```bash
rg --files
rg -n "register.*Handlers|ipcMain\\.handle|ipcMain\\.on" src/main
rg -n "ALLOWED_.*CHANNELS|exposeInMainWorld" src/preload/index.ts
rg -n "export function|export class|export interface|export type" src/main src/renderer/src packages/llm-core/src
rg -n "describe\\(" tests packages/llm-core/tests
```

Then update:

- `README.md` if the read order or major entry points changed.
- `01-architecture.md` if layer boundaries or persistence changed.
- `02-module-map.md` if subsystem ownership changed.
- `03-runtime-flows.md` if behavior or IPC flow changed.
- `04-file-index.md` if files moved or new key files appeared.

## Known Gaps To Verify Later

| Gap | Why It Matters |
|---|---|
| Root `README.md` is minimal and still named SwitchX | New human contributors may not get current JanusX context |
| No e2e test files were observed despite `test:e2e` script | Confirm whether Playwright coverage exists elsewhere before relying on it |
| Blueprint renderer imports types from `src/main/janus/types.ts` | Safe while type-only/pure; risky if Node/Electron runtime imports are added |
| Large UI orchestration in `BlueprintCanvas.tsx` | High change risk; consider splitting only when a real feature requires it |

## Suggested Agent Opening Prompt

When starting a new JanusX task, ask the Agent to read:

```text
Read wiki/README.md, then only the wiki pages relevant to this task. Verify current source with rg before editing. Follow AGENTS.md file operation rules.
```

