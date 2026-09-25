---
schema: harness-note/1
id: 1a6947ed-0b47-4d33-aa9a-21d37be1db07
kind: decision
lifecycle: implemented
created: 2026-09-22
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e968d1ae-593c-4a7e-b2a0-aba9fcb12f82
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2
extensions:
  r5Migration:
    sourceHash: 0d2ef1207332c3c664232837f165778efd9ba315b9b3df14606a0ef9404c029d
    repairs:
      - relations[0].reason
      - relations[1].reason
      - relations[2].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b
        reason: Orca-aligned three-layer requirement closes its remaining main-side
          clauses here
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e968d1ae-593c-4a7e-b2a0-aba9fcb12f82
        reason: Windowed renderer slice owns the detail surface this slice feeds with
          prose and resume
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2
        reason: Pull-mode transcript backfill lends the bounded parsers this slice
          reuses for detail reads
---

# Agent Note: Transcript detail reads plus provider resume runs

## Problem

The detail window renders only cached turn excerpts, so sessions whose transcript holds more than the excerpt cap never show their full prose even though the transcript path persists on every record. External rows resume only as a copied provider command: `session:continue` throws for rows without shell capture, and no path spawns the provider CLI with its own resume argv in the recorded working directory.

## Decision

`src/main/sessions/transcript-reader.ts` owns bounded full-prose reads. It reuses the scanner's exported bounded file window plus per-engine user and assistant extractors, pairs questions with following answers in file order, caps each side at 2000 characters and the list at the 100 most recent pairs with a truncated flag, and resolves null for missing files, unsupported engines, and turn-less transcripts so callers fall back to cached excerpts without failing. `session:get-transcript` serves it per session id over the persisted transcript path; renderer-supplied paths never reach the reader. The detail window fetches once per open and backfills missing per-turn prose, or substitutes the transcript pair list when it outnumbers the seeded registry turns, with a truncated hint carrying both counts.

Provider resume commands live once in `src/shared/ipc/session.ts` as `buildProviderResumeArgs` plus its display twin, serving the renderer copy buttons and the main resume path from one truth. `session:continue` branches on external rows: it spawns the recorded engine preset in the recorded working directory with the resume argv appended through the additive `TerminalCreateRequest.extraArgs`, so hook wiring follows the engine and turns track live from the resume point. The new ledger row carries the provider session id, transcript path, and a continued-from link to the source row; a failed spawn archives the empty row instead of leaving a ghost card. Engines without a known resume shape keep the disabled button with the stated reason plus the copy fallback. The pty inherits the app environment, which carries provider variables such as `CODEX_HOME` when the app itself runs with them.

## Alternatives considered

- Parse transcripts in the renderer through a file read bridge — strongest case is no new main module. The driver that rules it out is trust: renderer-supplied paths would reach the filesystem, while the session-id-keyed handler reads only registry-owned paths.
- Type the resume command into a plain shell terminal after spawn — strongest case is zero terminal-contract change. The driver that rules it out is hook ownership: a shell-preset spawn wires no engine hooks, so resumed turns stay invisible to the ledger, while preset-plus-argv keeps live tracking.
- Store full transcript text per turn in the registry — strongest case is lossless history with no file IO at read time. The driver that rules it out is storage: unbounded per-turn copies duplicate the provider store the transcript path already references.
- Reuse the focused-handoff delivery for external rows — strongest case is one continue path for all rows. The driver that rules it out is target truth: a handoff prompt starts a new task, while resume must re-enter the provider's own session id.
- Do nothing / keep excerpt-only prose plus copy-only resume — no churn. The cost is the reported symptom: capped prose with the full log one hop away, and a resume flow that ends at the clipboard.

## Consequences

- **Gains**: detail windows show bounded full prose with excerpt-first instant render; external rows resume in one click into hook-tracked terminals in the recorded working directory, with copy fallback intact where resume shapes stay unknown.
- **Costs and limits**: pairs above the 100-turn window and sides above 2000 characters stay truncated with the counts disclosed; per-session provider environment from the original outside shell is not tracked, so resume inherits the app environment; consecutive user messages collapse to the last question before an answer. Revisit when vendors change transcript schemas or a live external feed becomes ownable.
- **Verification**: machine evidence on touched paths — `npx tsc --noEmit` with strict unused flags is clean, `npx eslint` on touched files reports zero errors, `npm run i18n:check` reports both languages in sync after `npm run i18n:types`, and unit runs pass on `transcript-reader` 5/5, `agent-session-registry` 13/13, `external-session-scanner` 5/5, and `companion-session-state` 1/1. Desktop e2e is not run: provider CLIs are not drivable in CI.
