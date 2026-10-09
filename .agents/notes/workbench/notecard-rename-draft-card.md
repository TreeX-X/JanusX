---
{
  "schema": "harness-note/2",
  "id": "387ee6c3-8aa7-5bee-958c-b0f420249b10",
  "kind": "decision",
  "lifecycle": "proposed",
  "created": "2026-09-22",
  "class": "simplification",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-22-agent-note-rename-terminal-notecard-to-draftcard-to-end-confusion-with-w--387ee6c3.md",
      "sourceHash": "ee9f231eb1a3a4fa5da6dba6ea534970134c27c8583dbf7a7e1766a051a336d3",
      "originalBodyHash": "a036c96b7b68dbeeb0190a4a04a4d45bff81a7104df79cd092b41479a678aee7",
      "category": "formal",
      "reason": "Retains the source decision in proposed lifecycle; body documents Rename terminal NoteCard to DraftCard to end confusion with workspace notes. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/simplification/2026-09-22-notecard-rename-draft-card.md",
        "sourceHash": "693a97fcecc7896858e2efd7426596c05b13cf228b39cb009a30d5b77bff23a1",
        "originalBodyHash": "a68b4da7634e1643a14d9da505a4cfb3987dc8fe8221cb030ba09defb9ba5074"
      }
    }
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---
# Rename terminal NoteCard to DraftCard to end confusion with workspace notes


## Problem

`src/renderer/src/stores/note.ts` exports `NoteCard`, `NoteState`, `useNoteStore` keyed by `terminalId`. These are terminal scratch drafts (title/content per terminal tab). The workspace knowledge graph lives separately in `.agents/notes/**` and is projected through `src/main/harness/service.ts` (`HarnessNoteService`) plus `src/main/harness/graph-projection.ts` into the blueprint view. Same word, two concepts. Recent blueprint discussions already mix the two up, and any future wiring risks connecting the canvas to the wrong store.

## Decision

Rename the terminal-draft concept only; workspace notes keep the `note` name:
- `src/renderer/src/stores/note.ts` -> `src/renderer/src/stores/draft-card.ts`, `NoteCard` -> `DraftCard`, `NoteState` -> `DraftCardState`, `useNoteStore` -> `useDraftCardStore`.
- Selectors `getCardsByTerminal`/`getActiveCard` -> `getDraftsByTerminal`/`getActiveDraft`; actions `addCard/removeCard/updateCard/setActiveCard` keep signatures, only identifiers change.
- One codemod commit updates imports in terminal drawer, quick-note components (`src/renderer/src/components/note/*`), and `tests/unit/note/*` (folder renamed to `tests/unit/draft-card/*`).
- No behavior change; drafts stay renderer-local zustand state, never persisted to `.agents/notes`.

## Alternatives considered

- Keep both names and document the difference — strongest case is zero diff. The driver that rules it out is that docs do not stop mis-wiring; the blueprint refactor already needs a clean `NoteGraph` vocabulary.
- Rename workspace notes instead (e.g. `harness entries`) — strongest case is fewer renderer edits. The driver that rules it out is that `.agents/notes`, `harness-note/1`, and all harness packages already standardize on `note`; renaming the larger ecosystem costs more.
- Do nothing / reuse `note` for both — staying put avoids churn. The cost is continued ambiguity at exactly the moment blueprint becomes note-backed.

## Acceptance criteria

- [ ] `grep -r "useNoteStore\|NoteCard" src/renderer` returns zero hits outside a deprecation shim.
- [ ] Terminal drawer drafts still add/remove/update/activate per terminal with existing unit tests passing under new names.
- [ ] Blueprint/harness code refers to `note` unambiguously (workspace notes only).

## Consequences

- Import churn touches the drawer and quick-note dialogs; mitigate with a single mechanical rename commit plus alias re-export removed in the same commit.
- External docs referencing `useNoteStore` go stale; mitigate by updating `wiki/` mentions in the same change.
