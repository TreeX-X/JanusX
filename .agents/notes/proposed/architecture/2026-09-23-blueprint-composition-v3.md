# Agent Note: Composition blueprint — planning skeleton × evidence assembly (V3)

Status: proposed

Builds on [V2 workspace visualization](./2026-09-23-blueprint-workspace-graph-v2.md) without changing it:
V2's single-workspace views become the evidence-view mode inside V3's switcher. Interactive prototype:
`design/blueprint-note-graph-composition.html` (v10, copy of the V2 prototype — original untouched).

> **修订（2026-09-23，superseded in part）**：§1 的 **L1 存储** 与 §2 的 `module` kind、§4 的骨架写路径
> 已被 [架构师工作区模型](./2026-09-23-architect-workspace-model.md) 取代——骨架从 userData 的 GLOBAL
> JSON 改为**共享 git 仓库里的标准 harness note**，`module` kind 撤回（改用 `initiative` + `parent` 树），
> 跨库边由**接口声明装配**产出而非存储。本 note 的读时组合、stale 证据规则、可复用机制清单、
> UI 语言（§6）全部继续有效。以下原文保留以便对照，**实施时以架构师工作区模型为准**。

## Problem

V2 projects exactly one workspace's note graph. That framing loses the blueprint's core value: holistic
planning — a project of multiple modules, each with responsibilities, designed top-down
(project → module → function group → mechanism), where nodes may live in different workspaces/repos.
Module grouping is planning intent; it does not exist in any workspace's notes, so no projection can
invent it. The irony: the node model already supports all of it (`parentId`/`children`/`rootNodeId` for
depth; per-node `workspaceId`/`primaryWorkspaceId`/`workspaceSnapshot` for cross-workspace binding;
`sourceUri`/`sourceHash` for evidence pinning; `GLOBAL_BLUEPRINT_SCOPE` persistence) — only the
"blueprint = one projection" definition blocks it.

## Goals / Non-goals

- Goals: project-level planning skeleton spanning workspaces; evidence stays in workspace notes;
  skeleton × projections assembled at read time; existing maintenance/approval/conflict rails reused.
- Non-goals (for now, per scope decision): merging projections into one physical graph; cross-workspace
  atomic transactions; changing the harness single-writer rule.

## Proposal

### 1. Three-layer asset model

```
L0 证据资产：各工作区 .agents/notes/*.md（跟 repo 走，可版本化）
   └── 写：各库自己的 harness 事务（单写者不变）；回执/验收/版本全跟库走
        ⇕ 绑定（repositories.primary + codeRefs[{repoId,path,role}] + sourceUri + sourceHash）
L1 规划骨架：架构师工作区 .agents/notes/planning/*.md（共享 git 仓库）
   └── 存：项目→模块 的权责边界、接口契约、模块所属工作区、模块代码位置
   └── 不存：证据正文（永远现场读）；机制级结构（各库自治）；骨架可丢弃重建（删文件即可）
   └── 写：共享 git 仓库 PR + Agent maintenance 事务 + approval（现有 rails）
        ⇕ 装配（读时计算；不做持久化权威源）
L2 组合视图：骨架 × N 个工作区投影
```

> 上表 L1 已按 [架构师工作区模型](./2026-09-23-architect-workspace-model.md) 修订；原文为
> "GLOBAL 蓝图 JSON（userData，`__global__` scope）… 存：项目→模块→机制结构…"。
> 存储变更后，`__global__` scope 的 rev 拼接、无法评审、无法共享、dev 下 scope 漂移四项风险一并消失。

Four conventions:

1. **纯规划节点合法**：`sourceUri` 为空是正常状态（UI 显示"纯规划节点 · 暂无证据绑定"，原型已做）。
   需要长文档的规划节点，物理文件落**主工作区** `.agents/notes/planning/` —— 所有 markdown 仍在
   git 里，蓝图 JSON 只存结构。
2. **证据可 stale 不可碎**：note 更新 → sha 漂移 → 绑定变 stale（置灰 + 重绑提示），不断线。
   重绑是带 `expectedHash` 的普通事务，`maintenance-bridge` 的融合 + 重读重试机制直接覆盖。
3. **跨库 relation 存骨架上**：两端为跨库 `sourceUri`，装配时解析；某库被移除时自动降级
   （复用 unknown → `related-to` + invalid lane 通道）。
4. **删库不删规划**：工作区退出项目时其节点转 stale，骨架保留，Agent 可重绑或归档；
   工作区加入 = `bindNodeWorkspace` 绑定模块节点，该库 notes 经 adapter 自动投影进入。

