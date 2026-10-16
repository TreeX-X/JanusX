---
{
  "schema": "harness-note/2",
  "id": "51ac8035-0111-5900-8bbd-fe3f81ccd03b",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-per-terminal-provider-collections-with-icon-tabs--51ac8035.md",
      "sourceHash": "cb19ef1d6f3ac1969beb5bacd96cee7ca7aed85320febc71402b3a9fbfdb0e03",
      "originalBodyHash": "9e6a76257d691b2e85df124b6261a4cb3e837b22964e57dba7ae98fecb9c7e51",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Per-terminal provider collections with icon tabs. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ./2026-09-18-terminal-tabs-per-format-projectors.md -> ./2026-09-18-terminal-tabs-per-format-projectors--2dbc27e2.md",
        "Rebased Markdown destination: ./2026-09-18-settings-terminal-llm.md -> ./2026-09-18-settings-terminal-llm--2d731f6a.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-18-terminal-provider-collections.md",
        "sourceHash": "debfe88a2de5a208ebac49e0f68a8d3b816a2b60c3af33ce2206afcd83c6132e",
        "originalBodyHash": "55d5c057b8a9157cdff39f0515583e820646ea61cec4c6a917dd27007d18be78"
      }
    }
  },
  "updated": "2026-10-16T16:49:11.414Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Shared channels and per-Agent model selections

## Problem

Maintaining five independent provider collections duplicates endpoint, credential and model edits. The same model can also be supplied by different channels, so a model ID alone cannot identify a connection. The first implementation additionally projected only a model name to Codex, OpenCode and Pi; choosing a channel did not actually switch their connection.

## Decision

The first phase stores one channel catalog in `llm-config.json` v3 under `providers`, with independent `bindings` for Janus, Claude, Codex, OpenCode and Pi. A binding selects a channel ID and model ID, or uses the external Agent's native configuration. Janus resolves its chosen model for chat and background features before adapter defaults. Channel IDs remain distinct even when they offer the same model.

The settings surface has Agent and Channel pages. Agent rows show “model · channel”; selecting an Agent exposes its source and model controls. The channel editor supplies official API presets, CPA and custom endpoints, multiple model IDs, a default model, masked credentials, connection testing and existing Vertex authentication options. Editing drafts survive page switches. A referenced channel cannot be deleted until its Agents switch sources. The surface uses existing shell/settings tokens in light and dark themes.

Channels declare their actual protocol. Janus supports Chat Completions, Responses, Anthropic and Vertex; Claude requires Anthropic Messages, Codex requires Responses, and OpenCode/Pi accept the first three. Incompatible or disabled channels cannot be applied. The OpenAI adapter explicitly selects `chat()` or `responses()`; SDK v3's default Responses behavior must not redirect generic Chat Completions relays. Tests send a small request to the declared endpoint using the configured model.

Applying an external selection writes its connection and model, verifies the managed fields, then persists the binding. Claude receives its endpoint, API key and model; Codex receives a dedicated Responses provider and selection; OpenCode receives a dedicated provider, models and selection; Pi receives its model-provider definition and default provider/model. The reserved namespace is `janusx_managed`. Existing unrelated settings and JSONC comments remain. Codex edits root assignments and a marked provider table, parses the resulting TOML and refuses unsupported edits.

A per-Agent journal in `janusx/llm-connections` records original and applied fields. A bounded recovery snapshot retains pre-operation file bytes. Normal write/verification/binding failures restore the preceding bytes; native restoration removes only managed overrides and restores the original values. If managed fields changed outside JanusX, native restoration refuses to overwrite them; explicitly reapplying a channel establishes the managed values again. Channel edits and detected file drift mark external selections as needing reapplication. They do not silently rewrite running Agents.

Native configuration uses the Agent's existing settings/sign-in; it does not create an OAuth session or copy subscription tokens. Start a new session after applying. Environment variables and project settings may override global configuration. Current native home overrides are respected; remote environments, routing, protocol conversion and failover belong to phase two. CPA remains responsible for accounts and quotas.

## Migration and persistence

v1 shared pools retain their bindings and model overrides. v2 collections fold matching copies of the same channel ID, union their model lists and keep each Agent's model choice. Conflicting same-ID connections get deterministic suffixed IDs; Janus IDs are retained first to preserve existing chat references. Different channel IDs are never folded merely because they share a model.

The complete legacy document is retained as `llm-config.json.pre-v3` before migration; corrupt JSON is renamed before reset. Serial mutation queues and atomic writes protect the shared catalog. Development-profile import uses the same normalizer, preserves local-only channels and selections absent from a v2 source, and drops external application receipts. Credentials remain local configuration data; this phase does not add a vault or a second account manager.

## Alternatives considered

Keeping independent collections avoids reference integrity rules but makes every credential rotation a repeated edit. A shared catalog plus deletion guards and independent selections fits the small existing JSON store without a database migration. An always-running gateway could centralize live credentials and convert protocols, but adds runtime availability, streaming and authentication responsibilities; it is deferred with routing/failover.

## Consequences

One catalog replaces repeated credential edits while each Agent keeps its own model selection. Global files are configured, not every existing process or project override. There is no live-provider availability guarantee or automatic official login. Native mode with no journal leaves pre-existing configuration intact, including configurations written by older JanusX projectors. An abrupt process/OS failure during a multi-file write can leave a pending receipt; the recovery snapshot is available, while automatic crash recovery is deferred. Disk failures can also prevent best-effort restoration.

## Verification

The phase-one verification covers shared-channel migration and deletion guards, independent model choices, direct protocol selection, all four external formats, JSONC preservation, native restoration, externally edited fields and rollback on binding failure. The focused command `npx vitest run tests/unit/llm tests/unit/development-llm-config-sync.test.ts tests/unit/llm-proxy-refresh.test.ts tests/unit/external-cli tests/unit/remaining-ipc-contract.test.ts` passed 169 tests across 20 files; `npm run test:llm-core` passed 80 tests across seven files. `npx playwright test tests/e2e/llm-configuration.spec.ts --project=island --workers=2` passed nine scenarios with `JANUS_E2E_PORT=41742` and local addresses excluded from the system proxy. UI tests use isolated mock IPC and projector tests use temporary homes. Light/dark screenshots at widths 1280 and 640 were inspected. Strict unused/type checks, locale checks and production build were run; theme audit retains unrelated existing findings.

The installed official Codex CLI accepted an isolated configuration containing `model_provider`, `wire_api = "responses"`, `experimental_bearer_token` and `requires_openai_auth = false` via `codex features list` (exit 0). The online documentation host returned HTTP 403. Pi's custom-provider shape was checked against the published package's `docs/models.md`. No real provider credentials were used for end-to-end network validation.

## Historical context

The earlier v2 design intentionally copied the old shared pool into five terminal collections. Its recorded validation was 90 focused unit tests, 74 llm-core tests and 1,642 repository unit tests with one skipped; these are historical results, not verification of v3. The [settings entry](./settings-terminal-llm.md) owns general settings behavior and the [projector topic](./terminal-tabs-per-format-projectors.md) owns the retained legacy model-only APIs.
