# Agent Note: Personal memory and habit persona

Status: proposed

## Problem

The knowledge pipeline remembers projects but not the person. Retrieval filters strictly by workspace id, so operating habits, instruction phrasing preferences, and recent events have no partition. Freshness weighting cannot answer what happened lately, the chat turn carries no user-dimension injection point, and the team-sync exclusion for personal traits stays unwritten. Stable preferences get re-asked every session.

## Proposal

Keep project memory and add two user scopes. L2 persona holds identity, format and tool preferences, and habits: promotion at frequency three or higher through a new `habit-aggregator` with Ebbinghaus decay plus retrieval reheat and evidence merging, gated through the existing Inbox review. L3 recency holds auto-written events with a 30–90 day TTL and a rolling working set that never disturbs the user. Extend the contract minimally (`scope`, `habitStrength`, `lastSeenAt`, `ttl`, a `UserProfile` snapshot view, `profile/` plus `episodes/` partitions) and reuse the processing queue, the budgeted LLM stage, and the daily maintenance loop. Fuse three recall paths into an independent user-memory prompt section with its own budget, and expose search, candidate-only save, and forget tools with source citations on every used memory. Add Profile, Habits, and Recent cards plus an Island badge. Enforce hard boundaries: private by default, no team, roundtable, remote, or notification surfacing without an explicit publish action, secret redaction before storage, and forget as archived facts plus TTL harvest plus audit with index-aware deletion.

## Alternatives considered

- One mixed scope for project and person — strongest case is a single recall path with no fusion logic. The driver that rules it out is boundary collapse: workspace filtering either leaks personal traits to shared views or dilutes habits beyond retrieval.
- Vector store first — strongest case is semantic recall quality from day one. The driver that rules it out is present capability: the embedding provider returns null today, while BM25 plus weighting ships a working model-less baseline.
- Do nothing / reuse project memory only — staying put protects the frozen pipeline semantics. The cost is repeated preference questions, unanswerable recent-history queries, and conflicting old-versus-new habits guiding behavior silently.

## Acceptance criteria

- [ ] A fresh session states stable user preferences with every claim clickable back to its fact or observation source.
- [ ] Recent-activity questions answer from the event timeline with expired events absent and the working set rolling.
- [ ] A changed habit archives its predecessor with a version bump plus audit, and recall labels the succession without dual guidance.
- [ ] Frequency aggregation, timelines, and BM25 retrieval work model-less while Inbox stays unflooded under observable derivation metrics.
- [ ] Nothing personal surfaces to team, remote, or notification channels before explicit publish, and forget leaves no recall residue with audit to prove it.
- [ ] Cards hold layout, reduced motion stays clean, typecheck passes, and tests cover promotion, decay, succession, TTL harvest, and post-forget silence.

## Risks

- L2 promotion noise floods the Inbox; hold the high-precision bar and watch the per-derivation proposal metrics.
- Superseded habits resurfacing as current guidance; label possibly-outdated relations explicitly instead of swapping silently.
- Embedding arrival later must not fork storage; reserve the hybrid path and open no second vector store for personal memory.
