---
{
  "schema": "harness-note/2",
  "id": "2d731f6a-f10c-51dd-bf53-f54917fc91e0",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-settings-opens-on-general-with-per-terminal-llm-bindings--2d731f6a.md",
      "sourceHash": "c07a5b404aa47809952542dd95236ccbd7f45442788a13cee0d39d52297d6987",
      "originalBodyHash": "816d9ac4066586cd91fde37243af83dc0f3c9f39f2ef6c078739c052978b60fd",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Settings opens on general with per-terminal LLM bindings. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ./2026-09-18-terminal-provider-collections.md -> ./2026-09-18-terminal-provider-collections--51ac8035.md",
        "Rebased Markdown destination: ./2026-09-18-terminal-tabs-per-format-projectors.md -> ./2026-09-18-terminal-tabs-per-format-projectors--2dbc27e2.md",
        "Rebased Markdown destination: ./2026-09-18-terminal-provider-collections.md -> ./2026-09-18-terminal-provider-collections--51ac8035.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-18-settings-terminal-llm.md",
        "sourceHash": "e8b35a32a1165687739d17996734a3c5782cc2e291c9ee331e3428229613da4b",
        "originalBodyHash": "25bce2ed4e5ea3f075dd6c90ebb1399833bbc1fd491fc3e37b946510138774ee"
      }
    }
  },
  "updated": "2026-10-17T05:49:57.042Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Settings entry and LLM integration

## Problem

Settings needs a predictable General entry and a model configuration surface that preserves Janus's own choice while allowing external Agents to share connections.

## Decision

Settings opens on General: `AppSettingsModal` defaults `initialTab` to `general`, while team links and updater badges keep their explicit targets.

LLM settings now use one shared channel catalog and independent Agent/model selections. Current storage, migration, official API presets, native configuration and connection application are owned by [the channel design](./terminal-provider-collections.md). Janus uses its own selected model for both chat and background work. An unconfigured Janus binding preserves the unconfigured behavior.

Anthropic remains a first-class `anthropic` authentication type backed by the Messages API and `AnthropicAdapter`. OpenAI-compatible channels explicitly choose Chat Completions or Responses. Native official login remains owned by each external Agent, rather than a new subscription-token manager in JanusX; the settings surface probes sign-in state and guides the user through the Agent's own login before apply — see [native login-first](./native-login-first.md).

## Alternatives considered

The small shared catalog and five binding rows continue to use JSON, a serial queue and atomic writes. SQLite would add a native dependency and migration regime without a requirement for relational queries. Provider-protocol compatibility is checked before external application; protocol conversion requires a gateway and is outside this phase.

## Consequences

General remains the default destination and deep links retain their targets. Native Anthropic and explicit OpenAI protocols stay reusable across the application; the owning channel topic records projection and migration limits without duplicating them here.

## Historical validation

The original settings-entry/Anthropic implementation recorded a successful llm-core build, typecheck, 74 llm-core tests, 13 focused binding/sync tests and locale/lint checks. Its original independent-collection and Claude-only projection limits no longer describe the current channel design. Current phase-one validation is maintained with that owning topic and the implementation report.
