# Agent Note: User memory glance surface with persona cards plus badge

Status: implemented

## Problem

User memory owns storage, recall, and tools, yet the person behind the projects stays invisible at a glance. A session with no workspace mounted answers from memory only when asked directly in chat, pending habit candidates wait silently for Inbox review, and the Inbox itself never distinguishes a person-scoped candidate from a project-scoped one, so reviewers triage both blind.

## Decision

One workspace-free glance payload serves the persona cards plus the badge. `src/main/knowledge/user-overview-service.ts` composes the `UserProfile` snapshot, up to twenty scope-user habit facts with succession labels and observation citations, up to ten active episodes with expiry dates, and the proposed scope-user candidate count for the Island badge, all through typed `knowledge:user-memory:overview` IPC with a fixed preload method and fallback. `src/renderer/src/components/knowledge/UserPersonaTool.tsx` plus `UserPersonaCards.tsx` register as the single RightDock `persona` tool beside files, git, checkpoints, and assist, render Profile, Habits, and Recent sections with empty states instead of workspace gates, print every habit with its `fact:` plus `observation:` source and every episode with its `episode:` id plus expiry, and expose exactly one action that navigates to the Workbench Inbox. The Island carries the pending count as an info-severity `memory` notification through `memoryNotification` in `islandNotifications.ts`, wired into `JanusIsland.tsx` with silent failure and an `open-memory` action that opens the persona tool, while `RightToolRail.tsx` mirrors the count as a quiet rail dot. `KnowledgeWorkbench.tsx` tags person-scoped fact candidates with `persona` so the Inbox review distinguishes user from project scope. Contract tests in `tests/unit/knowledge/user-memory-contract.test.ts` cover promotion through review into cited recall, decay plus reheat, succession without dual guidance, TTL harvest with a rolling working set, post-forget silence with audit, and the glance overview shape.

## Alternatives considered

- Three separate Profile, Habits, and Recent tools — strongest case is one glance per concern with independent ordering. The driver that rules it out is rail cost: three slots for one person fragments the dock, while one persona tool keeps the registry at five entries with sections inside.
- Event-pushed badge updates — strongest case is instant signaling without polling. The driver that rules it out is lifecycle weight: mount plus recall-turn refresh covers the quiet-signal need, and failures stay silent instead of growing a subscription the MVP never observes.
- Privileged actions on the cards (approve or forget inline) — strongest case is triage without leaving the dock. The driver that rules it out is gate precision: approvals and deletions belong to the Inbox review plus the policy gate, so cards navigate there rather than executing their own writes.
- Do nothing / reuse chat recall only — staying put keeps every current path green with zero new surface. The cost is invisible memory with silent candidates, blind Inbox triage, and no no-workspace glance for the person behind the projects.

## Consequences

- **Gains**: No-workspace sessions see profile, habits, recent, and pending counts with source-traceable rows; the badge pulses info-only and never auto-raises the banner; the Inbox separates user from project candidates at review time.
- **Costs and limits**: Cards show state only, so every approval still requires the Inbox round-trip; the overview caps at twenty habits plus ten episodes with heuristic sorting, and the pending count reads the candidate file directly, so a future queue-shape change must update the reader alongside; row citations render as traceable text with Inbox as the navigation target rather than per-source deep links, which stays sufficient until a source-preview surface exists.

Recall groundwork lives in [the M2 user recall](./2026-09-15-user-recall-m2.md) over [the M1 user store](./2026-09-15-user-memory-m1.md), with tools in [the M3 user tools](./2026-09-15-user-memory-tools-m3.md). Slicing follows [the independent knowledge and assistant MVP](../../proposed/feature/2026-09-14-independent-knowledge-assistant.md) with Janus Chat as the primary surface per [the assistant chat landing](../../proposed/feature/2026-09-14-assistant-chat-landing.md), over the queue ownership in [the queue-owned pipeline](../architecture/2026-09-03-knowledge-pipeline.md) and the event parity in [the chat contract alignment](./2026-09-12-janus-agent-chat-alignment.md).
