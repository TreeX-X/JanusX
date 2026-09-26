---
schema: harness-note/1
id: 3a976752-d637-40c7-9fa3-bce52ac5dc15
kind: decision
lifecycle: implemented
created: 2026-09-25
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662
class: bug-fix
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/1a6947ed-0b47-4d33-aa9a-21d37be1db07
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b
---

# Opencode continue uses native session resume on internal rows

## Problem

Continue in New Session on an internal opencode row opens a fresh provider session and delivers the context as one typed handoff line six seconds after spawn. The opencode TUI starts slowly, so the delivery lands before the prompt accepts input and the handoff is lost: the new terminal shows an empty opencode session with no inherited dialogue, while the hook-owned row already carries the provider session id that native resume needs. The external resume path does not have this failure; it re-enters `opencode --session` directly.

## Decision

`session:continue` branches internal rows by resumability before falling back to the focused handoff. `buildContinueResumeArgs` in `src/shared/ipc/session.ts` owns the single eligibility rule: engine `opencode`, no engine switch, and a provider session id resolve to the provider resume argv; every other combination resolves null and keeps the existing handoff path untouched. Eligible rows spawn through the shared `spawnResumeTerminal` helper in `src/main/ipc/terminal-handlers.ts`, which is the same recorded-preset plus `extraArgs` launch the external path uses, so hook wiring follows the engine and the new ledger row keeps the provider session id, transcript path, and continued-from link. Failed spawns archive the empty row instead of leaving a ghost card.

Opencode resume runs a store preflight first. `probeOpencodeSessionPresence` in `src/main/sessions/opencode-sessions.ts` reports `present`, `absent`, or `unknown` for one session id against the sqlite store. `absent` refuses with an explicit session-gone error that surfaces on the panel error line; `unknown` covers locked, missing, and unreadable stores and fails open so a probe never blocks a resume that could succeed. The related presentation and vocabulary live in [Orca-aligned session management](./2026-09-22-session-mgmt-orca-restore--3e9ec8d6.md); the external resume contract this reuses lives in [Transcript detail reads plus provider resume runs](./2026-09-22-session-resume-detail--1a6947ed.md); the native-resume-over-typing principle follows [Orca terminal-type acquisition](./2026-09-21-orca-terminal-acquisition-parsing--bc53c6cc.md).

## Alternatives considered

- Keep the typed handoff for internal opencode rows and retune the six-second delay — strongest case is zero branching in the continue path. The driver that rules it out is delivery truth: any fixed delay misfires against variable TUI startup, and the provider session id that makes resume exact is already on the row.
- Deliver the handoff as an `opencode --prompt` launch argument instead of typed input — strongest case is reliable injection without changing session semantics. The driver that rules it out is scope: it still starts a new provider session with a summary where full history is available, and untested submit semantics on the TUI path risk a second silent failure.
- Extend native resume to every engine with a resume shape on internal rows — strongest case is one continue path for all rows. The driver that rules it out is product semantics: Continue in New Session opens a fresh sequential session while the original stays intact, and only the reported opencode failure justifies the exception; other engines keep the handoff until their own failure is evidenced.
- Do nothing / reuse the timed handoff for all internal rows — no churn. The cost is the reported symptom: internal opencode continuations keep landing in empty sessions with no inherited dialogue.

## Consequences

- **Gains**: internal opencode continuations re-enter full provider history in one click with live hook tracking from the resume point; dead opencode sessions fail with an explicit store error plus the intact copy-command fallback instead of a silent fresh session.
- **Costs and limits**: two continue mechanisms now coexist on internal rows (native resume for resumable opencode, typed handoff otherwise); the six-second handoff timing it replaces stays in place for the remaining handoff rows; per-session provider environment from the original shell is not tracked, so resume inherits the app environment.
- **Verification**: `npm run typecheck` is clean; targeted unit runs pass on `session-continue-resume` 5/5, `opencode-sessions` 7/7, `external-session-scanner` 7/7, and `agent-session-registry` 15/15; `npx eslint` on touched source files reports zero errors. Desktop e2e is not run: the provider CLI resume needs a live opencode session and is verified by hand with `opencode --session <id>` in the recorded cwd.
