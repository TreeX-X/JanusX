---
{
  "schema": "harness-note/2",
  "id": "764d5d26-8d0d-4307-9b77-af3e22e2ac11",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-29",
  "class": "bug-fix",
  "updated": "2026-10-15T08:41:15.868Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Session cards follow the shared tool palette

## Problem

Dark-only literal fills and white-alpha borders made session content muddy or invisible on the default paper theme. A fixed yellow-brown card later preserved the same excess warmth as the surrounding dock.

## Decision

The right dock maps its local shell surfaces to the centralized tool palette. Collapsed session rows rest directly on shell-canvas with a soft bottom separator; hover uses shell-hover without an accent border or shadow. Expanded rows use tool-card and a 6px radius to group their details. Planche keeps the same warm-paper ground as the central workspace (#EFE4C5); dark keeps its neutral tool canvas. A near-white dock was rejected because its large area broke continuity with the central paper. Expanded first-prompt and recent-turn sheets mix 84% canvas with white in light themes and 96% in dark, without nested outlines. Codex icons invert locally on the dark theme to retain contrast.

Detail-window SURFACE_CARD and SURFACE_INSET still mix shell-chrome toward shell-text at 94% and 90%. Border and accent roles use shell semantic tokens. These detail fills have not been migrated to the dock palette. Checkpoint and diff surfaces removed from session management do not define a current surface tier.

Expanded list actions separate reading from continuation: View details is a quiet text button on its own row; resume and continue share two equal columns below. All action controls inherit the UI font at 12px, use 6px corners and at least 32px height. Resume uses a neutral hover-role fill when available; secondary actions use a neutral outline. Disabled resume has reduced opacity and retains its explanatory tooltip. When only one continuation choice exists it fills the row. The detail window reuses the same neutral button classes. Accent color is reserved for keyboard focus, rather than coloring both reading and resuming as primary actions. Labels, native-resume eligibility and continuation handlers retain their behavior.

## Alternatives considered

Changing global shell-card would recolor the central paper workspace and unrelated panels. A dedicated tool palette gives new themes one discoverable resource while limiting the change to tool surfaces. Per-component theme-id branches would duplicate palette ownership and make future themes harder to add.

## Consequences

Expanded rows use a restrained lightness step above the shared paper ground; resting rows avoid repeated boxes. Popovers avoid deep yellow-brown fills and hard offset shadows. New themes must provide tool tokens in definition.ts. The dock aliases affect inherited child surfaces; portals use their own shared popover tokens. Detail-window mixes and existing modal scrims remain separate migration work. The sheet mixes require color-mix, supported by Electron 35.

Verification: theme registry, planche contract and theme-audit unit files pass 26 cases. The tool-palette browser fixture mounts the real Sidebar and RightDock, checks both themes' dock and workspace-menu colors, hover and Escape dismissal, and renders a seeded session card. Screenshots are under artifacts/tool-palette. This fixture uses IPC fallbacks and does not establish live Electron validation.
