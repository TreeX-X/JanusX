---
schema: harness-note/1
id: fc8ba315-f289-423c-babc-2b048bc2726b
kind: decision
lifecycle: implemented
created: 2026-09-22
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b
    reason: Orca-aligned requirement assumes every mounted CLI is scannable without list edits
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/ba08f562-a2bc-4a97-98dc-8b835bcc9107
    reason: Opencode sqlite driver is the second engine served by the derived scan set
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/1a6947ed-0b47-4d33-aa9a-21d37be1db07
    reason: Transcript detail reads serve pi pairs through the same session-keyed channel
---

# Agent Note: Derived session scan set plus pi file driver

## Problem

`src/main/sessions/external-session-scanner.ts` carries a hardcoded engine list beside the capability table, so every newly mounted terminal type needs a manual list edit plus a loop-branch edit before any session appears. Pi ships on-disk session files with session ids, working directories, and message pairs, yet the table marks its store null and the scanner never walks it, leaving mounted pi conversations invisible next to the same gap opencode just closed.

## Decision

The scan set derives from the capability table in table order: every hook source with a non-null session store scans, and table rows without a store keep skipping with a reason. File parsers register in a map keyed by store kind beside the capability row, so a new file-backed engine lands as one table row plus one parser entry; kinds without a parser skip file by file instead of failing the scan. The sqlite branch stays behind its store-kind check. Pi reads its session files through a dedicated parser: the session record supplies the authoritative id and working directory with the slug directory as decode fallback, the first user text seeds the prompt, the tail assistant text seeds the excerpt, and assistant messages count turns. Pi detail reads pair the same file through the shared bounded reader. Resume runs `pi --session <file>` from the persisted transcript path and stays disabled with the stated reason when the file is absent, matching the provider contract that resume needs the file rather than a bare id.

## Alternatives considered

- Keep the hardcoded engine list and extend it per engine — strongest case is explicit review per addition. The driver that rules it out is drift: the list and the table already disagreed on opencode and pi, and every future driver repeats the two-spot edit.
- Mirror the external-CLI install registry as the scan gate — strongest case is scanning exactly mounted tools. The driver that rules it out is layering: install state tracks binaries while readability tracks stores, and an installed tool without a driver would scan as an empty pass with no signal.
- Snapshot pi rows through on-open full parses without caps — strongest case is lossless history. The driver that rules it out is IO: the shared bounded window plus per-turn caps already bound the worst case on large session files.
- Decode pi working directories from slugs as primary — strongest case is independence from record shape. The driver that rules it out is precision: dash-containing directory names decode ambiguously, so the record stays authoritative with decode as fallback.
- Do nothing / keep the manual list with claude, codex, and opencode — no churn. The cost is the reported symptom: each newly mounted terminal type stays invisible until someone remembers the second edit.

## Consequences

- **Gains**: mounted engines with drivers scan with zero scanner edits; pi sessions list with correct directory, first question, tail answer, and counts; pi detail windows read full pairs; pi resume runs the verified file-based command.
- **Costs and limits**: pi turn-end excerpts stay status-only like opencode, served on demand through the detail channel instead; slug-decoded directories stay approximate where names contain dashes; janus history remains unscanned as app-local state with live hook rows covering it. Revisit when pi changes its session file shape.
- **Verification**: machine evidence on touched paths — `npx tsc --noEmit` with strict unused flags is clean, `npx eslint` on touched files reports zero errors, and unit runs pass on `agent-engine-capabilities` 5/5, `opencode-sessions` 5/5, `transcript-reader` 7/7, `external-session-scanner` 7/7, `agent-session-registry` 14/14, and `transcript-excerpt` 6/6. Desktop e2e is not run: provider CLIs are not drivable in CI.
