# Agent Note: Third-party plugin import and debug flow

Status: proposed

## Problem

The plugin forms decision stays on paper without a version-one path. No import flow exists, no sandbox carrier exists, and no debug loop exists. Third parties cannot build against a frozen contract, and users cannot install a folder without hand surgery. The B-plus-C combination needs a concrete first slice.

## Proposal

Ship folder-only import in three phases. Phase 0 freezes the package shape (`manifest.json` at most 64KB with zod validation, `dist/index.html` plus `index.js` at most 5MB, no CDN links) plus a scaffold generator and the main-side host (`manifest`, `paths`, `discovery`, `installer`, `registry`, `logs`, `protocol`, `plugin-handlers` with metadata-only IPC). Phase 1 adds the settings import UI over the existing directory dialog, a permission-confirm modal with risk colors, copy-or-link install into the user-data plugins root with enablement mounting L1 slots through register and unregister, and the sandbox frame (`sandbox="allow-scripts"` without same-origin, `plugin://` read-only file protocol, five-method bridge: workspace read, workspace-scoped file read, slots, toast, per-plugin key-value storage). Phase 2 hardens debugging: linked dev directories, reload keys, bridge tracing, per-plugin logs, crash fusing at three consecutive crashes, and permission-upgrade reconfirm. Refuse at install time anything outside the allowlist (workspace write, network, terminal, model backends) plus zip packages, signatures, and marketplaces.

## Alternatives considered

- Zip-first packaging — strongest case matches how users already pass folders around. The driver that rules it out is new attack surface: decompression plus zip-slip guards before the basic loop proves itself; folders plus an open-directory button cover debugging.
- Direct renderer import of plugin JS — strongest case is full React composition power for complex plugins. The driver that rules it out is privilege collapse: third-party code with full bridge rights; keep it behind a dev-only switch later.
- Do nothing / reuse hand-built integration — staying put keeps every current gate sufficient. The cost is that the B-plus-C decision never becomes buildable.

## Acceptance criteria

- [ ] A scaffold-built folder travels import, authorize, enable, use, disable, uninstall with no restart.
- [ ] Six bad-package error codes demonstrate end to end; overprivileged bridge calls refuse with log entries; three crashes auto-disable.
- [ ] The debug quartet works: linked-directory hot reload, bridge trace, log drawer, detached devtools.
- [ ] Verify plus the plugin gate stays green with new desktop cases; main holds no variable import; the iframe carries neither same-origin nor top-navigation.

## Risks

- No-zip frictions real folder sharing; answer with a vouchered later version, not scope creep now.
- iframe ceilings on drag, menus, and shortcuts; push theme tokens down the bridge and document the boundary.
- Custom-protocol interception by security software; keep the localhost static-server fallback behind a URL resolver.
- Permission creep on every feature request; each new bridge method needs a manifest entry plus review plus gate update.
