---
{
  "schema": "harness-note/2",
  "id": "958007ff-748f-57c1-ae16-b9b99a94c198",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-19",
  "class": "architecture",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-19-agent-note-scoped-desktop-implementation-before-task-verification--958007ff.md",
      "sourceHash": "3e47424904682fdfd24d0affdc78a3ca444a53197c2b5f8be981e48ef09d7f76",
      "originalBodyHash": "27b5f0bbb99ffa75f544d17ae7e4d4eb9652bd007549b412345e2802b30e65e7",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Scoped desktop implementation before task verification. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: 2026-09-18-harness-s9-readiness.md -> ./2026-09-18-harness-s9-readiness--28ce4fe4.md",
        "Rebased Markdown destination: 2026-09-19-desktop-implementation-history.md -> ./2026-09-19-desktop-implementation-history--854981c7.md",
        "Rebased Markdown destination: 2026-09-19-desktop-delegated-modes.md -> ./2026-09-19-desktop-delegated-modes--fbac0251.md",
        "Rebased Markdown destination: 2026-09-18-desktop-xdo-executor.md -> ./2026-09-18-desktop-xdo-executor--b057b3f0.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/architecture/2026-09-19-desktop-task-implementation.md",
        "sourceHash": "8cc839f1a3ee6a517768d6caeaaf1dc2149e85b30b389dc26f26dd82de765461",
        "originalBodyHash": "2e041be9624fe54f09d4f9c4786277a7c7595e93f9abb1edc1d32c9b19e4db41"
      }
    }
  },
  "updated": "2026-10-08T03:43:42.474Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10"
}
---
# Scoped desktop implementation before task verification


## Problem

An accepted task needs a host that changes the scoped files before testing them. Running checks against untouched files leaves implementation outside the desktop lifecycle, and reopening a failed attempt without another implementation turn cannot repair the failure. The model must not use that write authority to change its contract, evidence, or run state.

## Decision

`executeDesktopTask` invokes a model implementation port for each running internal attempt, then delegates checks and immutable receipts to the [desktop verification host](./desktop-xdo-executor.md). The [delegated mode host](./desktop-delegated-modes.md) defines xdel/xflow role separation and repair policy. An eligible failure can reopen an attempt through the shared repair budget; the next turn receives the pinned task, repair summary and failure receipt. A verifying retry runs verification directly. Completion requires the shared receipt validator; model text never completes the task.

`desktop-task-turn.ts` creates an isolated agent runtime and chat session for the bound checkout. Explicit task start authorizes automatic file writes only within its literal work scope. The tool gate checks the current run, actual lease, attempt, profile and contract baseline before each call, while the standard workspace runtime also enforces path and sensitive-file policy. Available tools read, list, search, create, edit and delete files, plus local todos. Shell execution, delegation and ledger mutations are absent. The host executes only the task's declared verification commands; those commands are trusted workspace code, not an operating-system sandbox.

Cancellation drains the runtime tools before returning and pauses the run. An IPC reservation prevents duplicate execution during asynchronous model and thread preparation. The selected provider/model serves implementation and self-review; review receives the acceptance prose, check output and tested manifest. Task turns do not inherit personal chat or capture knowledge. Reattachment reconstructs context from fixed Notes and receipts, with model selection and attempt summaries in the existing task thread. [Durable implementation history](./desktop-implementation-history.md) supplies bounded observations matching the task's complete baseline and restores live panel controls.

## Alternatives considered

Reuse the verification-only entry without an implementation turn keeps the host small, but it requires another writer and cannot carry automatic repair through to another check. Reuse the CLI task host offers a complete lifecycle but binds the desktop to another host's session ownership. The desktop instead uses the shared runtime and neutral state kernel through injected ports.

Reuse ordinary project chat preserves an interactive transcript and approvals, but its mutable resource attachments and personal context do not define the task's fixed authority. A separate runtime makes the scope and cancellation target explicit. Per-action approval remains appropriate for ordinary chat; the task host uses the already accepted contract and explicit start as the authorization boundary.

## Consequences

`tests/unit/harness-desktop-executor.test.ts` contains eleven implementation checks using real temporary checkouts, actual workspace tools and deterministic model streams. They cover edit/failure/repair/success, two protected-write refusals, four live precondition changes, cancellation, recreated-port recovery, explicit rebaseline isolation and repair-budget exhaustion with verification retry. Run `npx vitest run tests/unit/harness-desktop-executor.test.ts tests/unit/harness-run-handlers.test.ts` for the implementation and IPC boundary.

The durable-history Note owns current verification commands and the built Electron acceptance boundary. The external live provider probe requires an explicitly configured endpoint and credentials. Deterministic model streams validate host behavior without claiming external model quality or packaged release acceptance.

The host supports one checkout and internal xdo, xdel and xflow. It stores bounded implementation observations, attempt summaries and policy audit events. Interactive clarification remains absent. Tool failures refuse verification; users can correct the blocker and retry. Real provider acceptance, cross-machine orchestration, full protocol recovery and versioned releases remain separate work in [S9 readiness](./harness-s9-readiness.md).
