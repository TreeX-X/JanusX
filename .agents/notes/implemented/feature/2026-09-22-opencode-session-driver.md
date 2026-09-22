---
schema: harness-note/1
id: ba08f562-a2bc-4a97-98dc-8b835bcc9107
kind: decision
lifecycle: implemented
created: 2026-09-22
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b
    reason: Orca-aligned requirement assumes every CLI leaves a readable store; opencode is that store
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2
    reason: Pull-mode transcript backfill gains its third engine beside claude and codex
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/1a6947ed-0b47-4d33-aa9a-21d37be1db07
    reason: Transcript detail reads serve opencode pairs through the same session-keyed channel
---

# Agent Note: Opencode sqlite session driver

## Problem

`src/main/sessions/external-session-scanner.ts` walks only claude and codex transcript files, and the capability table marks opencode sessionStore null with no driver in the repo. Afternoon opencode conversations therefore never appear in session management: no list rows, no detail prose, no resume path. Field evidence on this machine shows the opencode sqlite store holding hundreds of sessions with directory, title, timestamps, message roles, and text parts, while the registry holds no rows for them.

## Decision

`src/main/sessions/transcript-reader.ts` shares its turn and character caps through an exported truncate helper. `src/main/sessions/opencode-sessions.ts` owns the sqlite driver behind `node:sqlite` read-only handles, following the runtime-telemetry precedent: newest-first session rows with the first user text, the tail assistant text, and the user-message count resolved per session through indexed message queries plus bounded part reads, and full ordered question-plus-answer pairs per session for detail reads. Every query layer tolerates missing files, locked databases, corrupt rows, and schema drift by resolving empty or null, and one bad session never fails a list. The capability table gains the `opencode-sqlite` store kind with the database resolved under the home profile; the scanner lists the newest rows instead of walking files for this engine and imports them through the existing engine-plus-provider deduplication, so hook-owned opencode rows keep authority. The transcript detail channel routes opencode sessions into the same pair reader by session id. Resume reuses the shared provider command builder with `opencode --session <id>`, verified against the installed CLI help, and the existing preset-plus-argv spawn path wires hooks without new terminal plumbing.

## Alternatives considered

- Add a native sqlite dependency for faster queries — strongest case is full SQL expressiveness with prepared-statement caching. The driver that rules it out is build cost: native rebuilds for packaged Electron plus test-environment mismatch, while the built-in reader measures 708ms for 200 sessions on a 4.9GB store.
- Parse `opencode export` CLI output per session — strongest case is canonical serialization. The driver that rules it out is fragility plus cost: a subprocess per session against a store that already reads stably through indexed queries.
- Mirror the cwd scope matcher into the sqlite layer for pre-filtered lists — strongest case is less import churn. The driver that rules it out is layering: scope filtering belongs to the registry list path that already serves every engine.
- Wire opencode turn-end excerpts through the same database — strongest case is live answer prose on hook-owned opencode turns. The driver that rules it out is hot-path latency: per-turn database opens on every turn end for prose the detail channel already serves on demand; status-only turns stay until a measured need arrives.
- Do nothing / keep claude-plus-codex backfill — no churn. The cost is the reported symptom: the engine hosting the current work stays invisible to session management.

## Consequences

- **Gains**: opencode sessions list with correct directory, first question, tail answer, and counts; detail windows read full pairs; resume runs the verified provider command in a hook-wired terminal; hook-owned opencode rows keep their live behavior untouched.
- **Costs and limits**: scans cap at 200 newest sessions per pass with per-session message windows of 500; sides above 2000 characters and lists above 100 pairs truncate with counts disclosed; turn-end excerpts stay status-only for opencode; per-session provider environment is inherited, not tracked. Revisit when opencode changes its sqlite schema or a live opencode feed becomes ownable.
- **Verification**: machine evidence on touched paths — `npx tsc --noEmit` with strict unused flags is clean, `npx eslint` on touched files reports zero errors, and unit runs pass on `opencode-sessions` 5/5, `transcript-reader` 6/6, `external-session-scanner` 6/6, `agent-session-registry` 14/14, and `agent-engine-capabilities` 5/5. Desktop e2e is not run: provider CLIs are not drivable in CI.
