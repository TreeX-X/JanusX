---
{
  "schema": "harness-note/2",
  "id": "ab6d270e-3ded-4a37-b48c-35e660e63e1e",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-10",
  "class": "bug-fix",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/b3704d91-c17d-4492-ae71-a44cfec8bbd7"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a976752-d637-40c7-9fa3-bce52ac5dc15"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22"}
  ],
  "updated": "2026-10-10T17:16:02.539Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/0cb931e1-e33c-4e38-a9d9-9d652796d935"
}
---

# Session rows are minted once per terminal, and a handoff is not delivered until it is seen

## Problem

Triggering Continue in New Session produced two identical cards on the session panel. `continueSessionImpl` and `spawnResumeTerminal` pre-create the ledger row to carry its origin (`continuedFrom`, provider session identity, branch), and `createTerminalLifecycle` mints a second row unconditionally for every agent terminal. Both rows claimed the same `terminalId`, `createSession` minted a fresh UUID each call, and `listSessions` never deduplicates, so the orphan stayed on screen. Because `terminalToSession` was overwritten by the second row, every prompt, checkpoint, and turn landed on it; the first row kept `continuedFrom` and the pending handoff but nothing else. In the six seconds before handoff delivery both rows had an empty `firstPrompt`, and the card title falls back to `session.engine`, so the two were visually identical.

Three defects fell out of the same root: the pending handoff was stranded on a row the user does not associate with the live session, a failed `createTerminalLifecycle` archived the pre-created row but only detached the second one, and command/args-based sessions (where `engine` resolves to `shell`) minted one row while preset-based ones minted two, which made the bug look intermittent.

Separately, handoff delivery was a six-second blind write. "We wrote it" and "the agent received it" are different claims: a slow TUI that has not opened its composer eats the line and the whole handoff vanishes with nothing on screen saying so. And external rows could only ever Resume — re-entering the provider's own session id — with no way to hand the work to a fresh session.

## Decision

**One terminal binds to at most one row.** `createSession` in `src/main/sessions/session-registry.ts` reuses the row already bound to its `terminalId` and fills only that row's blanks (`branch`, `providerSessionId`, `transcriptPath`, `continuedFrom`) from the later call. It never overwrites a value, so the origin written by the first call survives the terminal lifecycle's second one. The three `createSession` call sites stay where they are; the registry converges them. The AC5 same-id replace path calls `detachTerminal` first so a replacement still mints a fresh row, and the create-failure rollback uses `discardTerminal` — archive plus detach — instead of a bare detach.

**Legacy orphans are dropped on load.** `dropEmptyOrphans` removes a non-external, non-archived row whose `terminalIds` are all claimed by another row and which recorded no prompt, turn, or checkpoint. Rows with content stay even when orphaned. `doLoad` now rebuilds `terminalToSession` from the loaded records so the takeover is detectable after a restart.

**A handoff is confirmed, not assumed.** `src/main/sessions/handoff-delivery.ts` taps the pty output as a sidecar (never displacing the primary handler) and resolves readiness on DECSET 2004, an engine marker, or output going quiet after the agent produced something at all. Silence from a terminal that never printed is a timeout, not a composer. Spawn and composer budgets are separate (8s and 20s) so one slow step cannot spend the other's. The handoff goes in as one bracketed paste with Enter on its own write after a short delay, because some TUIs leave the prompt editable when both land together. The verdict is one of three: `delivered` (composer observed, write landed), `unconfirmed` (write landed, composer never seen), or `failed`. Only `delivered` clears the pending handoff; the other two keep it and record `pendingHandoffState`, and the card offers a resend that redelivers the same stored text.

