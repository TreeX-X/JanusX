# Agent Note: Personal versus engineering memory separation, first slice

Status: implemented

## Problem

Person memory and project knowledge shared one review queue, one tool surface, and overlapping recall paths. Person candidates drowned in engineering volume during batch review, any model turn could mint or read person scope through the shared registry, and team sharing would leak person traits into shared recall. The [separation proposal](../proposed/architecture/2026-09-15-personal-vs-engineering-memory.md) names the end state; this slice lands its enforceable kernel on JanusX without touching the agent-core boundary.

## Decision

One Inbox, two review columns: `inboxScope.ts` owns a single scope predicate (user scope or user provenance, every candidate kind) shared by the new All/Personal/Engineering filter and its counts, mirroring `listProposedUserFactCandidates` so the Inbox personal count and the persona `pendingHabitCount` badge read the same file through the same rule. Filtering never rewrites stored lists, and default selection follows the visible column.

Channel isolation is locked, not assumed. The maintenance discussion allowlist test now asserts no `user-memory.*` tool is ever offered to engineering turns, so the only model channel that can mint person candidates is janus-chat. Recall was audited end to end: MCP, maintenance, project chat, and the IPC context handler all ride project-only `search`, which drops the scope field before recall and excludes user documents with or without `allowGlobal`; fused and user-only recall stay on the personal chat path. Existing leakage tests already pin both directions, so no new recall tests were needed.

Procedure归属 examples: a personal fixed procedure ("always explain in Chinese, three lines max") compounds from janus-chat turns, promotes through habit aggregation, and lands as a `scope=user` habit after personal Inbox review; a project fixed procedure ("this repo releases via `npm run ship` after `verify`") is captured with a real workspace id and settles as workspace wiki or fact through engineering review. Neither crosses: the Inbox columns, the recall filters, and the tool allowlist each enforce one side.

## Alternatives considered

- Gate the user-memory tools on `workspaceId === 'user'` inside `execute` — strongest case is a hard tool-level wall, but project-bound janus-chat turns run under real workspace sessions, so the wall would also block legitimate janus-chat saves while adding nothing over the allowlist that already excludes engineering turns; the channel mechanism fits the proposal better than the workspace mechanism.
- Split storage and pipelines in two — strongest case is physical isolation, but queue, cursor, deterministic merge, budgets, review, and audit would all fork, destroying the queue-owned structure the pipeline note established; views and recall boundaries separate while the pipe stays single.
- Tag-only separation (`persona` label, one queue) — strongest case is zero new UI, but labels do not stop flooding or mis-approval and form no sharing boundary; the M4 tag stays as a marker, the columns do the work.
- Do nothing / reuse — person candidates keep drowning, engineering turns keep theoretical access to person tools, and team sharing stays one mistake from leaking traits.

## Consequences

- **Gains**: allowlist lock test pins engineering exclusion; 3 inbox-scope checks pin the predicate, the lossless split, and the summing counts; Inbox ships All/Personal/Engineering columns with live counts in both languages (i18n 12 namespaces in sync); typecheck passes; 21 neighboring knowledge, recall, and discussion checks pass; touched sources lint clean except one pre-existing `exhaustive-deps` warning on an untouched effect.
- **Costs and limits**: the Inbox panel has no component test (no tsx harness exists; the predicate module carries the automated proof). Explicit `publish` of personal material into shared surfaces is still principle-only with no UI. `user-memory.*` tools remain registered on the shared runtime; a future model loop that offers the full registry without an allowlist would re-open the engineering side, and that loop must copy the maintenance allowlist pattern. Revisit when team sync ships (hard sentinel refusal at the sync layer) or when project-bound chat needs to mint person memories through an explicit user-confirmed action.
