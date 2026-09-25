---
schema: harness-note/1
id: 36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7
kind: decision
lifecycle: implemented
created: 2026-09-22
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/cb7e75d4-4db1-4a7d-b321-6ea866df241c
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/7f0d3ec5-50e4-46df-85b4-f0b75e589df0
extensions:
  r5Migration:
    sourceHash: 1f5a38fef6b9309c1bfac82c60b8581d9deda2ba3d2846d0354920f8023dd9b9
    repairs:
      - relations[0].reason
      - relations[1].reason
    originalRelations:
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/cb7e75d4-4db1-4a7d-b321-6ea866df241c
        reason: Change events deliver fresh summaries; this slice gives the timeline
          durable per-turn prose to display
      - type: related-to
        target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/7f0d3ec5-50e4-46df-85b4-f0b75e589df0
        reason: The v3 slice keeps answers status-only for lack of prose; this slice
          supplies the prose source
---

# Agent Note: Session conversation content from turn snapshot plus transcript excerpt

## Problem

The session timeline in `src/renderer/src/components/SessionPanel.tsx` assembles each turn from three sources with independent failure modes: turns exist only when turn-end hooks fire, the question renders only from the linked checkpoint prompt, and the answer has no prose source at all. The hook `message` carrying the user prompt reaches the knowledge recorder and is dropped by the session ledger, checkpoint prune orphans the question permanently, `SessionTurnRecord` carries no prose field, Stop payloads carry no answer text, and provider transcripts are never read for display even though their paths persist on the session.

## Decision

`SessionTurnRecord` in `src/shared/ipc/session.ts` carries `prompt?` and `excerpt?`. The question snapshots at turn end: the registry holds the latest submitted prompt per session from `notePrompt` and `recordTurnEnd` copies it onto the turn, then clears the pending slot; the timeline prefers the turn copy and falls back to the linked checkpoint prompt, so pruned checkpoints stop erasing questions. The answer resolves orca-style at turn end: the turn-end path takes the transcript path from the hook raw payload first and the session record second, tail-reads the final 64KB, parses the last assistant text for claude JSONL writers, truncates to 500 characters, and stores the excerpt; any failure yields undefined and never blocks turn recording, and non-claude engines skip in this phase. The timeline renders the excerpt as answer prose and stays status-only without it. Caps and behavior land with explicit acceptance: AC-1 questions survive checkpoint prune and restore; AC-2 claude turns show an excerpt after Stop; AC-3 transcript failures never block turn end; AC-4 the 64KB tail and 500-character excerpt caps hold on large transcripts; AC-5 codex, opencode, pi, and janus turns behave exactly as before; AC-6 historical backfill stays deferred to the revisit below.

## Alternatives considered

- Store full transcript text per turn — strongest case is lossless history. The driver that rules it out is storage: unbounded per-turn copies duplicate the provider store the transcript path already references.
- Parse transcripts inside the hook coordinator ack path — strongest case is one place for all hook-derived state. The driver that rules it out is latency: file reads must never gate hook acknowledgement, so excerpt resolution stays at turn end off the ack.
- Render answers from knowledge observations — strongest case is zero new ingestion, since turn prompts already sediment there. The driver that rules it out is ownership: knowledge is workspace-scoped and pipeline-delayed with its own retention, while the timeline needs synchronous per-turn content.
- Snapshot the answer from Stop payload text — strongest case is no file IO at all. The driver that rules it out is source truth: Stop payloads carry status and error text, never answer prose.
- Do nothing / keep status-only answers — no churn. The cost is the reported symptom: timelines with questions but no answers, and questions that vanish with retention.

## Consequences

- **Gains**: every completed turn owns its question text independent of checkpoint lifetime, and claude turns gain answer prose without new IPC channels or renderer plumbing beyond two optional fields.
- **Costs and limits**: excerpts cover claude JSONL transcripts only; other engines keep status-only answers until per-engine parsers land, and historical turns without excerpts stay as-is pending the backfill revisit. Backfill design (re-parse transcripts for excerpt-less turns, restore pruned questions from knowledge conversation-turn observations keyed by provider session id) runs only when historical gaps get reported. Verification is machine evidence on touched paths: `tsc --noEmit` plus `typecheck:strict-unused` are clean, `eslint` on touched files reports zero errors, registry and excerpt unit suites pass, and `npm run i18n:check` stays in sync with no new keys.
