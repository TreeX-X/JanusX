# Wiki Maintenance

Last analyzed: 2026-07-17

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
rg -n "window\.electron\.(invoke|send|on)|ALLOWED_.*CHANNELS" src tests # regression check; expected result is empty
rg -n "export function|export class|export interface|export type" src/main src/renderer/src packages/llm-core/src
rg -n "describe\\(" tests packages/llm-core/tests
```

Then update:

- `README.md` if the read order or major entry points changed.
- `01-architecture.md` if layer boundaries or persistence changed.
- `02-module-map.md` if subsystem ownership changed.
- `03-runtime-flows.md` if behavior or IPC flow changed.
- `04-file-index.md` if files moved or new key files appeared.

## Pending Decisions And Optional Follow-ups

| Item | Why It Matters |
|---|---|
| Decide whether `design/` prototypes remain in the primary repository | Keeps source ownership and archive policy explicit |
| Decide whether Knowledge auto-prune becomes scheduled | It is currently an explicit typed maintenance operation, not an automatic task |
| Decide whether Project lifecycle events need a renderer consumer | Events remain main-internal while renderer synchronization uses guarded polling |
| Confirm whether root distribution needs an explicit LLM Core workspace dependency | Current build and built-Electron smoke pass, but packaged-release layout should be confirmed |
| Large cohesive Blueprint/Terminal views | Named controller boundaries exist; extract more only when a new responsibility warrants it |

## Suggested Agent Opening Prompt

When starting a new JanusX task, ask the Agent to read:

```text
Read wiki/README.md, then only the wiki pages relevant to this task. Verify current source with rg before editing. Follow AGENTS.md file operation rules.
```
