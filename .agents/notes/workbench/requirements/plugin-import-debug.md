---
{
  "schema": "harness-note/2",
  "id": "80e8b427-d263-42f4-b7cd-8313548c9e2a",
  "kind": "requirement",
  "lifecycle": "draft",
  "created": "2026-09-09",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-09-agent-note-third-party-plugin-import-and-debug-flow--80e8b427.md",
      "sourceHash": "43a87cbb0bd9a7a449a07a8ebee9b26ab8e18fca5f74cf342bcc0dfa44da3d90",
      "originalBodyHash": "39d95f58874202af27bc65c7ee5ca9aac3f88464ae3765a8c1a2d0473cc4f9a7",
      "category": "formal",
      "reason": "Retains the source requirement in draft lifecycle; body documents Third-party plugin import and debug flow. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/feature/2026-09-09-plugin-import-debug.md",
        "sourceHash": "43a87cbb0bd9a7a449a07a8ebee9b26ab8e18fca5f74cf342bcc0dfa44da3d90",
        "originalBodyHash": "39d95f58874202af27bc65c7ee5ca9aac3f88464ae3765a8c1a2d0473cc4f9a7"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Third-party plugin import and debug flow

## Expected behavior

The plugin forms decision stays on paper without a version-one path. No import flow exists, no sandbox carrier exists, and no debug loop exists. Third parties cannot build against a frozen contract, and users cannot install a folder without hand surgery. The B-plus-C combination needs a concrete first slice.

## Proposal

Ship folder-only import in three phases. Phase 0 freezes the package shape (`manifest.json` at most 64KB with zod validation, `dist/index.html` plus `index.js` at most 5MB, no CDN links) plus a scaffold generator and the main-side host (`manifest`, `paths`, `discovery`, `installer`, `registry`, `logs`, `protocol`, `plugin-handlers` with metadata-only IPC). Phase 1 adds the settings import UI over the existing directory dialog, a permission-confirm modal with risk colors, copy-or-link install into the user-data plugins root with enablement mounting L1 slots through register and unregister, and the sandbox frame (`sandbox="allow-scripts"` without same-origin, `plugin://` read-only file protocol, five-method bridge: workspace read, workspace-scoped file read, slots, toast, per-plugin key-value storage). Phase 2 hardens debugging: linked dev directories, reload keys, bridge tracing, per-plugin logs, crash fusing at three consecutive crashes, and permission-upgrade reconfirm. Refuse at install time anything outside the allowlist (workspace write, network, terminal, model backends) plus zip packages, signatures, and marketplaces.

## Alternatives considered

- Zip-first packaging — strongest case matches how users already pass folders around. The driver that rules it out is new attack surface: decompression plus zip-slip guards before the basic loop proves itself; folders plus an open-directory button cover debugging.
- Direct renderer import of plugin JS — strongest case is full React composition power for complex plugins. The driver that rules it out is privilege collapse: third-party code with full bridge rights; keep it behind a dev-only switch later.
- Do nothing / reuse hand-built integration — staying put keeps every current gate sufficient. The cost is that the B-plus-C decision never becomes buildable.

## Acceptance criteria

- [ ] AC-1: A scaffold-built folder travels import, authorize, enable, use, disable, uninstall with no restart.
- [ ] AC-2: Six bad-package error codes demonstrate end to end; overprivileged bridge calls refuse with log entries; three crashes auto-disable.
- [ ] AC-3: The debug quartet works: linked-directory hot reload, bridge trace, log drawer, detached devtools.
- [ ] AC-4: Verify plus the plugin gate stays green with new desktop cases; main holds no variable import; the iframe carries neither same-origin nor top-navigation.

## Risks

- No-zip frictions real folder sharing; answer with a vouchered later version, not scope creep now.
- iframe ceilings on drag, menus, and shortcuts; push theme tokens down the bridge and document the boundary.
- Custom-protocol interception by security software; keep the localhost static-server fallback behind a URL resolver.
- Permission creep on every feature request; each new bridge method needs a manifest entry plus review plus gate update.
