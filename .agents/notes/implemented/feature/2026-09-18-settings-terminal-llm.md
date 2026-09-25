---
schema: harness-note/1
id: 2d731f6a-f10c-51dd-bf53-f54917fc91e0
kind: decision
lifecycle: implemented
created: 2026-09-18
class: feature
---
# Agent Note: Settings opens on general with per-terminal LLM bindings

Status: implemented

## Problem

Settings lands on the notifications tab while language, CLI health, and updater live under general, so the first open misses the entry most users need. The LLM engine holds a single global provider pool with only OpenAI-compatible and Vertex types; Janus, Claude, Codex, OpenCode, and Pi share one default with no per-terminal binding, Janus chat follows the global default with no independent choice, Anthropic-native endpoints have no first-class type, and only Claude Code syncs outward. The cost of staying put is repeated manual provider juggling per terminal plus no honest home for Anthropic keys.

## Decision

Settings opens on general: `AppSettingsModal` defaults `initialTab` to `general` and the Titlebar logo entry opens `general`, while team deep-links and the updater badge keep their explicit targets. Provider storage is namespaced per terminal under `terminals.<id>.{providers, defaultId}` for `janus`, `claude`, `codex`, `opencode`, and `pi`, migrated once from the first-cut shared pool; the per-terminal shape, the icon tab row, and each tab's own list plus form live in [the collections design](./2026-09-18-terminal-provider-collections.md). Janus chat resolves the Janus collection default, so an empty Janus collection preserves the unconfigured behavior. Anthropic ships as a first-class `anthropic` auth type with an `AnthropicAdapter` on the Messages API (`x-api-key` plus `anthropic-version 2023-06-01`) backed by `@ai-sdk/anthropic@1`, and Claude sync accepts `api-key` and `anthropic` credentials alike from the Claude collection.

## Alternatives considered

- Adopt SQLite as the binding store for full cc-switch parity — strongest case is transactional multi-table switches plus the upstream migration regime. The driver that rules it out is fit: the repo persists user state as JSON through `SerialQueue` plus atomic write, and a native dependency plus migrations for a five-row map buys nothing the existing primitives do not already protect.
- Write live projector files for every CLI now (Codex `config.toml`, OpenCode JSON, Pi settings, Janus config) — strongest case is symmetric sync on day one. The driver that rules it out is dialect risk: each target owns a different schema and backup story, and each deserves its own applier plus acceptance pass; bindings land first with Claude as the only live projector, matching the phased rollout.
- Implement Anthropic as an OpenAI-compatible preset with Anthropic defaults — strongest case is zero new dependencies and immediate reuse of the chat-completions path. The driver that rules it out is wire honesty: native Anthropic serves Messages API with different headers and paths, so an OpenAI payload against it fails; the dedicated adapter models what exists.
- Do nothing / reuse the global default for every terminal — staying put costs nothing now. The cost is the gap above: no per-terminal home, no Janus independence, no Anthropic type, and Claude sync stays default-only.

## Consequences

- **Gains**: Settings lands on general; five terminals resolve providers independently with Janus effective in chat; Anthropic providers save, test, and sync to Claude; `npm run build:llm-core` green, `npm run typecheck` green, `npm run test:llm-core` reports 74 passed across 7 files, `npx vitest run tests/unit/llm/terminal-bindings.test.ts tests/unit/cc-switch/llm-sync.test.ts tests/unit/cc-switch/sync-state.test.ts` reports 13 passed, `npm run i18n:check` reports 12 namespaces in sync, and touched `src` files lint clean.
- **Costs and limits**: Codex, OpenCode, and Pi project exactly one model key each through per-format projectors, and Janus stays internal-only; details live in [the tabbed follow-up](./2026-09-18-terminal-tabs-per-format-projectors.md) with collections in [the collections design](./2026-09-18-terminal-provider-collections.md). Sync state stays Claude-scoped in `external-cli-sync.json` (legacy file adopted once). The Anthropic adapter adds `@ai-sdk/anthropic@1` to the llm-core closure. Revisit when a second CLI needs credential sync or when the tab row outgrows a handful of terminals.
