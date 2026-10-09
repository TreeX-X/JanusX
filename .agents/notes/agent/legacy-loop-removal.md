---
{
  "schema": "harness-note/2",
  "id": "b766003d-d1a9-5e67-9b92-d32167421cc4",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-legacy-maintenance-loop-exits-settlement-stays--b766003d.md",
      "sourceHash": "65c73f72141a803a93bff4bc9303444645fb5511f99e36f7da097bf9a6b58405",
      "originalBodyHash": "c3aca6c0b30cfa8341c696878c85b2974f8ca0f4040d1b127161641138d8c793",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Legacy maintenance loop exits, settlement stays. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: 2026-09-17-maintenance-harness-apply-s6.md -> ./2026-09-17-maintenance-harness-apply-s6--66bf1be8.md",
        "Rebased Markdown destination: 2026-09-18-project-conversation-controller.md -> ./2026-09-18-project-conversation-controller--4ffa1606.md",
        "Rebased Markdown destination: 2026-09-18-blueprint-migration.md -> ./2026-09-18-blueprint-migration--1915e29e.md",
        "Rebased Markdown destination: ../../proposed/architecture/2026-09-18-legacy-loop-removal.md -> ./2026-09-18-legacy-loop-removal--cddc53a5.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-18-legacy-loop-removal.md",
        "sourceHash": "0270ac48c3a13d41ac748f8d7ed4626f27dc03eae363b591a117dc927d119841",
        "originalBodyHash": "132d2ddf2f2e16159035523f8851369727e7ae00c3988b0e0f4241aaa0e6c5c1"
      }
    }
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Legacy maintenance loop exits, settlement stays


## Problem

The maintenance panel and service carry two discussion owners: the legacy loop with its own messages, sessions, steering ports, traces, and controllers next to the janus-chat shared turn. Every turn-lock, steering, retry, and recovery fix ships twice and diverges. On-demand migration already gives unmigrated blueprints a path forward, so keeping the loop beside the new path only preserves the fork the unification removed.

The cut list lives in the [legacy loop removal plan](./history/legacy-loop-removal-plan.md). Migration entry is covered by [on-demand legacy blueprint migration](../blueprint/documents/history/blueprint-migration.md); shared discussion ownership by [one project conversation](../sessions/threads/project-conversation-controller.md); the kept apply lane by [maintenance writes through the harness transaction](./maintenance-harness-apply-s6.md).

## Decision

`start()` in `src/main/janus/maintenance/service.ts` only starts from a project conversation. A start without one refuses with migration guidance, and a conversation start on a non-harness blueprint refuses as well. The loop-only service surface is gone: `respond`, `message`, `propose`, `steerTask`, `cancelSteerTask`, the session, steering-port, and trace maps with their helpers. `generateProposal` takes the shared-turn input of `proposeForConversation` exclusively: chat session, messages, and abort signal.

The settlement surface stays. `proposeForConversation`, conversation starts, selected apply with evidence recheck, audits read, undo, and `cancel`/`complete`/`dismissProposal` remain, with the panel footer and the shared proposal dismiss serving both lanes. The removed IPC channels are message, propose, steer, and steer-cancel; preload, renderer services, the degraded-API fallback, the store, and the panel lose exactly that wiring. The panel start section shows for harness blueprints only, so legacy JSON keeps the migrate-only entry. Frozen legacy tasks settle pending proposals, audits, undo, cancel, and complete through the kept lane; discussion on that lane stays frozen. JSON reads stay for migration input, and settlement writes continue through the kept apply and undo paths until migration consumes the remaining tasks.

## Alternatives considered

- Delete everything including apply, audits read, and undo: smallest diff, but unmigrated tasks lose settlement and history with no replacement, breaking migrate-on-demand.
- Keep the loop indefinitely beside the new path: zero risk today, but the duplicated conversation ownership the unification removed returns permanently.
- Remove `cancel`/`complete`/`dismissProposal` exactly as first listed: matches the plan text most literally, but the footer and the shared dismiss serve new-lane tasks, so shared-task settlement strands with no replacement.
- Do nothing / reuse — leave the loop running beside janus-chat; rejected because the six equivalences now hold pinned tests on the new path and the fork has no remaining owner.

## Consequences

- **Gains**: one discussion owner remains. The panel no longer forks message, proposal, and steering inputs; the Janus command inventory drops from 36 to 32 channels with no dangling handler, preload, service, fallback, or store reference, verified by symbol search. Verification: `npm run typecheck` passes; full unit run reports 1725 passed with 1 unrelated pre-existing theme failure in untouched files; `tests/unit/blueprint-maintenance-harness-routing.test.ts` pins 12 shared-task gates; `tests/unit/blueprint-maintenance-service.test.ts` pins 6 legacy settlement gates; `tests/unit/blueprint-maintenance-discussion.test.ts` pins the event and trace mapping; production build, package boundaries, and bilingual key checks pass; touched sources lint clean.
- **Costs and limits**: legacy JSON discussion stays frozen and starts refuse until migration; unlinked tasks settle pending work without new discussion. The follow-up cleanup removed the producer-less panel reasoning and trace render with its store state, the five orphaned wire types, and eight idle locale keys; verification adds the progress-UI shape pin. The island run shows 3 failures in Knowledge-peek and Island-Chat areas with no maintenance reference, failing identically in isolation. Revisit when migration consumes the remaining JSON blueprints; the kept legacy apply lane and JSON reads can retire then.