### 2. Skeleton schema (reuse first)

- Depth: `parentId` / `children` / `rootNodeId` (project → module → mechanism), collapse/expand as-is.
- ~~New kind: `module` (maps to `epic` rendering; kind filter gains one option; prototype v10 verifies).~~
  **撤回（2026-09-23）**：`module` 是跨仓契约变更（`harness-core` 的 `NOTE_KINDS` + agentX 同步 +
  共享 profile digest 重建）。改用 `kind: initiative` 承载模块（`initiative` 已存在，映射到 `epic`
  渲染，视觉层级不变），模块的"机制"子节点用 `parent` 树继续向下。原型 v10 的 `module` 过滤项
  实施时移除或改为 `initiative`。
- Binding pointer per node: `repositories.primary`（架构师 note 声明的归属工作区）+
  `codeRefs[{repoId,path,role}]`（模块代码位置），`workspaceSnapshot`（未打开时的展示）、
  `sourceUri` + `sourceHash`、`boundTerminalId` 不变。
- Relations: same/different-workspace uniform record `{type, target(sourceUri), label}`; cross-workspace
  resolved at assembly; rendering distinguishes them (see §6).

### 3. Composition assembler (new, main-side)

New module above `note-to-blueprint.ts` (adapter stays untouched, per-workspace): inputs = skeleton +
per-workspace projections; outputs = one assembled graph. Responsibilities: namespace node ids per
source (`wsId:nodeId`, skeleton ids unprefixed); resolve cross-workspace relations; downgrade unresolvable
ends; fan-in rev as `{skeletonRev, perSourceRev}` (display: skeleton rev primary, per-workspace rev in
evidence views). Exactly one module may import harness-core/harness-node (existing discipline extends
to the assembler).

### 4. Write-path separation

- Skeleton ops (add/remove node, reparent, bind workspace, cross-ws relation): maintenance transaction
  on the **architect workspace**（共享 git 仓库）, per-action approval, deletions individually confirmed.
- Evidence ops (note content): each workspace's own harness transaction. One cross-workspace user intent
  splits into per-workspace transactions + one architect-workspace transaction, approved in order.
  The two lanes never write each other's territory.
- **原子性定论（2026-09-23）**：跨库意图**分开提交，不做 saga、不做两阶段提交**——两库 git 提交本来
  独立，硬凑原子性只会造出无法回滚的假象。顺序在聊天中叙述。
  详见 [架构师工作区模型 §7](./2026-09-23-architect-workspace-model.md)。
- **两层审批串联**：提案（changeset，可整包/部分通过）由 Agent 在架构师工作区产出，逐动作审批
  （agentX `policy-gate` + `ApprovalPreview`）管工具调用放行。二者串联，非二选一；
  `changeset.ts` 的 `expandGroupSelection` 已实现依赖闭包补齐，只需恢复 UI 入口。

### 5. Chat routing + budget

Wiki tools route per node `workspaceId` to that root (one cmdList/cmdShow set per root). Default context:
selected + one-hop + same-module ancestor chain; cross-module full graph only on explicit request.
`janus.blueprint.read` scope extends from "selected + one-hop" to "selected + one-hop + ancestors".

### 6. UI language (locked in prototype v10)

- Topbar switcher: project panorama default (`默认` badge) + per-workspace evidence views; scope badge
  reads `组合全景 · N 工作区 · rev R · M nodes`.
- Node detail gains an **证据绑定** section (workspace + `已绑定`, file/sha reuse the meta grid;
  unbound shows the pure-planning line). Relation rows suffix a workspace chip when the target's
  workspace differs (including skeleton children under the unbound root).
- Cross-workspace edges: orange dashed (`6 3`, `rgba(255,120,48,.6)`); same-workspace relations stay gray
  dashed; parent stays gray solid. Legend gains the `跨工作区` orange chip. Orange's new appearance is
  confined to this one meaning.
- Everything else reuses V2 verbatim (see inventory below).

## Reusable mechanisms inventory (do not lose)

V3 reuses these V2/prototype mechanisms unchanged; any V3 reimplementation must carry them over:

1. 官方终端图标：与 `assets/icons/*` 1:1（shell/janus/claude/codex/opencode/pi），hover 预热
   (`warmDefaultShellCache`/`warmTerminalCreatePath`)，launching guard + 按节点复用已绑定终端，
   `launchTerminalPreset` Goal/AC 预填 + 复制 prompt。
