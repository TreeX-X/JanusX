# Agent Note: Blueprint workspace visualization (V2)

Status: proposed

Extends [the read-only NoteGraph proposal](./2026-09-22-blueprint-note-graph-readonly.md) with the locked
view-layer design. Interactive prototype: `design/blueprint-note-graph.html` (v9). V3 (composition blueprint
spanning workspaces) is recorded separately and builds on this note without changing it.

## Problem

The read-only proposal defines view semantics (pure view, Agent-only writes, NoteAdapter v1) but not the
concrete high-fidelity interactions: what the topbar holds, how dropdowns behave in dark theme, how terminals
are picked, how nodes encode state. Without a locked reference, reimplementation drifts per surface.

## Proposal (V2 scope: exactly one workspace projection)

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

## Risks

- Note fixture upgrades (new kind/lifecycle) must only touch `note-to-blueprint.ts` + golden snapshots;
  the canvas must degrade unknowns into the invalid lane, never throw.
- Custom dropdowns must keep keyboard/ARIA parity lost by dropping native selects.
- Prototype layout coordinates are demo data; production layout comes from the persisted local layout store.
