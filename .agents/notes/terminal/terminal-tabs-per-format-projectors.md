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
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Tabbed per-terminal maintenance with per-format model projectors


## Problem

The internal domain carries the upstream project's name across channels, types, bridges, and tests, which misattributes ownership of JanusX code. The engine section stacks all five terminals vertically in one shared row shape, so per-terminal file realities have nowhere to live. Only Claude writes live; Codex, OpenCode, and Pi resolve models through a shared pool with no projection control of their own. The cost of staying put is a misnamed domain plus terminals that cannot own their configs.

## Decision

The internal domain is named `external-cli`: the main package, the shared IPC contract, channels (`external-cli:*`), the preload bridge (`window.electron.externalCli`), the renderer service, the settings row component, and the unit suite all use it, and the sync store persists to `external-cli-sync.json` while adopting the legacy file once on first read. The engine section renders one tab row in registry order with Janus first; each tab owns its provider collection, default, add/edit form, and file block. Per-format lean projectors own exactly one model key each: Codex edits the top-level `model` line in `config.toml` without a TOML dependency, OpenCode merges top-level `model` into `.json` or edits `.jsonc` surgically with comments preserved, Pi merges `defaultModel` into its global settings, Claude keeps the credential triple from its own collection, and Janus stays internal-only with no external file. Every write snapshots a timestamped backup rotated to ten and re-reads before reporting success; rollback restores the newest backup and refuses when none exists. OpenCode follows the existing `.json` when both spellings exist and creates `.json` when neither does; project-level files stay manual. Provider collections replace the earlier binding rows; the store shape lives in [the collections design](./terminal-provider-collections.md), which this note otherwise extends.

## Alternatives considered

- Keep the upstream name internally — strongest case is zero churn across 28 files. The driver that rules it out is the explicit directive plus ownership hygiene: the borrow travels as mechanism, the name stays with the upstream project.
- Project full credentials per terminal now — strongest case is symmetric sync on day one. The driver that rules it out is schema reality: model names travel across CLIs but secret layouts differ per app and only Claude's triple is known, so secrets stay Claude-only while models project everywhere.
- Add a TOML library for Codex — strongest case is fully general parsing. The driver that rules it out is fit: v1 manages a single top-level key, and the line editor plus read-back verification covers it with no new dependency.
- Adopt SQLite for the binding store — strongest case is transactional multi-table switches. The driver that rules it out is the standing verdict in [the bindings design](./settings-terminal-llm.md): JSON plus `SerialQueue` plus atomic write already protects a five-row map.
- Do nothing / reuse the vertical matrix with binding-only rows — staying put costs nothing now. The cost is the gap above: a misnamed domain and bindings that never land in Codex, OpenCode, or Pi files.

## Consequences

- **Gains**: No upstream name remains in code (legacy sync file and historical note links excepted); five tabs switch instead of stacking; model writes land per format with backup plus verify; `npm run typecheck` green, `npx vitest run tests/unit/external-cli tests/unit/llm/terminal-bindings.test.ts` reports 59 passed across 9 files, `npm run i18n:check` reports 12 namespaces in sync, and touched `src` files lint with 0 errors.
- **Costs and limits**: Projections are model-only; OpenCode reads and writes the global file while project-level files stay manual; TOML keys nested inside `[table]` sections are out of scope for both read and write; the legacy sync filename is read once and never written again. Revisit when a terminal needs a second owned key, per-CLI credential mapping, or project-scoped writes.
