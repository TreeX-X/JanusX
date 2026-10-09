---
{
  "schema": "harness-note/2",
  "id": "96a2f5cd-166e-4982-a444-7640858f0a5f",
  "kind": "requirement",
  "lifecycle": "draft",
  "created": "2026-09-09",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-09-agent-note-plugin-architecture-forms-selection--96a2f5cd.md",
      "sourceHash": "bb00f53999e5e0e4c094c057c2fee217cd57daa1c39a3eb269f822e4fb9ef17d",
      "originalBodyHash": "b37748cb72d6d93be29cab1980b8e2a879ac24e31c2eb465b9f288f2b027d7c1",
      "category": "formal",
      "reason": "Retains the source requirement in draft lifecycle; body documents Plugin architecture forms selection. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/architecture/2026-09-09-plugin-architecture-forms.md",
        "sourceHash": "bb00f53999e5e0e4c094c057c2fee217cd57daa1c39a3eb269f822e4fb9ef17d",
        "originalBodyHash": "b37748cb72d6d93be29cab1980b8e2a879ac24e31c2eb465b9f288f2b027d7c1"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Plugin architecture forms selection

## Expected behavior

All five layers compile in and hand-write their allowlists: two dozen main handler files, a hand-built preload bridge, unversioned shared contracts, frozen renderer registries, and an explicit packaging allowlist. No plugin lifecycle exists, no per-plugin authorization exists, and no outside-the-package directory exists. Slot registries alone would add flexibility without trust, which equals exposure.

## Proposal

Adopt the forms in delivery order. Now: A in-code contributions (the slot registry in `2026-09-09-island-rightdock-slots.md`) plus E `@janusx/plugin-sdk` (shared types, `definePlugin`, manifest schema, scaffold generator) plus D headless capabilities over existing MCP subprocess entries. Next: C sandboxed UI through a curated `window.janusPlugin` bridge (`sandbox="allow-scripts"` baseline, never top navigation, per-method authorization by plugin id plus permission). Last: B user-directory loading with signatures and an explicit switch, default off. Hold three permanent red lines: plugin JS never enters the main process, plugins never receive a bare renderer bridge, and remote URLs never load plugin code directly. Define manifest v1 (`id`, `version`, `engines` semver, permission allowlist, `contributes`), the discover-validate-activate-deactivate-uninstall lifecycle, and a `plugins:check` verify gate that rejects out-of-manifest calls.

## Alternatives considered

- Directory loading first for release-free customization — strongest case is team PoC and customer variants without a release train. The driver that rules it out is trust inversion: full-permission renderer JS before any signature or version-skew design exists.
- Sandbox iframe for everything — strongest case is one uniform isolation story. The driver that rules it out is composition loss: no shared React components, hooks, or stores across the bridge, with degraded drag, menus, and shortcuts.
- Do nothing / reuse hand-written allowlists — staying put keeps the current review gates sufficient. The cost is that every integration remains a five-layer manual patch and third-party capability stays impossible.

## Acceptance criteria

- [ ] AC-1: The SDK package plus scaffold generates a preview contribution that typechecks under the existing verify chain.
- [ ] AC-2: The main host recognizes an unsigned directory plugin but refuses to execute it with an explicit error plus log.
- [ ] AC-3: One read-only sandboxed sample plugin runs through the curated bridge with timeout and error states.
- [ ] AC-4: The verify gate rejects a manifest-external method call automatically.

## Risks

- Deferring directory-loading security invites half-open states; the host phase must recognize without executing, never partially run.
- Persisted registries meet unknown plugin ids after uninstall; filter with an empty state rather than crashing.
- Keep-alive and bridge memory need measurement before the sandboxed form is declared done.
