---
schema: harness-note/1
id: 387ee6c3-8aa7-5bee-958c-b0f420249b10
kind: decision
lifecycle: proposed
created: 2026-09-22
class: simplification
---
# Agent Note: Rename terminal NoteCard to DraftCard to end confusion with workspace notes

Status: proposed

## Problem

`src/renderer/src/stores/note.ts` exports `NoteCard`, `NoteState`, `useNoteStore` keyed by `terminalId`. These are terminal scratch drafts (title/content per terminal tab). The workspace knowledge graph lives separately in `.agents/notes/**` and is projected through `src/main/harness/service.ts` (`HarnessNoteService`) plus `src/main/harness/graph-projection.ts` into the blueprint view. Same word, two concepts. Recent blueprint discussions already mix the two up, and any future wiring risks connecting the canvas to the wrong store.

## Proposal

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

## Risks

- Import churn touches the drawer and quick-note dialogs; mitigate with a single mechanical rename commit plus alias re-export removed in the same commit.
- External docs referencing `useNoteStore` go stale; mitigate by updating `wiki/` mentions in the same change.
