# Agent Note: Per-terminal provider collections with icon tabs

Status: implemented

## Problem

One shared provider pool feeds every terminal through a binding map, so adding a Claude Anthropic relay also appears in Codex, OpenCode, Pi, and Janus lists where it does not belong. Terminals need differently-shaped credentials, and a shared list forces one shape on all of them. The tab row is text-only while the terminal health card already carries official brand icons. The cost of staying put is cross-terminal credential sprawl with no honest per-terminal home.

## Decision

Each terminal owns an independent provider collection in `llm-config.json` under `terminals.<id>.{providers, defaultId}` for `janus`, `claude`, `codex`, `opencode`, and `pi`; no pool and no binding map remain. The store migrates a v1 document on load by copying the shared pool into every terminal, keeping each terminal's bound default (else the global default), folding a bound model override into the copied default entry, and persisting the v2 shape; corrupt files keep the backup-then-reset path. All CRUD, defaults, chat resolution, model listing, and Claude credential sync are terminal-scoped, with JanusX-internal features (chat, analysis, maintenance, knowledge, roundtable, runtime status) resolving the Janus collection. The engine tab row shows the official brand icon per terminal with a monogram fallback, and each tab holds its own list, default, add/edit form, and live block. The installed-to-dev config sync parses and merges the same v2 shape through the shared document helper. This supersedes the shared-pool part of [the bindings design](./2026-09-18-settings-terminal-llm.md) and the binding rows of [the tabbed follow-up](./2026-09-18-terminal-tabs-per-format-projectors.md); per-format model projectors, backup plus verify, and the `external-cli` naming all stand.

## Alternatives considered

- Keep the shared pool and add per-terminal filters — strongest case is zero migration and zero secret duplication. The driver that rules it out is the explicit request: terminals must own different configs, and a filter over one list still shows every terminal's secrets in one place.
- Migrate the pool only into Janus and leave externals empty — strongest case is no secret duplication. The driver that rules it out is continuity: Claude sync sources and Codex/Pi/Opencode model resolution keep working only when their entries survive the migration; duplication is the documented one-time cost.
- Scope provider types per terminal (Anthropic-only for Claude, and so on) — strongest case is dialect safety by construction. The driver that rules it out is relay reality: OpenAI-compatible relays serve Claude flows and vice versa, so every tab offers all three types with a per-tab sensible default instead.
- Do nothing / reuse the binding map — staying put costs nothing now. The cost is the gap above: one list shared by five terminals with diverging credential needs.
- Share one secret vault with per-terminal references — strongest case is single-copy secrets with per-terminal views. The driver that rules it out is complexity timing: reference integrity (delete propagation, rename fans) needs its own design; duplication today keeps every terminal independently deletable, with dedupe as the revisit.

## Consequences

- **Gains**: Five independent collections with per-terminal defaults; Janus chat, pickers, and background features read the Janus collection; Claude sync reads the Claude collection; icon tabs switch panels; `npm run typecheck` green, `npx vitest run tests/unit/external-cli tests/unit/llm tests/unit/development-llm-config-sync.test.ts tests/unit/llm-proxy-refresh.test.ts tests/unit/remaining-ipc-contract.test.ts` reports 90 passed across 14 files, `npm run test:llm-core` reports 74 passed across 7 files, `npx vitest run` reports 1642 passed with 1 skipped across 236 files, `npm run i18n:check` reports 12 namespaces in sync, and touched `src` files lint with 0 errors.
- **Costs and limits**: Migration copies shared secrets into five collections (one-time duplication); same provider ids across terminals are independent entries that diverge on edit. Credential sync stays Claude-only and projections stay model-only. The e2e island harness mocks the terminal-scoped chat surface. Revisit for vault-backed dedupe, per-terminal type scoping, or project-scoped writes.
