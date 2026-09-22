---
schema: harness-note/1
id: 18fffeff-4922-423d-9f15-0e27f69048d2
kind: decision
lifecycle: implemented
created: 2026-09-22
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e29da5b4-dc65-40a9-883d-9026e3b280b1
    reason: The capability table owns the sessionStore resolvers this backfill walks
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7
    reason: Turn prompt and excerpt fields give the imported timeline its readable Q/A pair
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b3704d91-c17d-4492-ae71-a44cfec8bbd7
    reason: The session ledger owns identity and Continue handoff that external rows reuse read-only
---

# Agent Note: External session backfill from provider transcript stores

## Problem

The session panel lists only hook-owned sessions. Creation and every update path key on terminal ids that JanusX itself spawns, and hook delivery needs per-process env that externally-started terminals never receive, so CLI sessions started outside the app leave no row even though their transcripts persist under the provider stores.

## Decision

A pull-mode backfill reads provider transcript stores directly, beside the hook pipeline. `AgentSessionRegistry.importExternalSession` keys on engine plus provider session id, stores rows with `external: true` and no terminal binding, and seeds one turn carrying the first user prompt plus the tail assistant excerpt so cards and timelines render without a live terminal. Hook-owned rows keep authority on collision: the import only backfills a missing transcript path and never rewrites their turns. Repeat scans refresh count, excerpt, and timestamps on the same key without duplicating.

`src/main/sessions/external-session-scanner.ts` walks the claude and codex stores through the capability resolvers, newest files first with a per-engine cap, bounded reads with head-plus-tail fallback for large files, and parsers that tolerate unknown shapes and corrupt lines. Engines without a readable store stay skipped. Triggers are one boot pass after registry load plus one fire-and-forget pass on every `session:scan-external` call from the panel open path; the existing `session:event` subscription refreshes cards when imports notify.

`SessionPanel` renders an external badge on imported rows and disables Continue with a read-only hint, since imported rows carry no shell to resume into. The zh-CN and en terminal locales carry the two new keys, and the browser fallback stub resolves an empty summary.

## Alternatives considered

- Inject hook env into externally-started shells — strongest case is live updates for outside terminals. The driver that rules it out is ownership: JanusX cannot cover already-running or independently-launched shells without coupling to shell startup files.
- Watch transcript files with `fs.watch` only — strongest case is immediate freshness. The driver that rules it out is IO churn: append-level events rebuild excerpts continuously, while boot plus panel-open passes give the same visibility bounded.
- Accept unmatched hook payloads as new sessions in the coordinator — strongest case is no new scanner. The driver that rules it out is causality: external terminals produce no hook traffic, so the path never fires.
- Export sessions through provider CLIs — strongest case is canonical parsing. The driver that rules it out is fragility: subprocess plus version-sensitive output against stores that already parse stably as JSONL.
- Do nothing / keep hook-only sessions — no churn. The cost is the reported symptom: externally-started conversations stay invisible with no inspect path.

## Consequences

- **Gains**: externally-started claude and codex sessions appear with correct cwd, first prompt, tail excerpt, and turn count, deduplicated across boot and panel-open passes, while hook-owned sessions keep their live behavior untouched.
- **Costs and limits**: the card count reflects parsed assistant turns but the timeline seeds a single Q/A pair; files above 512KB parse head plus tail so counts may partial; codex cwd fallback inherits the known shared-cwd misattribution; opencode and pi stay status-absent with no driver; each panel open walks at most 200 files per engine. Revisit when vendors change transcript schemas or a live external feed becomes ownable.
- **Verification**: machine evidence on touched paths — `npx vitest run` across `external-session-scanner`, `agent-session-registry`, `agent-engine-capabilities`, and `remaining-ipc-contract` passes 27/27; `npm run typecheck` and `typecheck:strict-unused` are clean; `eslint` on touched files reports zero errors with one pre-existing literal warning on an untouched line; `npm run i18n:check` reports 12 namespaces in sync.
