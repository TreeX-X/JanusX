---
schema: harness-note/1
id: 0d703ca1-d703-451f-9ac6-15792c08f45d
kind: decision
lifecycle: implemented
created: 2026-09-27
class: feature
---

# Markdown emphasis renders as orange text without fill blocks

## Problem

The shared Markdown renderer styles emphasis with filled blocks: inline code carries an orange-tinted background plus border pill, and blockquotes carry an orange-tinted background panel. Strong renders white bold, which competes with headings instead of reading as the product accent. The fills break CJK line rhythm and add visual weight every time an agent emphasizes a term, so emphasized text must read as orange type with no background.

## Decision

`src/renderer/src/components/viewers/markdown-components.tsx` owns the single emphasis language for every preview surface. Strong renders `#ff9159` at weight 700; em renders `#ff9159` italic; inline code renders `#ff9159` in the mono stack with transparent background, no border, and no padding; blockquote keeps the 3px `#ff7830` left rule on a transparent background with slim padding; `mark` renders transparent background with `#ff9159` text so raw `<mark>` passthrough cannot reintroduce a fill. Code fences, tables, headings, links, and task checkboxes keep their existing treatment. MarkdownViewer, LocalFileStage, QuickNote, chat MarkdownContent, and NoteWikiPanel inherit the change through the shared components with no call-site edits. Image resolution ownership stays with [markdown preview local assets](./2026-09-18-markdown-preview-local-assets--64286344.md), and toolbar syntax production stays with [note drawer markdown toolbar](./2026-09-19-note-drawer-markdown-toolbar--b327657e.md).

## Alternatives considered

- Keep the pills but shrink padding and soften the fill — strongest case is that inline code stays visually distinct from strong text at a glance. The driver that rules it out is the explicit request: any fill reads as a color block in dense CJK prose, and a softer pill still interrupts line rhythm.
- Assign one hue per emphasis kind (strong orange, code amber, em rose) — strongest case is faster scanning between semantic kinds. The driver that rules it out is accent multiplication: the shell speaks a single orange accent, and three hues turn routine agent emphasis into rainbow noise.
- Do nothing / reuse — keeping the current fills and white strong costs no code. It leaves the reported problem in place: emphasis keeps rendering as blocks rather than orange type, so it answers nothing.

## Consequences

- **Gains**: emphasis across chat, central preview, product column, QuickNote, and engineering wiki reads as one orange type language; CJK paragraphs keep even line rhythm with no pill interruptions; quote blocks keep their left-rule affordance without a tinted panel.
- **Costs and limits**: inline code, strong, em, and links now share `#ff9159`, distinguished only by weight, slant, family, and link hover underline. The revisit signal is user confusion between code and strong in the same sentence; the fix then is a lighter code tone, never a restored fill.
- **Verification**: `npx tsc --noEmit` passes with no output; `npx eslint src/renderer/src/components/viewers/markdown-components.tsx` reports nothing; `npx vitest run tests/unit/draft-card/quick-note-view.test.ts` passes 13/13.
