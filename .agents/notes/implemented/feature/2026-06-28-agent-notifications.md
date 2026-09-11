# Agent Note: Agent desktop notifications

Status: implemented

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
