# Agent Note: Claude idle nudge no longer stains the tab orange

Status: implemented

## Problem

A Claude terminal finishes its turn and settles grey (`wait`), then turns orange (`needs-input`) with no question to answer and stays orange. Per the Claude hook contract, `Notification` with the `idle_prompt` matcher fires about 60 seconds after a finished response while the user has not typed. It signals an idle session awaiting the next prompt, not a blocked turn. The coordinator maps every Claude `Notification` to attention and the status writer maps it to `needs-input`, so each idle nudge presents as pending user work across the tab dot, sidebar pill, and attention toast. Attention has no timeout and no read-back path, so the stain persists until the next hook event, which never arrives for a completed task.

## Decision

The Claude `Notification` subscription carries two entries, one per matcher, and each installed hook command bakes the matcher that fired it into argv (`--matcher` on posix, `-Matcher` on the Windows sender). The client forwards the value as a top-level payload field, and the coordinator resolves it before the raw payload. A Claude `idle_prompt` that arrives with no open turn is dropped as `idle-without-active-turn` before status resolution, so the tab keeps its settled `wait`. A mid-turn idle still has its turn open and still raises attention, which preserves the real AskUserQuestion wait. `permission_prompt` stays ungated so a true approval never depends on turn tracking, and janus/pi idle matchers stay ungated because their extensions emit them only for genuine prompt UI.

## Alternatives considered

- Drop `idle_prompt` from the Claude subscription entirely — strongest case is zero new protocol and zero false positives. The driver that rules it out is the loss of the mid-turn question signal: a Claude wait on `AskUserQuestion` arrives through this matcher, and ungated removal blinds that path.
- Map every Claude idle to `wait` without turn gating — strongest case is a smaller diff with no matcher plumbing. The driver that rules it out is the same missed-question regression for in-turn waits; turn state already distinguishes the two cases, so the coarser mapping throws away available information.
- Clear attention on tab focus or user input — strongest case is a self-healing UI regardless of hook coverage. The driver that rules it out is masking: focus does not answer a permission, and input-clearing risks hiding a true approval behind ordinary typing. It remains a possible follow-up scoped to `needs-input` only.
- Do nothing / reuse — staying put keeps one matcher entry and no payload change. The cost is a false pending indicator plus a false attention toast on every idle Claude session, which trains readers to ignore the orange that real approvals rely on.

## Consequences

- **Gains**: Post-completion Claude sessions hold grey across tab dot, sidebar pill, and notification center; mid-turn questions still light orange and still clear on `Stop`. Coverage: `tests/unit/agent-hook-coordinator.test.ts` (drop, mid-turn, permission-without-turn, legacy matcher-less, janus passthrough) and `tests/unit/agent-hook-config.test.ts` (split entries plus posix/Windows argv baking) pass with the surrounding hook suite, 39 tests total.
- **Costs and limits**: The hook command format changes, so existing installs reinstall once on the next terminal creation via the `isInstalled` exact-match check. Matcher-less payloads from pre-migration installs keep the old always-attention behavior until that reinstall. Turn tracking is load-bearing for the gate: a missed `UserPromptSubmit` followed by a real question degrades to the pre-fix behavior (orange that clears on `Stop`) rather than silence, which bounds the failure toward visibility.
