---
{
  "schema": "harness-note/2",
  "id": "ff0fe2db-3fbe-5071-b9dd-a8a947b756dc",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-06-28",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-06-28-agent-note-agent-desktop-notifications--ff0fe2db.md",
      "sourceHash": "efbab0189be64162e94735697b517a373ce81af788a5378b47d0f9ea5c1bd0cc",
      "originalBodyHash": "fc1181c36b1d442f6ef6425bf22eddc130f11b424e53b4dbda82675b57d9001e",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Agent desktop notifications. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-06-28-agent-notifications.md",
        "sourceHash": "efbab0189be64162e94735697b517a373ce81af788a5378b47d0f9ea5c1bd0cc",
        "originalBodyHash": "fc1181c36b1d442f6ef6425bf22eddc130f11b424e53b4dbda82675b57d9001e"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Agent desktop notifications


## Problem

Long agent runs finish while the user looks elsewhere. Completion, failure, and approval-waiting states surface nowhere unless the window holds focus, so background work stalls on unnoticed checkpoints.

## Decision

A main-side notification service pairs hook-lifecycle collection with renderer fallback. Agent completion, failure, and approval-waiting events raise native system notifications first and degrade to in-app notices when native delivery misses. Activating a notification restores, shows, and focuses the main window at the owning terminal. Hook bridges normalize Claude, Codex, and OpenCode events plus the headless start chain into one service. Users govern switches, success and failure toggles, minimum-duration thresholds, and failure-text truncation from settings.

## Alternatives considered

- Window-only toasts — strongest case needs no native integration. The driver that rules it out is invisibility: background and minimized states miss everything.
- Polling run state from the renderer — strongest case keeps logic in one process. The driver that rules it out is wakefulness cost plus missed transitions between polls.
- Do nothing / reuse terminal output only — staying put ships zero notification surface. The cost is stalled approvals nobody sees.

## Consequences

- **Gains**: Every terminal state needing attention raises a notification with a click path back to its terminal; hook normalization covers all three engines plus headless runs.
- **Costs and limits**: Native delivery varies by platform packaging, so the fallback path must stay first-class; settings surface grows with each new toggle.
