---
{
  "schema": "harness-note/2",
  "id": "2dbc27e2-f13e-5fea-8c9e-72141f4cb574",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-tabbed-per-terminal-maintenance-with-per-format-model-project--2dbc27e2.md",
      "sourceHash": "0699bfa848b76d474a878a62d5fcb77f9d4d3841487b57812935589529d4e872",
      "originalBodyHash": "d3ccc1c176c5f19fa86436cb2aeecd4cd1baf12d85ec8a9e774b3c37c81257c3",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Tabbed per-terminal maintenance with per-format model projectors. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ./2026-09-18-settings-terminal-llm.md -> ./2026-09-18-settings-terminal-llm--2d731f6a.md",
        "Rebased Markdown destination: ./2026-09-18-terminal-provider-collections.md -> ./2026-09-18-terminal-provider-collections--51ac8035.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-18-terminal-tabs-per-format-projectors.md",
        "sourceHash": "64e4a85ce1ae9eea81b5f8227c2a20a7a8f0806d5b0602e8f35283c08f254f09",
        "originalBodyHash": "e2aa3b1f21f2866111f029b035900821269a2425b3596d2ffa21e71bf4537348"
      }
    }
  },
  "updated": "2026-10-16T16:49:11.414Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# External CLI naming and configuration projectors

## Problem

The application needs clear ownership of its external CLI code while preserving existing model-only clients during the move to complete shared-channel application.

## Decision

The application-owned domain remains `external-cli`: main modules, shared IPC contracts, preload bridge, renderer service and settings health controls use that name. The legacy sync filename is adopted once and is not written again.

LLM settings now expose Agent selections over shared channels. [The channel design](./terminal-provider-collections.md) owns the v3 catalog, current UI and full connection projector in `src/main/llm/connection-projector.ts`. It projects connection credentials and model selections to Claude, Codex, OpenCode and Pi, with managed-field verification, native restoration and failure recovery. Janus resolves its binding internally. Project-level files remain outside these global writes.

The earlier `TerminalProjectors` API remains available for model-only callers. Codex edits the root `model` in TOML; OpenCode edits root `model` in JSON/JSONC; Pi edits `defaultModel`. It preserves its own ten-backup rotation, reread verification and explicit rollback. OpenCode follows an existing global JSON file first, otherwise JSONC, and creates JSON when neither exists. These legacy APIs do not create full connection receipts; current LLM settings use the new projector instead.

## Alternatives considered

Removing model-only IPC would simplify the surface but break existing callers and their rollback behavior. Keeping those APIs while routing the LLM settings surface through the complete connection projector preserves compatibility and makes drift explicit.

## Consequences

Using a legacy model-only API after applying a full channel changes a managed field. The shared settings surface detects that drift and asks for reapplication. Native restoration refuses to erase externally changed managed fields. DSH keeps its in-session `/model` selection.

## Historical validation

The original domain rename and model-only implementation recorded 59 focused tests across nine files, typecheck, locale checks and touched-file lint. Those results belong to the legacy projector; the current full-connection tests are tracked with the shared channel implementation.
