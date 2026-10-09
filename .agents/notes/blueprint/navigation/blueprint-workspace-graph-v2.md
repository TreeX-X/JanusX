---
{
  "schema": "harness-note/2",
  "id": "8ebc6a9a-0c61-5134-aba9-8562dd734ddb",
  "kind": "decision",
  "lifecycle": "proposed",
  "created": "2026-09-23",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5",
  "class": "architecture",
  "extensions": {
    "r5Migration": {"sourceHash":"59858642b4e12bf56f2e48417a044445924e40534ae0c2c779c0630bba290d63"},
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-23-agent-note-blueprint-workspace-visualization-v2--8ebc6a9a.md",
      "sourceHash": "e0cee52d8ea4386513af598e32c4ba54f089b34d49e3a999c064f78b560e3fee",
      "originalBodyHash": "61e417ad5b19a890e83bc3ac48ea018de0e1558122cfbbf0674510293d0a8ac0",
      "category": "formal",
      "reason": "Retains the source decision in proposed lifecycle; body documents Blueprint workspace visualization (V2). No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ./2026-09-22-blueprint-note-graph-readonly.md -> ./2026-09-22-blueprint-note-graph-readonly--1432f7b8.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/architecture/2026-09-23-blueprint-workspace-graph-v2.md",
        "sourceHash": "4ea846f9fd2c0222c212e0b6878f7d470bc21673839c2342ba4ba1a77b616ae8",
        "originalBodyHash": "7e080b72f6eaa2227245b04bb0d49a2d36ff8b5fbd296e64bc921420dea40a5f"
      }
    }
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/17bbe20e-f05c-470c-aee1-3f92a86369ab"
}
---
# Blueprint workspace visualization (V2)


Extends [the read-only NoteGraph proposal](./blueprint-note-graph-readonly.md) with the locked
view-layer design. Interactive prototype: `design/blueprint-note-graph.html` (v9). V3 (composition blueprint
spanning workspaces) is recorded separately and builds on this note without changing it.

## Problem

The read-only proposal defines view semantics (pure view, Agent-only writes, NoteAdapter v1) but not the
concrete high-fidelity interactions: what the topbar holds, how dropdowns behave in dark theme, how terminals
are picked, how nodes encode state. Without a locked reference, reimplementation drifts per surface.

## Decision

V2 = one workspace's note graph, projected via NoteAdapter v1, rendered in three columns. No cross-workspace
composition, no planning skeleton, no `module` kind. Switching workspaces = switching evidence views
(topbar switcher), each view independent (own rev, own selection, own layout).

### Layout: topbar + toolbar + three columns

- Topbar (44px, `blueprint-workbench-topbar` language): red close dot on the **left** (single dot,
  `#ff5f56` with inset highlight + dark ring, hover brighten, active scale — mirrors
  `.blueprint-workbench-close`), blueprint switcher in the middle (text-like trigger + chevron, default =
  current workspace, `当前` badge marks workspace ownership not selection), Janus capsule on the right
  (identity + name + status, click toggles working/idle in prototype).
- Toolbar: scope badge (`<ws> · rev N · NoteAdapter v1 · M notes · layout 本机`), `Agent 维护 · 用户只读`
  lock, search (dim non-hits), status/kind custom dropdowns, `适应画布` / `重放加载` / `在对话中变更`
  (focuses chat — the only edit entry), layout save state (local only).
- Stacking: topbar `z 50`, toolbar `z 40` (both `position: relative`). Rationale: bars and cards all carry
  `backdrop-filter` (each a stacking context, all `z auto`); cards come later in DOM and would cover
  in-bar dropdowns. This is the prototype simplification of the production `select-portal-layer` (z 12001);
  production must keep the portal approach.

### Toolbar dropdowns (Select.tsx 同构)

Native `<select>` is banned in dark theme (OS-white popup). Both filters are custom dropdowns mirroring
`Select.tsx` + `Select.module.css`: dark trigger (26px) + chevron (rotates 180° on open) + dark floating
menu (`rgba(20,20,20,.98)`, blur, 8px radius) + options. Selected option = **straight 2px orange left bar
(`border-radius: 0`, no rounding)** + semibold, no checkmark. Outside-click / `Esc` closes, `aria-expanded`
+ `listbox` kept.

