---
{
  "schema": "harness-note/2",
  "id": "95812dc5-32c2-5a03-a8bb-5d3a2c6772e3",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-08-06",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-08-06-agent-note-renderer-i18n-pipeline--95812dc5.md",
      "sourceHash": "13e0f6e995237109028e31fe6aadfc35d81b44ece90bf46825c6d99b4a724a46",
      "originalBodyHash": "5e108796544e15433f12234ed3f392c5b0172db4201931ffe8ff80ffe69c0632",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Renderer i18n pipeline. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-08-06-i18n-pipeline.md",
        "sourceHash": "13e0f6e995237109028e31fe6aadfc35d81b44ece90bf46825c6d99b4a724a46",
        "originalBodyHash": "5e108796544e15433f12234ed3f392c5b0172db4201931ffe8ff80ffe69c0632"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---
# Renderer i18n pipeline


## Problem

Renderer copy mixes languages with no convention. Core modules read Chinese-first while later modules ship English-only, and labels, aria text, and service errors each follow author habit. Every new module adds entropy because no shared rule exists.

## Decision

The renderer ships a standard i18n chain: `react-i18next` rendering, parser extraction, and generated key types. User-visible strings live behind namespace lazy loading with a settings-tab switch, zustand state, and store-backed persistence plus hot reload. The extract, type-generation, and key-check steps run inside the release gate, so missing keys fail the build instead of reaching users. Main-process logs, terminal output, and model replies stay outside the pipeline.

## Alternatives considered

- Hand-rolled dictionary module — strongest case is zero dependencies and full control. The driver that rules it out is scale: several hundred strings cross the build-versus-buy line into permanent maintenance.
- English-only freeze — strongest case is zero migration work. The driver that rules it out is the installed base: core surfaces read Chinese-first and a freeze strands them.
- Build-time machine translation — strongest case needs no key discipline from authors. The driver that rules it out is nondeterminism: generated copy breaks typed, reviewable output.
- Do nothing / reuse ad-hoc copy — staying put keeps every file untouched. The cost is compounding mixed-language drift per module.

## Consequences

- **Gains**: Every user-visible string resolves through typed keys under lazy namespaces; the gate trio keeps locales, types, and checks in lockstep.
- **Costs and limits**: New copy requires an extraction pass before typecheck goes green; translation scope stays renderer-only, so main-side text follows separate conventions.