**Continue in New Session is not a privilege of live rows.** `SessionContinueInput.mode` distinguishes `resume` (re-enter the provider's own session id) from `continue` (fresh sequential session, hand over context). External rows default to `resume` and may request `continue`; their context lives in their own transcript file, so `buildContinueHandoff` hands an external row its transcript path to read on demand rather than a summary of turns it does not have. The panel shows both actions side by side instead of choosing one by origin.

**Imported rows launch their own engine into the caller's workspace.** An external row carries neither a preset nor a workspace: `continueSessionImpl` derives the spawn preset from the row's engine exactly as `spawnResumeTerminal` does (`isTerminalPreset(engine)`), and both paths take the caller's `SessionContinueInput.workspaceId` as fallback so the new terminal lands in the workspace the user is viewing. Without the preset fallback the spawn resolved to a bare shell — the handoff was typed into `cmd` with no agent CLI running — and with an empty `workspaceId` the `created` event parked the terminal in `terminalSnapshots['']`, which no workspace ever renders. The panel's continue action passes the active workspace id, and the three-action external card row wraps whole buttons (`whiteSpace: nowrap`) so the 在新会话中继续 label stops breaking mid-word; the Resume action is localized (回到原会话 / Resume) and the unavailable branch shows the action label, not the copy-command label.

**Terminal event subscriptions are app-level.** The workbench mounts `TerminalArea` only while some workspace has a pane tree, and with it `useTerminalLifecycle` — the only `terminal:created` subscriber. On an empty workspace (fresh, or after the last terminal closed) the launcher stood alone, so a Continue/Resume spawn built its ledger row and pty while the `created` event landed on no subscriber and the pane tree stayed null forever: no terminal could ever appear in the middle workbench. `useTerminalLifecycle` now lives in `App`, so a main-side launch always reaches the workspace store and bootstraps the pane tree.

## Alternatives considered

- Thread session metadata through `TerminalCreateRequest` so `createTerminalLifecycle` is the single mint point. Strongest case is one creation site by construction. The driver that rules it out is regression risk: the lifecycle skips `createSession` when `engine` resolves to `shell`, so command/args-based continuations would lose their row entirely, and it puts main-only fields in the renderer-facing IPC contract. Converging at the registry keeps all three call sites and both engine shapes working.

- Make `createSession` idempotent only, with no `detachTerminal` in the replace path. Smallest diff. The driver that rules it out is AC5: same-id replace would silently reuse the previous conversation's row instead of minting a new one.

- Merge hook rows and scan rows on a cwd plus spawn-window proximity key. Strongest case is closing the double-card race where a hook payload whitelist drops the provider id for good. The driver that rules it out is an existing pinned acceptance: a scan import must not eagerly merge into a hook row, the hook row absorbs once it can prove identity, and proximity is not proof — two conversations a user started in one directory moments apart would be swallowed. Merging stays on shared keys only (provider session id, transcript path); the whitelist drop is a payload-layer gap to fix at the hook boundary.

- Keep the six-second blind write and only add a warning. Strongest case is no delivery machinery. The driver that rules it out is the reported symptom class: a written prompt is not a delivered one, and without a readiness signal or a verdict the handoff can vanish with nothing on screen saying so.

- Give external rows only the handoff and drop Resume. The driver that rules it out is that Resume is the authentic action for them: an external row's entity is the provider transcript, and re-entering its session id is the exact continuation. Both actions serve different needs and both stay.

## Consequences

- **Gains**: one Continue produces exactly one new card; the pending handoff lives on the row the user is looking at; a failed create leaves no ghost; external rows can hand work to a fresh session or switch agents instead of only re-entering the old one; a handoff that was written but never received says so and offers a resend.

- **Costs and limits**: `createSession` is now idempotent per `terminalId`, so any future caller that expects two rows from one terminal must detach first. Readiness is inferred from DECSET 2004, an engine marker, or a quiet window — JanusX has no per-engine composer table yet, so a TUI that emits none of these reports `unconfirmed` even when it received the handoff, which trades false alarms for never claiming a delivery that did not happen. `terminalManager.write` swallows pty errors, so delivery writes to `instance.pty` directly to get a real refusal signal; concurrent user input between the paste and Enter is not serialized. The hook payload whitelist that drops Codex `thread_id` is unchanged and still leaves a hook row and a scan row unmerged when neither shares a key. Revisit when a per-engine composer signal table lands or when the whitelist is fixed.

- **Verification**: `npm run typecheck` is clean. Targeted unit runs pass on `agent-session-registry` 31/31, `continue-handoff` 8/8, `handoff-delivery` 9/9, `session-continue-resume` 8/8, `terminal-creation-rollback` 1/1, `external-session-scanner` 7/7, `opencode-sessions` 7/7, `session-turn-merge` 5/5 (76 tests across 8 files). `npx eslint` on all touched source files reports zero errors. `npm run i18n:types` and `npm run i18n:check` pass with both languages in sync. A full `npx vitest run` reports 341 passed / 12 failed / 5 skipped; every failing file is pre-existing working-tree WIP outside this change (memory-review-ui, blueprint-review-*, harness-desktop-executor, chat-turn-guard, janus-ipc-contract, file-tree-git-ignore, workflowx-v2 timeout, assistant-ui, knowledge-automation-ui, laya-settings-ui, office/workspace-watcher-coordinator). The desktop drill `tests/e2e/desktop-session-continue.spec.ts` (1 passed, 19.7s) runs the built app with fake `claude`/`pi` shims on real pties: one Continue grows the panel by exactly one card through the confirm dialog, the handoff text reaches the new session's process and clears `pendingHandoff`, external Resume launches `claude --resume <id>` in a fresh terminal, and a spawn that never comes up leaves no live card. `session-continue-resume` also pins the `buildProviderResumeArgs`/`buildProviderResumeCommand` shapes and their null-prerequisite cases. The imported-row defect above is pinned by the same drill (28.2s, 1 passed): clicking 在新会话中继续 on the external card grows the fake `claude` argv set by one (a bare-shell spawn writes none), the external handoff with its transcript reference reaches that process, and the new row carries `continuedFrom` plus the active workspace id. After the app-level wiring fix the drill (15.6s, 1 passed) additionally asserts that the middle workbench mounts a new xterm view after both the internal and the external 在新会话中继续 clicks — the visible-terminal half of AC-4, which the ledger-only assertions had missed.