### Left column: read-only preview + terminal execution

- Preview: eyebrow (`kind · lifecycle`), title, chips, Goal + description, AC checklist with %, relations,
  file/sha meta. Nothing editable.
- Terminal execution footer (pinned, content scrolls above it): `TerminalSelector` language with
  **official brand icons 1:1 from `src/renderer/src/assets/icons/`** (shell/janus/claude/codex/opencode/pi);
  dropdown reuses the straight-bar selected language; `hover` pre-warms (`warmDefaultShellCache` /
  `warmTerminalCreatePath`); launching guard (`启动中…`, busy dot); bound-terminal reuse by node;
  `在终端中实施` via `launchTerminalPreset` (Goal/AC prefilled prompt) + `复制` prompt shortcut.

### Middle column: canvas

- One status dot per node (planning dark-gray / in-progress orange = the only semantic color /
  done light-gray / archived hollow). The second kind dot was removed: 5 gray shades at 8px are
  indistinguishable, and kind is already duplicated by `kindtag` + `EPIC/FEATURE/TASK` text.
- Edges: parent solid gray, relations gray dashed by type (`depends-on` 5 4 / `implements` 2 3 /
  `related-to` 5 5). Subtree collapse, drag = local layout only, minimap, legend (4 statuses + 2 edges).
- Loading: skeleton 900ms pulse + staggered entry (320ms base + 70ms stagger, edges lag) + toolbar
  `正在投影 note…`; `重放加载` replays it and bumps rev.

### Right column: JanusChat reuse

Author/time meta, collapsible thinking, tool cards, single `.janus-runtime-approval` card in a dedicated
slot (no second confirm strip), single-line collapsible wiki trace, todo-strip, composer (`›` prefix +
borderless textarea + orange send + no meta bar — `default`/`per-action` chips removed).

## Non-goals (explicitly V3)

Cross-workspace composition, planning skeleton nodes, `module` kind, per-root wiki routing, stale-evidence
states, workspace join/leave lifecycle.

## Alternatives considered

- Keep native `<select>` filters: zero custom-dropdown work and free keyboard/ARIA parity, but the OS-white popup breaks the dark theme and reintroduces the exact inconsistency the toolbar language removes; rejected in favor of the `Select.tsx`同构 custom dropdowns with straight-bar selection.
- Keep the second kind dot on canvas nodes: kind stays visible without reading text, but 5 gray shades at 8px are indistinguishable and kind is already duplicated by `kindtag` + type text; rejected in favor of one status dot + text tags.
- Keep the full JanusChat chrome in the right column (thread bar, resource strip, status strip, message buttons, model notice): no hiding rules to maintain, but the V2 prototype body is only approval slot + message stream + wiki line + todo + composer; rejected in favor of the single-native-card reuse with the listed chrome hidden (see B/C/D landing records for what stayed).
- Do nothing / leave interactions unlocked per surface: no reference to hold, but reimplementation drifts per surface (topbar/dropdown/terminal/node encoding diverge); rejected in favor of this locked high-fidelity reference with prototype v9 as arbiter.

## Acceptance criteria

- [ ] Toolbar exposes zero create/delete entries; the only edit entry focuses the chat turn.
- [ ] Both filter dropdowns use the custom Select language with straight-bar selection; no native select remains.
- [ ] Terminal icons match `assets/icons/*` 1:1; hover pre-warm, launching guard, and bound reuse behave per spec.
- [ ] Node state reads from one status dot + text tags; legend covers every dot and edge style on canvas.
- [ ] Loading skeleton + stagger entry + rev bump replay on demand; layout persists locally only.
- [ ] Composer carries no model/permission chips; approval uses exactly one native card.

## Consequences

- Note fixture upgrades (new kind/lifecycle) must only touch `note-to-blueprint.ts` + golden snapshots;
  the canvas must degrade unknowns into the invalid lane, never throw.
- Custom dropdowns must keep keyboard/ARIA parity lost by dropping native selects.
- Prototype layout coordinates are demo data; production layout comes from the persisted local layout store.
