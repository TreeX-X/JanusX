# Agent Note: Team sync transport foundation

Status: proposed

## Problem

Execution, blueprint, and knowledge storage all assume one disk. Blueprint and knowledge files sit under user data with no server source of truth, so no second endpoint can pull and no team host can serve. Multi-end consistency needs a channel before any sharing or remote feature can stand.

## Proposal

Build the transport floor in this order: identity-authenticated connections carrying short sessions authorized level by level (tenant, project, resource); `Repository` and `Storage` abstractions with optimistic concurrency on a base version; server-side monotonic versions plus domain events; client snapshots with sync cursors and an outbound queue. Read incrementally online, read the latest snapshot offline, submit the queue on reconnect, merge field-level conflicts, and route state-transition conflicts to human handling. Reuse the personal-edition dual-mode peer and transport selection as the shared library with the device pairing upgraded to session tokens. Forbid sharing local JSON files and absolute paths from the start. This floor later carries the account-system remote control in `../feature/2026-08-20-tob-lan-remote.md` and the published project memory in `../../implemented/architecture/2026-09-03-knowledge-pipeline.md`.

## Alternatives considered

- Sync raw local files — strongest case needs no server at all. The driver that rules it out is concurrent overwrite plus privilege leakage across tenants.
- Realtime collaborative editing — strongest case matches document-suite expectations. The driver that rules it out is unit mismatch: the first version collaborates on nodes, comments, changesets, entries, and reviews, not characters.
- Do nothing / reuse single-disk storage — staying put keeps every current path untouched. The cost is permanent multi-end divergence.

## Acceptance criteria

- [ ] Blueprint and knowledge read through versioned endpoints with snapshot plus incremental sync and offline queues.
- [ ] Conflicting writes never overwrite the remote; field merges apply automatically and state conflicts surface for handling.
- [ ] The personal-edition transport selection reuses as a shared library with token-based auth replacing device pairing.

## Risks

- Sharing private resources by default leaks personal data; private stays person-only with publishing as the sole explicit action.
- Notification failures must never roll back business writes; keep the outbox asynchronous.
