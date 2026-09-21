---
schema: harness-note/1
id: b74e8ae5-c2c9-4e08-8306-fe1d94e6ebf0
kind: decision
lifecycle: implemented
created: 2026-09-21
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
    reason: Shutdown durability and archived sessions for the session requirement
---

# Agent Note: Session durability with quit flush and archived scope

## Problem

Session writes raced process lifetime in two ways. Mutations persisted fire-and-forget, so quitting mid-turn could lose the tail, and a fresh process wrote before reading: the first terminal creation persisted an empty view over disk state it had never loaded. Worse, a failed load left no mark, so the next write silently replaced possibly valid data with a partial view. Archived sessions existed in storage but in no scope, so merged work looked deleted instead of shelved.

## Decision

All registry writes gate on a memoized load, so a fresh process reads before it ever writes and creation can no longer clobber stored sessions. A failed load pauses writes instead of overwriting, distinguishing missing files (fresh start, writes proceed) from corrupt ones (refused with a loud error). Every successful persist leaves a one-level rollback copy beside the store. The shutdown coordinator flushes the registry after checkpoint finalization, so quit loses no tail. The session panel gains an archived scope with its own cache key, rendering shelved sessions with restore disabled and Continue available.

## Alternatives considered

- Multi-generation backup rotation — strongest case is deeper rollback history for forensics. The driver that rules it out is write frequency: every turn would rotate files for history nobody reads, while one rollback copy covers the corruption window.
- Blocking shutdown on flush failure — strongest case is guaranteed durability. The driver that rules it out is exit reliability: the coordinator already bounds every step, and a hanging disk must never wedge quit.
- Auto-deleting archived sessions after N days — strongest case is bounded storage without user action. The driver that rules it out is evidence value: shelved sessions are the resume source for merged work, and the 200-session cap already bounds growth.
- Do nothing / reuse — keep fire-and-forget writes with no load gate. The cost is the clobber window on every cold start and silent overwrites after load failures.

## Consequences

- **Gains**: cold starts preserve disk sessions, corrupt stores refuse writes with evidence, every persist keeps a rollback copy, quit flushes through the shutdown coordinator, and archived sessions are browsable with Continue. Registry checks cover the clobber guard, corrupt refusal, rollback copies, and archive filtering; project typecheck, touched-file lint, and bilingual key checks pass.
- **Costs and limits**: rollback depth is one copy, not a history; layout and scrollback still do not restore on relaunch; shell recreation on boot stays unscheduled. The worktree metadata store keeps its simpler read-through behavior since git remains its source of truth. Built-app Electron acceptance was not exercised here.