2. Select 同构下拉：暗色 trigger + chevron 翻转 + 暗色浮层；选中 = 直线左光条
   (`2px`，`border-radius: 0`) + 加粗，无对勾；点外/Esc 关闭；`aria-expanded` + `listbox`。
3. 顶栏语言：左侧单颗红灯关闭（`#ff5f56` + 内高光 + hover/press），标题式切换器，右侧 Janus 胶囊；
   topbar `z 50` / toolbar `z 40` 层叠（生产环境用 portal layer z 12001）。
4. 单状态灯节点：灰阶明暗 + 橙=在途唯一语义色；kind 只用文字（kindtag + 类型）；图例覆盖全部圆点与线型。
5. 加载交互：骨架 900ms pulse + stagger 入场（320ms 基线 + 70ms，边滞后）+ 工具栏 loading + rev 递增；
   `重放加载` 可重演；布局只存本机。
6. 右侧 JanusChat 复用：author/time、thinking 收起、tool card、顶部单张原生确认卡、单行 wiki、
   无 meta 条 composer；读免审批，写走原生 approval（含删除单独确认）。
7. 冲突自愈：`expectedHash` 预检 + Agent 转内重读重融重试 + 聊天内叙述；stale 证据复用同一路径（重绑即事务）。
8. Adapter 映射与降级：kind→type、lifecycle→status、relation 降级、unknown 进 invalid lane 不抛错；
   fixture 升级只动 adapter + 金色快照。
9. V2 单工作区视图整体保留为 V3 切换器中的"证据视图"模式（独立 rev/选择/布局）。

## Implementation order

1. Assembler (main) + per-root adapter invocation + golden snapshots (fixture: 2 workspaces + skeleton).
2. Canvas rendering (fields already sufficient: `evWs`-equivalent = `workspaceId` display name,
   cross-ws edge style, evidence section, ws chips).
3. Chat routing per root + ancestor-chain budget.
4. Stale-evidence state (gray + rebind affordance) reusing the conflict-heal path.
5. Workspace join/leave lifecycle (bind/stale/archive).

Suggested tests: assembler goldens (namespace, cross-ws resolve, downgrade, rev fan-in);
`blueprint-*.test.ts` additions for skeleton ops on GLOBAL scope; i18n + lint gates as usual.

## Acceptance criteria

- [ ] One project panorama renders modules across ≥2 workspaces with bound/unbound states visible.
- [ ] Cross-workspace relation renders orange-dashed + legend; same-workspace relations unchanged.
- [ ] Evidence edit in a workspace marks bound nodes stale without breaking the skeleton; rebind converges.
- [ ] Removing a workspace degrades (not deletes) its nodes and relations.
- [ ] Chat reads route per workspace root within the ancestor-chain budget.
- [ ] All 9 reusable mechanisms above verified present in the V3 implementation.
- [ ] V2 evidence views keep working unchanged inside the V3 switcher.

## Alternatives considered

- Merge N workspace projections into one physical graph — ruled out: id namespacing, cross-repo
  relation semantics, multi-source rev fan-in, and context-budget blowup, while still not producing the
  module layer (the actual missing piece).
- Stay single-workspace (V2 only) — ruled out as the end state: it deletes holistic planning by
  definition; kept as the evidence-view mode instead.

## Risks

- Skeleton/evidence rev skew confusing users; mitigate with per-source rev display in evidence views.
- `module` kind ripples through mappers/snapshots; mitigate via the adapter-only-change discipline.
  **已由撤回消解（2026-09-23）**：不再新增 kind，改用 `kind: initiative` 承载模块。
- Cross-workspace approval ordering (per-ws tx + skeleton tx) needs clear narration in chat.
- Assembler must not become a second importer of harness internals; keep the single-importer rule.

## Open questions (for later refinement)

- Skeleton rev vs per-source rev: one number or two in the panorama scope badge?
- ~~Canonical `module` kind name and its section mapping in KIND_SECTIONS.~~ **撤回**：不新增 kind。
- 见 [架构师工作区模型](./2026-09-23-architect-workspace-model.md) 的 Open questions（接口声明载体、
  模块 lifecycle 与证据 lifecycle 不同步、布局是否跨机共享、"接入工作区"是否写 `repositories.related[]`）。
- Primary-workspace election when the project has no obvious main repo.
- Atomicity boundary for one intent split across workspaces (saga vs best-effort + reconcile).
- Where V2 evidence views sit in the V3 information architecture long-term (kept, per AC above).
