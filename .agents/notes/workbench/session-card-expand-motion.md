---
{
  "schema": "harness-note/2",
  "id": "106b60b4-5462-4242-b28b-030f6649a78b",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-06",
  "class": "bug-fix",
  "updated": "2026-10-16T15:30:00Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Session card expansion and responsive toggles

## Problem

Session cards need continuous open/close motion without making each toggle render the entire list. Keeping every unopened body mounted adds prompt layout, copy controls and action buttons to large lists. Reopening also used to request the full detail again, including when the prior request was still pending. These costs can delay a toggle independently of the animation duration.

## Decision

`SessionCard` in `src/renderer/src/components/SessionPanel.tsx` uses React memoization with stable parent callbacks; toggling changes props only for the cards opening and closing. Collapsed cards receive no changing live-event tick. The grid wrapper stays mounted, but its body mounts on first expansion and is retained thereafter for reversible exit motion. `.expand` in `SessionPanel.module.css` animates `0fr → 1fr` in 160 ms with `cubic-bezier(0.2, 0.8, 0.2, 1)`; opacity takes 120 ms and the -4 px translation and chevron take 160 ms. Closed bodies remain inert. Reduced motion disables these transitions.

Each card retains one detail-request promise, including its successful result. Reopening reuses pending or completed reads when session identity, updated time, turn count, status, transcript path and the panel event tick are unchanged. Changed summaries or debounced live events trigger another read; the prior preview remains visible during refresh. Null or rejected results clear the cache for a subsequent retry. Effect cleanup prevents superseded results from replacing the current preview. Fetch completion never controls the expanded flag. Surface styling remains owned by [Session surfaces derive from the chrome token instead of hand-written literals](./session-card-surface.md).

## Alternatives considered

- Conditional mount with a keyframe entrance — strongest case is the smallest diff and no retained DOM. The driver that rules it out is the exit: collapse still snaps, and fading in over an instantly-tall block is not an expand.
- JS height measurement (scrollHeight, then transition to auto) — strongest case is animating to the natural height even when content reflows mid-open. The driver that rules it out is machinery: resize handling and transition-end bookkeeping where one CSS property covers both directions.
- `max-height` transition on a guessed ceiling — strongest case is zero structural change. The driver that rules it out is easing distortion: a ceiling well above the body spends most of the duration in invisible height, so the motion reads slow then abrupt.
- Do nothing / keep the pop — no code and no motion cost. That is the entire benefit; the chevron keeps rotating against a body that does not move.

## Consequences

- **Gains**: open and close each run as one continuous height, fade, and chevron motion on the shared panel curve, so the cards below glide to their new positions instead of snapping and a toggle mid-scroll keeps the list's place.
- **Costs and limits**: visited bodies and one request result per visited card remain until unmount. This reduces unopened DOM cost but is not list virtualization. Background summary replacements can still rerender cards, and a first detail read still transfers the full ledger through IPC. No claim is made about native Electron latency under real main-process load; the browser fixture isolates renderer behavior.
- **Verification (2026-10-16)**: `npm run typecheck` and `npx eslint src/renderer/src/components/SessionPanel.tsx` pass. `npx vitest run tests/unit/worktree-store.test.ts tests/unit/planche-theme.test.ts tests/unit/session-turn-merge.test.ts tests/unit/external-session-sync.test.ts --maxWorkers=2` passes 24 tests. The browser fixture contains 200 long-prompt summaries; [scroll pagination](../sessions/records/session-open-stall.md) now mounts the first 20 only. `tests/e2e/session-card-performance.spec.ts` covers unresolved reads permitting close/reopen with one IPC, completed-result reuse, live refresh retaining prose, failed-read retry and single-card expansion, alongside scroll pagination.
