---
{
  "schema": "harness-note/2",
  "id": "8688b5ab-1f7f-5ff9-ba1b-ef75b7fd5917",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-21",
  "class": "bug-fix",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-21-agent-note-workbench-close-controls-keep-a-30px-hit-area-on-a-14px-visua--8688b5ab.md",
      "sourceHash": "545c2eeef423691aa38dab76ee2152372151f3ec3a03379bc0ba6ea8bf8acab5",
      "originalBodyHash": "671e1f4a160160e9bb8d1e9881ef9ba3f8d22bea866e3adbf13a4b439bfcccd7",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Workbench close controls keep a 30px hit area on a 14px visual. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/bug-fix/2026-09-21-workbench-close-hit-slop.md",
        "sourceHash": "545c2eeef423691aa38dab76ee2152372151f3ec3a03379bc0ba6ea8bf8acab5",
        "originalBodyHash": "671e1f4a160160e9bb8d1e9881ef9ba3f8d22bea866e3adbf13a4b439bfcccd7"
      }
    }
  },
  "updated": "2026-10-20T10:35:14.505Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---
# Workbench close controls keep a stable 30px hit area

## Problem

The original 14px red-circle close controls contracted during a press, allowing edge clicks to cancel. Enlarging the hit target fixed that behavior, but the red-circle appearance and left placement still resembled macOS window controls inside application panels.

## Decision

Blueprint .blueprint-workbench-close and knowledge .closeButton now render a visible close mark in a 28px button at the right of their headers. A positioned ::before layer with inset: -1px keeps a roughly 30px hit area. Hover and active feedback use theme colors without scaling the target. A focus-visible outline supports keyboard navigation. This follows the shared [window-controls](../desktop/window-controls.md) policy for internal dialogs on both platforms.

## Alternatives considered

Keeping the 14px red circle with 8px hit slop retains the old visual rhythm but continues to imply a platform-specific window action. A padded wrapper adds unnecessary markup and changes flex sizing. The 28px button provides a visible target while retaining the established pseudo-element hit expansion.

## Consequences

The visible close target is larger and stays the same size throughout a press. Headers must retain at least 1px clearance for hit slop. Both selectors use order: 100 and margin-left: auto to keep the action at the right without rearranging existing content. Revisit geometry if header spacing or wrapping changes.

Verification: tests/unit/planche-theme.test.ts checks the visible mark, right placement, 28px box, 1px expansion and absence of active scaling. The shared dialog and floating-panel actions are exercised in tests/e2e/window-controls.spec.ts. The broader planche suite currently has an unrelated source assertion for the pre-existing FileEditor refactor.
