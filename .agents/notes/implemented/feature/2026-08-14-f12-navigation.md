# Agent Note: F12 code navigation workbench

Status: implemented

## Problem

The file viewer shows code without understanding it. Jumping to a declaration means manual search across files, and large projects make definition hunts the dominant navigation cost.

## Decision

The viewer grows a full definition chain behind one key. Stable file identities back every editor with cross-tab model retention, so targets survive viewer unmounts. TypeScript and JavaScript resolve through the editor worker across files with automatic tab creation and selection landing; C and C++ resolve through per-workspace language sessions that rebuild on failure and recycle on exit. Unsaved buffers participate through synchronization before resolution, and consecutive requests carry incrementing ids that discard stale results. Embedded and standalone hosts share one navigation contract and one target store.

## Alternatives considered

- Keybinding-only jump — strongest case ships in an afternoon. The driver that rules it out is chain depth: stable identity, retention, creation, and landing each need their own mechanism.
- External editor handoff — strongest case borrows a complete navigator. The driver that rules it out is context exile: navigation leaves the reviewing workspace.
- Do nothing / reuse text search — staying put keeps the viewer simple. The cost is definition hunts on every unfamiliar codebase.

## Consequences

- **Gains**: One key traverses same-file and cross-file definitions in both hosted modes with multi-result and history seams reserved.
- **Costs and limits**: Project configuration and alias resolution stay unparsed under generic compiler options; workspace scans cap file counts and sizes for responsiveness.
