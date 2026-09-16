# Agent Note: Assistant capability scope and chat landing

Status: proposed

## Problem

The assistant has a storage scheme and a recall design but no recorded capability scope. Without one, implementation drifts toward either a second chat system competing with Janus Chat or an unbounded agent platform absorbing every tool in the tree. The interface landing is equally undecided on paper: slot cards and badges exist as proposals, yet no note states which surface is primary, so each future change can plausibly claim any pane as its home and fragment the experience.

## Proposal

The assistant behaves as one durable helper that remembers the person, acts on workspaces, and stays auditable. Its scope holds five capability areas in strict priority order, and the order governs scope cuts when budget runs short, never the build sequence, which still follows dependency order.

First priority goes to cited answers. Project questions answer from workspace knowledge with overlong wiki pages excerpted around the query, personal questions answer from habits and the event timeline with no workspace mounted, and every used memory claim carries a clickable citation back to its fact or observation source.

Second priority goes to memory that compounds. Repeated preferences promote into habits through the Inbox review, changed habits archive predecessors with version bumps plus succession labels, stale habits decay, and forget leaves no recall residue with audit to prove it. Privacy holds by default with explicit publish as the only exit.

Third priority goes to wider workspace execution on the existing runtime: file operations under path guard, git operations with diff visibility, project launch plus process control, and high-risk commands behind confirmation with full audit.

Fourth priority goes to tighter process gates: mid-turn questions with single, multi, custom, and cancel answers, visible todo progress, and read-only evaluator review before completion counts.

Fifth priority goes to quiet safety nets: Island badge signals for new habit candidates and cited-memory activity, plus failure and notification chains for runaway terminals and command errors.

The primary surface is the Janus Chat pane (`JanusChat.tsx` with `useJanusChat`, inside the Island expanded state). Memory tools trigger through natural language there, citations render inline, and mid-turn questions, todo strips, and tool cards reuse the existing gate UI with no new interaction paradigm. The Island badge and the RightDock Profile, Habits, and Recent cards serve as supporting glance surfaces only. The orchestrator gains a user-scope recall path with an independent budget transparently to the UI, while the chat event contract, typed IPC boundary, and approval plus audit chains stay untouched.

The glance mounts land inside existing containers with no new window. The three cards will register as RightDock tool contributions beside files, git, checkpoints, and assist (`src/renderer/src/right-tools/registry.ts` plus `RightToolHost.tsx` and `RightToolRail.tsx`), stay enabled with no workspace mounted, and card activation will navigate to Janus Chat or the Workbench Inbox rather than executing any privileged action. The badge will ride the Island capsule and peek path (`JanusIsland.tsx` plus `islandNotifications.ts` capsule tier and peek arbitration beside the knowledge peek), and badge activation will open the peek summary before the expanded chat view. The personal layer will reuse the queue-owned pipeline (processing queue, deterministic stage, budgeted LLM stage, daily maintenance), the Inbox review with a user versus project scope distinction, BM25 recall with an independent user budget, and the `ChatTurnPorts` knowledge ports; the read-only MCP line stays untouched while the three personal tools register through the shell `ToolRegistry` behind the policy gate.

Explicit non-goals hold: no replacement chat system, no silent rewrites without diff review, no default broadcast commands, no automatic merge or deploy, no third-party code execution, and no private memory committed into repositories.

This scope serves [the independent knowledge and assistant MVP](2026-09-14-independent-knowledge-assistant.md), consumes [the OSS survey](2026-09-14-agent-assistant-oss-survey.md), and respects [the chat contract alignment](../../implemented/feature/2026-09-12-janus-agent-chat-alignment.md) plus [the slot registry](../architecture/2026-09-09-island-rightdock-slots.md).

## Alternatives considered

- Standalone window or separate app for the assistant — strongest case is a clean canvas with no legacy chat constraints. The driver that rules it out is context loss: the user already lives in Janus Chat with history, approvals, and tool traces, and a second home splits memory references across two panes.
- Cards-first with chat as fallback — strongest case is glanceable state without typing. The driver that rules it out is action poverty: cards display but cannot negotiate, confirm, or answer follow-ups, so every real task falls back to chat anyway.
- All five areas in one uncut scope — strongest case is no hard choices and a complete story. The driver that rules it out is review capacity: an uncut scope ships breadth with shallow gates, and the first bad auto-action costs more trust than a missing card.
- Do nothing / keep Janus Chat as-is — staying put protects the aligned contract with zero new surface. The cost is a chat that forgets every session, re-asks stable preferences, and leaves the memory pipeline without a user-facing reason to exist.

## Acceptance criteria

- [ ] Each of the five areas is demonstrable inside the Janus Chat pane without opening any other surface.
- [ ] No-workspace sessions answer personal questions with citations; project answers keep workspace filtering with zero leakage between scopes.
- [ ] Memory save and forget both trigger through natural language and complete through Inbox review plus audit.
- [ ] Supporting surfaces show state only and initiate no privileged action on their own.
- [ ] Any scope cut follows the recorded priority order with the cut area named in the change record.

## Risks

- Chat bloat as five areas share one pane; keep memory claims to cited one-liners and push detail into cards and sources instead of lengthening replies.
- Priority order misread as build order; the build sequence still follows dependency order, and reviewers must reject patches that invert them.
- Natural-language memory triggers misfire on casual phrasing; confirm-before-save stays mandatory until trigger precision is measured.
- Supporting surfaces quietly grow actions; any privileged action outside chat needs its own decision before shipping.
