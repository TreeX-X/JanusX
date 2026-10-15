---
{
  "schema": "harness-note/2",
  "id": "764d5d26-8d0d-4307-9b77-af3e22e2ac11",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-29",
  "class": "bug-fix",
  "updated": "2026-10-15T05:29:03.724Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Session cards follow the shared tool palette

## Problem

Dark-only literal fills and white-alpha borders made session content muddy or invisible on the default paper theme. A fixed yellow-brown card later preserved the same excess warmth as the surrounding dock.

## Decision

The right dock maps its local shell surfaces to the centralized tool palette. SessionPanel.module.css uses tool-card for the list card and shell-canvas for the ground. Planche uses the same warm-paper ground as the central workspace (#EFE4C5) and a slightly lighter card (#F2E9D2); dark retains #1c1c1f cards. A near-white dock was rejected because its large area broke continuity with the central paper. Expanded first-prompt and recent-turn sheets mix 84% card with white in light themes and 96% in dark. Existing shell-border hairlines separate the surfaces.

Detail-window SURFACE_CARD and SURFACE_INSET still mix shell-chrome toward shell-text at 94% and 90%. Border and accent roles use shell semantic tokens. These detail fills have not been migrated to the dock palette. Checkpoint and diff surfaces removed from session management do not define a current surface tier.

## Alternatives considered

Changing global shell-card would recolor the central paper workspace and unrelated panels. A dedicated tool palette gives new themes one discoverable resource while limiting the change to tool surfaces. Per-component theme-id branches would duplicate palette ownership and make future themes harder to add.

## Consequences

Tool cards use a restrained lightness step above the shared paper ground; popovers avoid deep yellow-brown fills and hard offset shadows. New themes must provide tool tokens in definition.ts. The dock aliases affect inherited child surfaces; portals use their own shared popover tokens. Detail-window mixes and existing modal scrims remain separate migration work. The sheet mixes require color-mix, supported by Electron 35.

Verification: theme registry, planche contract and theme-audit unit files pass 26 cases. The tool-palette browser fixture mounts the real Sidebar and RightDock, checks both themes' dock and workspace-menu colors, hover and Escape dismissal, and renders a seeded session card. Screenshots are under artifacts/tool-palette. This fixture uses IPC fallbacks and does not establish live Electron validation.
