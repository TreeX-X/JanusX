---
{
  "schema": "harness-note/2",
  "id": "11d8826d-52d7-58bb-99bd-49b6ba04dfaf",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-desktop-projections-of-portable-task-evidence--11d8826d.md",
      "sourceHash": "c7cc82db525028f5916fd5a106ef18ea9584cf35f8f47eb75c1e46bec02c8614",
      "originalBodyHash": "235794cc715887e71b45e6a25b4747b1a53c1c835edbcfe9c330484346b830f5",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Desktop projections of portable task evidence. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: 2026-09-18-task-contract-adoption.md -> ./2026-09-18-task-contract-adoption--6b7c688e.md",
        "Rebased Markdown destination: 2026-09-18-project-conversation-controller.md -> ./2026-09-18-project-conversation-controller--4ffa1606.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-18-harness-portable-results.md",
        "sourceHash": "9298ad11a4bb71120e1f640b39118f9505ee58d353052aeb7e4b59d5e6c8306a",
        "originalBodyHash": "8d9a99944ebc1b347c4009a2f6aedec9181b0263cd1ab4b88265234ff4f34e46"
      }
    }
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Desktop projections of portable task evidence


## Problem

A desktop run list based only on local run files omits completed work from a shared checkout. Canvas acceptance checkboxes also describe prose rather than verified coverage. The graph and terminal can disagree after local state is removed or source code changes.

## Decision

The execution adapter reads task results through the shared harness-node validator. Local runs retain their controls; portable task records use their Note URI as a read-only result reference. The panel displays execution and evidence validity separately, disables execution controls without local ownership and checks closeout through the same current-branch proof as the terminal.

Graph projection rebuilds task completion and requirement acceptance from currently valid formal receipts. Checkbox marks do not establish completion. Project reads refresh source Notes, and coverage rechecks the checkout. Share snapshots include the selected tasks' referenced formal receipts, under the managed asset lock; they exclude local runs, leases and conversations and still pass the existing export leak gate.

## Alternatives considered

- Reuse local run lists: preserves inexpensive lookups, but a fresh checkout cannot show portable results.
- Interpret checked acceptance boxes as completion: familiar and cheap, but prose edits cannot prove commands, review or current code validity.
- Copy local runs into shares: retains operational detail, but exports checkout-specific ownership and introduces competing execution truth. Shares carry formal evidence only.

## Consequences

The adapter integration test removes local state after verification, rebuilds a valid result and graph completion, exports referenced receipts, then changes acceptance and observes stale evidence. `npm run test:unit -- --run` with the harness adapter, run handlers, service, acceptance, IPC contract, store branch, maintenance apply and maintenance routing files passes 42 checks. Typecheck, package boundaries and i18n checks pass. Rendering continues to use the existing run panel and canvas components.

Repeated evidence checks add file IO; large graphs with many receipt dependencies require performance measurement. A share carries evidence claims, not an assurance that the receiver's code matches. [Shared conversation control](../sessions/threads/project-conversation-controller.md) and [task contract adoption](./task-contract-adoption.md) now cover the new Note entry workflow. GUI model-driven execution and full Electron interaction acceptance remain incomplete. The standard remains a candidate.
