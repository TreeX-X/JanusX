---
{
  "schema": "harness-note/2",
  "id": "296ddf52-c0cc-518e-b490-0e95c80cb5c6",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-18",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/4515fa0e-caa1-59ba-99a7-7cb7f2bc51d0",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-18-agent-note-personal-versus-engineering-memory-separation-first-slice--296ddf52.md",
      "sourceHash": "447951d9a7e4ec9cd8e088ffbc9f5cdd4d6749d325bd0695d38e9cfdedafaa52",
      "originalBodyHash": "5a5a5598ee0ff9249d28fa8ce1011d866d523dfa9b1c6e178725291996cb80db",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Personal versus engineering memory separation, first slice. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ../../proposed/architecture/2026-09-15-personal-vs-engineering-memory.md -> ./2026-09-15-personal-vs-engineering-memory--4515fa0e.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-18-personal-engineering-separation.md",
        "sourceHash": "82bf3043d860ca16902cbf358ec2af42a6208ba963e9cb41470ac1dc6ef1fd70",
        "originalBodyHash": "626dcd491f705e62464615f3733909a3df7db3a9cc9d7f3f758c78c3edc545e0"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c1c04881-a2fb-430f-bc26-528027d0e5cf"
}
---
# Personal versus engineering memory separation, first slice


## Problem

Person memory and project knowledge shared one review queue, one tool surface, and overlapping recall paths. Person candidates drowned in engineering volume during batch review, any model turn could mint or read person scope through the shared registry, and team sharing would leak person traits into shared recall. The [separation proposal](./personal-vs-engineering-memory.md) names the end state; this slice lands its enforceable kernel on JanusX without touching the agent-core boundary.

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
- **Costs and limits**: the Inbox panel has no component test (no tsx harness exists; the predicate module carries the automated proof). Explicit `publish` of personal material into shared surfaces is still principle-only with no UI. `user-memory.*` tools remain registered on the shared runtime; a future model loop that offers the full registry without an allowlist would re-open the engineering side, and that loop must copy the maintenance allowlist pattern. Settled views carry no scope split: `libraryCards` from `truthSnapshotToKnowledgeCards` mixes `scope=user` habits with workspace facts without a filter or badge, `wiki/graph/search/audit` tabs show global counts, `SearchLab` runs engineering-only recall without labeling the boundary, and the persona overview lives in the RightDock `persona` tool with a single `openInbox` link and no reverse entry from the Workbench. Revisit when team sync ships (hard sentinel refusal at the sync layer) or when project-bound chat needs to mint person memories through an explicit user-confirmed action.
