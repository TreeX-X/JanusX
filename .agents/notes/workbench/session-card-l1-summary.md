---
{
  "schema": "harness-note/2",
  "id": "cca3e58f-6d9f-4057-a1eb-68e773a26313",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-06",
  "class": "feature",
  "updated": "2026-10-14T14:27:41.274Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Session card L1 carries the v6 summary rows

## Problem

A collapsed session card shows one title line and a chevron. Engine, progress, freshness, and what the session is about all sit behind the expand, so the list cannot be scanned: identifying a session costs an expand per card, and the collapsed state loses the glanceable summary the dock list exists for. The v6 design in `design/session-mgmt-hifi.html` specifies three always-on rows for exactly this scan.

## Decision

`SessionCard` renders three L1 rows on every card, collapsed or not. The header runs the engine icon, the engine name, an optional external badge, a `「」`-wrapped title derived from the first clause of `firstPrompt` (cut at the first CJK or ASCII punctuation, capped at 24 characters), a mono status tail, and a persistent hairline chevron button that rotates its glyph 180° on the shared 240 ms expand curve. Under it, `firstPrompt` runs one muted ellipsis line, then a mono meta line with turns and relative time; checkpoint counts and no-checkpoint markers have been removed from session management. The L2 region keeps the cwd/branch line and the pale content cards described in [Session surfaces derive from the chrome token](./session-card-surface.md); the meta line L2 used to carry is gone because L1 owns it. The header row and its chevron button share one expand toggle.

## Alternatives considered

- Keep the single title row — strongest case is the smallest chrome and no duplication with L2. The driver that rules it out is scanning: one line forces expand-to-identify on a list whose job is triage.
- Title row shows the full `firstPrompt` while status and counts stay in L2 — strongest case is zero derived strings. The driver that rules it out is width: at dock width a lone long title ellipsizes into uselessness, and the three-row density is the design's actual content.
- Derive the title from cwd/branch instead of the prompt — strongest case is stability, since prompts vary in shape. The driver that rules it out is identity: the prompt is what the user remembers about a session.
- Do nothing / keep the one-line L1 — no code and no derived strings. That is the entire benefit.

## Consequences

- **Gains**: a collapsed card answers engine, state, progress, freshness and gist without expanding; expand shows depth instead of identity.
- **Costs and limits**: the title is a derived string — punctuation-free prompts fall back to a 24-character slice and read truncated. The fold control occupies 20px of header width on every card, always-on rather than hover-revealed; archived cards keep their toggle and show `归档` plus the chevron where the design uses a bare `归档`. The meta line lives only in L1, so consumers looking for it in the expanded body will not find it.
- **Verification**: `npm run typecheck` and component eslint pass; `tests/unit/planche-theme.test.ts` passes 14/14 with the remaining two surface declarations and current use sites. Desktop reading and continuation checks plus the unrelated strict-unused failures are recorded in [windowed session reading](../sessions/records/session-windowed-reading.md).
