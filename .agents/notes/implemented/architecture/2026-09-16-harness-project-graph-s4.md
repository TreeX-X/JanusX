# Agent Note: Harness project graph lane

Status: implemented

## Problem

Canvas edits, terminal edits, and future execution hosts reach the same project notes through separate write paths. Each path invents its own locking and conflict story, so concurrent saves lose bytes and crashed writes leave half-applied graphs. The canvas model also has no notion of file identity, expected hashes, or share-safe exports.

## Decision

HarnessNoteService (`src/main/harness/service.ts`) is the single managed gateway: checkout resolve, cached index with rescan, file watcher with change broadcast, transacted apply with idempotent operation records, local-only checkout bindings, and whitelist share export that refuses machine paths, local state, and credentials. Notes project onto the Blueprint view model (`source: 'harness'`, per-node file identity plus last-seen digest) so the existing canvas, detail, and list UI render them unchanged. BlueprintStore branches content operations by graph id: project creates/updates/archive flow through the service transaction with optimistic file hashes, canvas layout persists to local-only UI state, and acceptance/feature arrays plus maintenance operations report HARNESS_MANAGED for their owning flows. Legacy JSON blueprints keep full read and write behavior for old data. The workbench gains a scope strip (repo identity, binding count, share export, conflict notice with reload); stale canvas saves surface HARNESS_CONFLICT instead of overwriting.

## Alternatives considered

- Rewrite the store around notes in one pass — strongest case is zero legacy lanes, but analyzer sessions, maintenance loops, candidate flows, and team policies all ride the current model mid-flight, and a flag-day rewrite strands them.
- Keep a second JSON index beside the notes — strongest case is fast canvas reads with no model mapping, but two writable truths reintroduce the exact dual-edit drift this lane removes.
- Do nothing / reuse — keep ad-hoc writes per surface; rejected because half-applied graphs already block unified acceptance.

## Consequences

- **Gains**: 12 new checks pass (terminal→UI→terminal roundtrip, stale-save conflict with bytes preserved, share whitelist, bindings, 1000-note scan inside budget, store branching, IPC wiring). Full unit run reports 1517 passed with 9 failures proven pre-existing on clean HEAD (7 deterministic plus flaky knowledge-queue and janus-ipc cases, each verified via stash comparison). Project typecheck, scoped lint, and i18n check pass.
- **Costs and limits**: analyzer, maintenance, candidates, and team write paths stay on the legacy lane until their owning segments unify; project metadata is read-only and canvas deletes archive instead of removing; checkouts without `harness.json` read fine but cannot mint note URIs; task completion evidence arrives with the execution segment.
