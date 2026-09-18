# Agent Note: Tabbed per-terminal maintenance with per-format model projectors

Status: implemented

## Problem

The internal domain carries the upstream project's name across channels, types, bridges, and tests, which misattributes ownership of JanusX code. The engine section stacks all five terminals vertically in one shared row shape, so per-terminal file realities have nowhere to live. Only Claude writes live; Codex, OpenCode, and Pi keep bindings with no projection into their differently-shaped config files. The cost of staying put is a misnamed domain plus bindings that never reach the terminals they describe.

## Decision

The internal domain is named `external-cli`: the main package, the shared IPC contract, channels (`external-cli:*`), the preload bridge (`window.electron.externalCli`), the renderer service, the settings row component, and the unit suite all use it, and the sync store persists to `external-cli-sync.json` while adopting the legacy file once on first read. The engine section renders one tab row in registry order with Janus first; each tab owns its binding select, model override, and effective line. Per-format lean projectors own exactly one model key each: Codex edits the top-level `model` line in `config.toml` without a TOML dependency, OpenCode merges top-level `model` into `.json` or edits `.jsonc` surgically with comments preserved, Pi merges `defaultModel` into its global settings, Claude keeps the credential triple and honors the tab's model override, and Janus stays internal-only with no external file. Every write snapshots a timestamped backup rotated to ten and re-reads before reporting success; rollback restores the newest backup and refuses when none exists. OpenCode follows the existing `.json` when both spellings exist and creates `.json` when neither does; project-level files stay manual. This extends [the bindings design](./2026-09-18-settings-terminal-llm.md), which keeps the store, the binding map, and the Anthropic type.

## Alternatives considered

- Keep the upstream name internally — strongest case is zero churn across 28 files. The driver that rules it out is the explicit directive plus ownership hygiene: the borrow travels as mechanism, the name stays with the upstream project.
- Project full credentials per terminal now — strongest case is symmetric sync on day one. The driver that rules it out is schema reality: model names travel across CLIs but secret layouts differ per app and only Claude's triple is known, so secrets stay Claude-only while models project everywhere.
- Add a TOML library for Codex — strongest case is fully general parsing. The driver that rules it out is fit: v1 manages a single top-level key, and the line editor plus read-back verification covers it with no new dependency.
- Adopt SQLite for the binding store — strongest case is transactional multi-table switches. The driver that rules it out is the standing verdict in [the bindings design](./2026-09-18-settings-terminal-llm.md): JSON plus `SerialQueue` plus atomic write already protects a five-row map.
- Do nothing / reuse the vertical matrix with binding-only rows — staying put costs nothing now. The cost is the gap above: a misnamed domain and bindings that never land in Codex, OpenCode, or Pi files.

## Consequences

- **Gains**: No upstream name remains in code (legacy sync file and historical note links excepted); five tabs switch instead of stacking; model writes land per format with backup plus verify; `npm run typecheck` green, `npx vitest run tests/unit/external-cli tests/unit/llm/terminal-bindings.test.ts` reports 59 passed across 9 files, `npm run i18n:check` reports 12 namespaces in sync, and touched `src` files lint with 0 errors.
- **Costs and limits**: Projections are model-only; OpenCode reads and writes the global file while project-level files stay manual; TOML keys nested inside `[table]` sections are out of scope for both read and write; the legacy sync filename is read once and never written again. Revisit when a terminal needs a second owned key, per-CLI credential mapping, or project-scoped writes.
