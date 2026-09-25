---
schema: harness-note/1
id: 1432f7b8-6dff-5351-9e27-b1c3553bac0d
kind: decision
lifecycle: proposed
created: 2026-09-22
class: architecture
---
# Agent Note: Blueprint becomes a read-only NoteGraph view maintained by agents

Status: proposed

## Problem

Blueprint currently has two lanes sharing one `Blueprint` type: legacy JSON (`src/main/janus/blueprint-store.ts`, files under userData) and the live harness projection (`harness:project:*` via `src/main/harness/service.ts` + `src/main/harness/graph-projection.ts`). The renderer (`src/renderer/src/stores/blueprint.ts`, `src/renderer/src/components/blueprint/BlueprintView.tsx`, `BlueprintCanvas.tsx`) treats both as editable, so the store carries roughly fifteen `isProjectGraphId` branches returning `HARNESS_READONLY` / `HARNESS_MANAGED` / `HARNESS_CONFLICT`. Mapping is split and lossy: `graph-projection.ts` (`kindToNodeType`, `lifecycleToStatus`, section picks, `featuresFromAcs`, relation downgrade) plus `artifact-producer.ts` (`nodeTypeToKind`, `KIND_SECTIONS`, `applyNodePatch`, `mapStatusToLifecycle`). Any note concept change (new kind, lifecycle, section, relation type) ripples through parser, both mappers, store guards, `maintenance-bridge.ts`, canvas UI, and a dozen `blueprint-*.test.ts` files. Users can still create/delete blueprints and nodes (`BlueprintView.tsx` toolbar, canvas context menu), which fights the harness single-writer rule.

## Proposal

Rebuild blueprint around the workspace note graph with an explicit middle layer; blueprint is a pure view, agents are the only writers. Right column is pure chat; left column is preview plus implement shortcuts:
- New `src/main/notes/` boundary. `note-types.ts` owns `NoteDoc`/`NoteGraph`/`NoteRelation` plus `schemaVersion`. `note-provider.ts` is the only module allowed to import harness-core/harness-node. `note-to-blueprint.ts` (`NoteAdapter v1`) owns every mapping table (kind->type, lifecycle->status, kind->sections, relation map, unknown-value downgrade to `issue`/`planning`/`related-to` with prose preserved). `graph-projection.ts` and `artifact-producer.ts` become deprecated shims over the adapter.
- Renderer keeps one `useBlueprintViewStore`: `load/view/layout/focus/filter`. The only edit entry focuses the JanusChat turn; the standalone maintenance queue panel is deleted. Delete `createBlueprint/deleteBlueprint/createNode` UI and their toolbar buttons; main-side IPC keeps the calls but project lane answers read-only. Left column shows the selected note read-only plus two shortcuts: copy implement prompt and open terminal with the prompt prefilled (`launchTerminalPreset` with initial prompt built from Goal/AC).
- Confirmation reuses the janus-agentX native rails, no custom queue: backport the `plan` approval mode (`policy-gate.ts`; locally only per-action/auto-run exist) so the agent explores read-only, then each mutation passes per-action approval carrying a bounded `ApprovalPreview` (summary/paths/detail) rendered by the existing `JanusChat.tsx` `.janus-runtime-approval` card and settled by `resolveApproval`; `workspace-chat-tools.ts` already gates mutations by permission mode. Deletions stay individually confirmed via `confirmedDeleteOperationIds` and never join bulk approval. `blueprint-tools.ts` zod schema validates `ViewPatch`, not raw file edits.
- Concurrency is self-healed by the agent inside the turn: the transaction layer pre-checks `expectedHash` (`maintenance-bridge.ts` fusion) and surfaces `HARNESS_CONFLICT`; the agent re-reads the fresh sha (`cmdShow`/`workspace_read`), re-fuses ops, and retries while narrating in chat. Stale anchors abort with fresh anchors per the `workspace_edit` contract. The canvas drops the user-facing conflict bar and auto-refreshes on `watchNotes` rev bumps.
- The chat agent reads workspace notes wiki-style through read-only tools scoped to the workspace root: notes-cli `cmdList` (kind/lifecycle/tag/q index) plus `cmdShow` (full text with sha256) plus `workspace_search`/`workspace_read` content search. Reads need no approval (same precedent as user-memory search tools). Wiki index shape is id/title/kind/lifecycle/tags/relPath; only the selected node plus one-hop neighbours enter the turn context by default.
- Versioning: `projectView` returns `{ view, adapterVersion, rev }`; unknown kinds/sections degrade into the `invalid[]` lane instead of throwing. Legacy JSON lane turns archive-read-only with a one-shot `json -> notes/imported/` migrator reusing `share-import.ts` path rules. Terminal drafts rename to DraftCard per the companion note so `note` means workspace notes only.

## Alternatives considered

- Keep dual-lane editable blueprint and patch guards per feature — strongest case is no migration. The driver that rules it out is combinatorial guard growth; every note upgrade re-breaks canvas, maintenance, and tests.
- Let users edit notes directly on canvas (bidirectional sync) — strongest case is maximal freedom. The driver that rules it out is conflict with the harness single-writer transaction and acceptance-evidence rules (task completion, coverage receipts).
- Freeze blueprint as-is and build a separate note graph view — strongest case is zero regression. The driver that rules it out is two competing graphs with divergent relation semantics.

## Acceptance criteria

- [ ] User toolbar exposes zero create/delete entries; the only edit entry focuses the chat turn and the queue panel is gone.
- [ ] Every note mutation in chat passes the native approval card with bounded preview; deletions require individual confirm and are rejected from bulk apply otherwise.
- [ ] A concurrent external edit during an agent apply is retried by the agent in-turn with chat narration; no user-facing conflict bar appears and the canvas converges on the watch rev bump.
- [ ] Agent lists and reads workspace notes wiki-style (index plus full text plus content search) with no approval prompts for reads.
- [ ] Exactly one module imports harness-core/harness-node; a note fixture upgrade (new kind or section) requires changes only in `note-to-blueprint.ts` plus golden snapshots.
- [ ] Unknown note values render in the invalid lane with adapter version badge; no unhandled throw reaches the canvas.

## Risks

- Removing create/delete breaks existing muscle memory; mitigate with the chat request flow plus a legacy archive viewer.
- The harness file dependency (`file:../janus-agentX`) is fragile; mitigate by vendoring or pinning plus single-importer discipline.
- The `plan` approval mode must be backported before chat-first editing ships; until then per-action stays the default and exploration tools stay read-only by policy.
- Chat context budget: blueprint context stays scoped (selected node plus one-hop neighbours) via `janus.blueprint.read`; full-graph reads happen only on explicit user request.
- Staggered canvas entry and skeleton loading are load-bearing UX; the redesign prototype in `design/blueprint-note-graph.html` locks them before code changes.
