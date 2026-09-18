# Agent Note: One project conversation for Chat and Note blueprints

Status: implemented

## Problem

Sharing the chat engine did not share conversation ownership. The main Chat and blueprint maintenance panel could retain separate messages, resources, cancellation and questions. A project discussion also needed validated Note contents rather than trusting renderer paths or treating a selected node as workspace authorization.

## Decision

The conversation registry binds a Note blueprint through its owner repository and view identity. Both entries use the same persisted conversation and runtime controller. Messages, model selection, workspace resources, questions, approvals, steering and stop have one owner. Closing a panel leaves the turn running; opening it again reuses the conversation. Switching the main entry to a personal thread leaves the project controller and its status available by view identity. Existing resource choices survive binding and reload.

The main process resolves selected Note URIs and hashes from validated workspace sessions under the asset lock. Missing, stale or ambiguous checkouts fail explicitly. Project discussion uses read-only workspace tools plus questions and todos. Project turns without a workspace do not fall back to personal memory capture. Selection is context, not a grant to write.

New Note maintenance tasks link to the conversation and retain only proposal operations, evidence and audit state. Proposal generation runs within the ordinary chat turn's ownership, signal and session, using shared history. Steering revises the proposal before the final response. Duplicate steering identities are idempotent even when the queue is full; conflicting text is refused. Applying a proposal remains an explicit action through the existing evidence recheck, selected-operation transaction and undo path.

Entry points are [conversation binding](../../../../src/renderer/src/components/janus/janusChatConversations.ts), [blueprint panel](../../../../src/renderer/src/components/blueprint/BlueprintMaintenancePanel.tsx), [chat host](../../../../src/main/llm/chat-orchestrator.ts), [Note context](../../../../src/main/harness/chat-context.ts) and [proposal service](../../../../src/main/janus/maintenance/service.ts). The overall contract remains the [candidate discussion and execution design](../../proposed/architecture/2026-09-16-roundtable-chat-harness-loop.md).

## Alternatives considered

- Share only the message renderer: minimizes UI changes but leaves competing turns, resource grants and stores.
- Move proposal application into unrestricted chat tools: simplifies dispatch but loses explicit selection and the existing evidence and undo boundaries.
- Delete the old maintenance path immediately: simplifies ownership, but interrupts active unlinked tasks and legacy JSON blueprints before the standard cutover has been verified.

## Consequences

New Note blueprint conversations share their controller end to end. Legacy JSON blueprints and already active unlinked maintenance tasks retain their old flow; this is a rollout boundary, not completion of S6's final removal requirement. Proposal generation still uses the maintenance service's structured output and evidence logic inside the shared turn. It does not execute task contracts or issue formal completion evidence.

Focused tests cover turn exclusion, proposal cancellation, steering identity, conversation restoration, proposal history and workspace ownership. The browser fixture uses real renderer components with mocked Electron and model ports to exercise messages, questions, approvals, model changes, resource removal, panel remount, personal-thread switching and reload. It is not full Electron or real-model acceptance. Typecheck, production build, package boundaries and bilingual key checks pass. The task adoption Note records the adjoining [draft-to-evidence boundary](2026-09-18-task-contract-adoption.md).
