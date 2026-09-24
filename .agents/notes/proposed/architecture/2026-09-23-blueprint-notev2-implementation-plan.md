# Agent Note: 蓝图重构 noteV2 实施计划（机制 + UI）

Status: proposed

> **修订（2026-09-23，E 段）**：本轮对话确立了**架构师工作区模型**
> （[note](./2026-09-23-architect-workspace-model.md)）。P0/P1 的既有勾选记录继续有效，但**实施顺序
> 重排**：四条正确的/基础性的缺陷提到最前（E 段），V3 组合装配降为后续。阅读顺序建议：先 E 段，
> 再看 P0/P1 的历史记录。
>
> **修订（2026-09-25，总序，用户拍板）**：实施总序改为 WorkFlowX 新版（逐项过、用户审核敲定）
> → 同步 agentX 贯通机制 → JanusX 最后（蓝图消费者，只做适配）。原“P3 证据门”降为例行输入，
> 不再作为版本道前置条件。逐项裁决见“实施总序”节，用户确认一项落一项。

## Problem

V2 基线为 `2026-09-22-blueprint-note-graph-readonly.md`（只读 NoteGraph 语义）与
`2026-09-23-blueprint-workspace-graph-v2.md`（单工作区三列高保真）。
上一轮汇报确认：`src/main/notes/` 三件套与 shim 已建，但以下未闭环——
`projectView` 未透出 `adapterVersion`（工具栏徽是写死字符串）、`invalid[]` 无 UI、
`NoteCard` 与 workspace notes 同名、`create/update/delete` 直写后门仍在、
legacy JSON 仍可写、维护面板仍是自定义 queue 而非原生 approval、`plan` 模式缺失、
V2 左列终端 footer / 图例分型 / 加载 stagger / composer 去 chips / native select
清理均未对齐原型。V3（`2026-09-23-blueprint-composition-v3.md`）不在本计划内。

## Proposal

按 P0（正确性/只读闭环）→ P1（V2 高保真对齐）顺序实施，每步最小改动 + 可验证。
V3 assembler / `module` kind / 跨库 orange 边 / stale 重绑明确为后续，不在本计划动 adapter 以外。

### P0-1: `projectView` 透出 `adapterVersion`（本步先做）

- `HarnessNoteService.projectView` 返回 `{ blueprint, rev, repoId, repoName, invalid, adapterVersion }`，
  值为 `src/main/notes/note-types.ts` 的 `ADAPTER_VERSION`（当前 `v1`）。
- `HarnessGraphResult` 同步加 `adapterVersion`；`Blueprint` 加可选 `adapterVersion?: string`，
  `projectGraph()` 写入，legacy JSON 不写（undefined 即旧数据）。
- 工具栏 `scopeBadge` 由写死 `NoteAdapter v1` 改为读 `currentBlueprint.adapterVersion ?? 'v1'`。
- 测试：adapter golden 断言 `projectGraph().adapterVersion === 'v1'`；
  `harness-service` 断言 `projectView().adapterVersion === 'v1'`。

### P0-2: `invalid` lane 渲染

- Renderer 读取 `projectView.invalid`（经 IPC `HarnessGraphResult.invalid`），画布不抛错；
  工具栏或图例旁显示 `invalid N` + 点击定位 relPath + 首条 diagnostic。
- `adapterVersion` 徽与 invalid 计数同行，避免第二徽。
- 测试：含坏 note 的 fixture → `invalid.length === 1` 且画布仍渲染有效节点。

### P0-3: `DraftCard` 改名去歧义

- 按 `2026-09-22-notecard-rename-draft-card.md`：`stores/note.ts` → `stores/draft-card.ts`，
  `NoteCard→DraftCard` 等纯改名，行为不变；`components/note/*` 与 `tests/unit/note/*` 同步。
- AC：`NoteCard|useNoteStore` 在 `src/renderer` 零命中（shim 也不留）。

### P0-4: 收敛直写入口 + legacy 过渡说明

- renderer 直写已删：右键 markStatus 菜单与回调移除；stores/blueprint.ts 的
  updateNode/deleteNode/renameBlueprint/deleteBlueprint 对 harness lane 直接拒绝
  （项目图谱为只读：变更走对话 + Agent 事务，不发 IPC）；createBlueprint 在
  renderer 层直接拒绝（无新建 UI，新图由 Agent/迁移创建）；BlueprintView 重命名按钮
  对 harness 源禁用；updateBlueprint 仅 canvasLayout/collapsedNodeIds overlay
  可写（main updateProjectGraph 本就拒掉共享元数据）。
- main project-lane 守卫复核：约 15 处 isProjectGraphId 分支已覆盖内容写
  （HARNESS_MANAGED/HARNESS_READONLY），本次未新增——唯一可达的 renderer 调用
  已在上条收敛。
- legacy JSON deliberately 保持可写（迁移过渡）：blueprint-store.test.ts 4 用例、
  team local-blueprint-repository 新建、分析器回写、候选采纳、维护结算仍服务于
  未迁移蓝图，与 2026-09-18-blueprint-migration（loop stays until consumers
  migrate）一致；全量硬拒会与其冲突，故拒绝点收敛到 renderer 新建入口。
  逐个蓝图迁移归档后 legacy 自然清空，无需批量锁死。
- plan approval 回填与 blueprint-tools ViewPatch 校验见 P0-4c/P0-4d
  （AgentApprovalMode 加 plan，未知值回退 per-action）。

### P1: V2 高保真对齐（原型 v9 逐项，2026-09-23 落地记录）

1. scope 徽完整 `<ws>·rev·NoteAdapter <ver>·M notes·layout本机` + `在对话中变更` 按钮。
2. [x] 左列终端 footer 核验已实现（BlueprintCanvas 1234-1274：图标/预热/guard/复用/预填/复制），未重复造。
3. [x] 边分型落地：parent 灰实线，depends-on 5 4 / implements 2 3 / related-to 5 5（relationDash），图例 SVG 分型 + 复用 maintenance.relationType 文案；canvas-layout 单测同步。
4. 加载：900ms pulse + stagger（320ms + 70ms，边滞后）+ `正在投影 note…` + `重放加载` rev bump。
5. 右列纯 `JanusChat`：composer 去 model/permission chips，单张原生确认卡，单行 wiki trace。
6. 清理残留 native `<select>`（维护面板 targetNode 等）→ 自定义 `Select`。

## Alternatives considered

- V3 组合装配优先（先做 assembler/跨库橙边/stale 重绑）：最强论据是早见全景，但 E0 的四个基础缺陷（多 worktree 撞 id、`repositories`/`codeRefs` 丢弃、跨库 target 截断、`primaryWorkspaceId` 恒 null、`harness:changed` 无订阅）会让装配建在错误前提上；故降为后续，先修正确性与基础性缺陷。
- legacy JSON 全量硬拒写：最强论据是一刀切只读闭环，但与 `2026-09-18-blueprint-migration`（loop stays until consumers migrate）冲突，未迁移蓝图的分析回写/候选采纳/维护结算仍需写通道；故拒绝点收敛到 renderer 新建入口，存量逐个迁移归档。
- 用 agent 逐动作审批替换变更集审批：最强论据是少一套 UI，但 C2 整包删除是能力退化（E1：“部分通过”消失）；正确关系是两层串联（内层管工具调用放行，外层管提案要哪几条），故恢复组级勾选入口而非二选一。
- Do nothing / 停在 P0/P1 不做 E 段：零增量风险，但“进入终端必报 `bindWorkspaceFirst`”、多 worktree 吞条目、外部改 note 不刷新三个缺陷继续成立，原型核心动作保持死亡；故 E 段必须做。

## Acceptance criteria

- [x] P0-1: `projectView` 与 IPC 结果含 `adapterVersion === 'v1'`，工具栏徽为真实版本回显。
- [x] P0-2: 坏 note 进 `invalid` lane，有计数与定位，无未捕获抛错。
- [x] P0-3: 改名后终端草稿单测全绿，`note` 仅指 workspace notes。
- [x] P0-4a/b: project lane 无 renderer 直写可达路径（UI 入口删 + store 守卫）；legacy 保持迁移过渡可写，拒绝点收敛到 renderer 新建入口。
- [x] P0-4c: plan 档贯通（类型/normalize/双端选项/读免审由兄弟仓策略层执行，默认仍为 per-action）。
- [x] P0-4d: blueprint-tools 加 janus.blueprint.view，zod strict 校验 ViewPatch（overlay-only），未知节点/超限/文件字段 fail-closed。
- [x] P1: 4 项落地 + 2 项核验已实现（P1-2/P1-4），P1-5 deferred 见上。

## Risks

- `Blueprint` 加可选字段需兼容旧 JSON 持久化；`ProjectView/HarnessGraphResult` 加必填字段需同步所有 mock。
- locale `scopeBadge` 改插值需同步 en/zh-CN，否则 `i18n:check` 失败。
- P0-4 改动面大，拆分为“先 UI 入口删除，再 store/IPC 守卫”，避免一次大爆炸。


## B: V2 终态右列（2026-09-23，已落地，明细见 git 历史）

方向：右列换纯 JanusChat + 删 queue chrome + composer 去 chips。三项全[x]
（B1 minimalComposer、B2 维护面板 chat-first、plan 缺省 setApprovalMode 一次）。
未做（V3）：原生 approval 接管 apply、候选 inbox 等旧 IA 残留 → E1/E3。


## C: 工作区切换 + 右列纯对话（2026-09-23，已落地，明细见 git 历史）

标准：只在工作区之间切换，不读取旧蓝图数据；右列只有对话（对齐 design/blueprint-note-graph.html）。
C1 只切工作区（listBlueprintSummaries 只返本 checkout 投影、store workspace 化、
切换器=各工作区投影、删 legacy 流入口）与 C2 右列纯对话（面板压成 header +
JanusChat + 空态）全[x]。后果（显式）：维护 start/apply/audit/undo、迁移、
候选采纳暂无 UI 入口，service/IPC 保留待 agent 接管 apply（V3）。


## D: 右列对齐 HTML 原型（2026-09-23，已落地，明细见 git 历史）

根因：minimalComposer 只去了 chips，右列仍渲染 JanusChat 全套 chrome，而原型 body
只有审批槽 + 消息流 + wiki 单行 + todo + composer。四项全[x]
（藏 thread 栏/资源 scope/model notice/消息按钮/状态条 + 选择菜单永不打开、
composer › 前缀 + 38px 橙发送、保留消息/审批单卡/todo/中途提问门/错误卡）。
未做：wiki 单行索引、气泡像素重绘、发送 glyph、空态横幅。


## 实施总序（2026-09-25 用户拍板，12 项已裁决）

1. WorkFlowX 新版：下表逐项过，用户审核敲定后发版（新版本 + 新 digest +
   fixtures/expected-hashes 锁 + release-matrix）。
2. 同步 agentX：harness-core/node 按新版实现贯通（哈希/校验/仓库/watcher/锁/恢复 +
   wfx-notes 同结果 + 同步工具）。
3. JanusX 最后：蓝图投影 + 装配器 + UI 只做消费者适配（E0 剩余 → 装配器 →
   橙边/未接入 → 部分通过），不动标准。

| # | 项 | §10b 建议 | 用户裁决（2026-09-25） |
|---|---|---|---|
| 1 | 能力注册表 | 砍 | 砍：不改 |
| 2 | 接口一等字段 | 版本道（有条件） | 过：最小字段 + 不进 contract hash |
| 3 | 机制行为栏 | 砍 | 砍：不改 |
| 4 | 边界栏 role 三档 | 后议 | 议：先不动 |
| 5 | 反链 | P2 实现层 | 过：P2 实现，不碰密封 |
| 6 | 摘要栏 | 不加字段 | 砍字段：索引层按节提取 + 绑哈希 |
| 7 | 接口表进索引 | 不加字段 | 过：约定层 |
| 8 | 多任务调度 | S9 另立项 | 议：S9 另立项 |
| 9 | AC 编号错配 | 工具层 | 过：工具层显示 |
| 10 | hash 雪崩放宽 | 维持 | 维持：不换 |
| 11 | lifecycle/execution 双轨 | 不并 | 不并：只文档定界 |
| 12 | 接口载体结构化 | 约定层 | 过：约定层 |
| — | §9 已砍 8 项（验收/验证/仓库/relation/文件名/class-tags/状态/版本单钉） | 默认不开启 | 不开：需点名才重开 |

## E: 架构师工作区模型 —— 实施顺序重排（2026-09-23，2026-09-25 服从 P1/P2/P2b/P3）

依据：[架构师工作区模型](./2026-09-23-architect-workspace-model.md)（新，执行顺序以其 Scope boundary 为准）
与 [V3](./2026-09-23-blueprint-composition-v3.md)（已部分修订）。
原则：**P1 冻结 → P2 三仓底层 → P2b note 迁移 → P3 蓝图上层**；E 段内再按正确性/基础性排序。
E 段不引入新概念，E0-2 之后全部是本仓投影层 + 装配器的修复。

### E0 前置（拆分执行：E0-1/E0-4 随 P1，其余随 P3；E 段内顺序 E0 → E1 → E2 → E3 → E4）

| 编号 | 内容 | 为什么排这么前 |
|---|---|---|
| E0-1 | `projectGraphId` 从 `repoId.slice(0,8)` 改为按 `rootKey` | 纯 bug。同 repo 多 worktree 撞 id，renderer 去重后第二个消失（`stores/blueprint.ts:100`）。**"多工作区表达一个项目"的地基**，不修则后续全部工作在错误前提上 |
| E0-2 | `note-provider.ts` 的 `toNoteDoc` 透出 `repositories` 与 `codeRefs` | 模块↔工作区绑定的唯一载体，当前被整个丢弃。`NoteDoc` 加两个可选字段 |
| E0-3 | `projectRelations` 保留完整 target URI（含 repoId），不再 `split('/').pop()` | `note-to-blueprint.ts:246` 把 `note://<repoId>/<id>` 截成末段，repoId 丢失 → 无法判定跨库、无法上橙色边、同 id 撞车会静默连错 |
| E0-4 | 投影节点写入真实 `primaryWorkspaceId`（来自 `repositories.primary`） | 当前恒为 null（`note-to-blueprint.ts:215-218`），导致 Canvas"进入终端"**必定**报 `bindWorkspaceFirst`（`BlueprintCanvas.tsx:542,589`）。原型里最核心的动作是死的 |
| E0-5 | 恢复 `harness:changed` 订阅（`HarnessScopeBar` 已无挂载点） | 外部改 note 后画布不刷新；read-only note 承诺的 "auto-refreshes on watchNotes rev bumps" 是空话 |

E0 的五项可独立提交、可独立验证，互不阻塞。拆分执行：E0-1 与 E0-4 随 P1（前者是正确性，后者是可用性，
均与 schema 无关）；E0-2/E0-3/E0-5 随 P3（依赖 P2 的哈希/watcher/锁语义稳定后）。

### E1 恢复"部分通过"（后端已备，只缺入口）

- `changeset.ts`（795 行）完整保留：`expandGroupSelection`（依赖闭包补齐）、`selectOperations`
  （拓扑排序 + 环检测）、delete 逐项确认、审计落盘、撤销 —— 全部可用且无调用方。
- 需恢复的 UI：工程区生成提案按钮 + 组级勾选（`BlueprintMaintenanceIntentGroup`：node / bindings /
  relations / deletes）+ 一次性通过 / 部分通过两个动作。
- **C2 段删除整包审批是能力退化**：用 agent 逐动作审批"替换"了变更集审批，而不是串联。正确关系：
  - 内层 = agentX `policy-gate` 逐动作审批（管"这个工具调用放行吗"）
  - 外层 = changeset 组级审批（管"这份提案你要哪几条"）
- 顺带修复：`BlueprintMaintenancePanel` 建会话时的 `setApprovalMode('plan')` 使**所有写操作被
  `PLAN_MODE_BLOCKED` 拒绝**（agentX `policy-gate.ts:179`），且 project domain 的 `toolAllowlist`
  只含只读工具 —— 结果"写走 approval"从未接上。需在提案阶段后切换到可写模式。

### E2 架构师工作区可被识别

- 一个带 `.agents/harness.json` 的 git 仓库应能作为普通工作区加入注册表并被投影（`resolveRoot` 已
  只认 `<cwd>/.agents`，预计无需改动，须验证）。
- 验证 `kind: initiative` 的模块 note 写 `related-to` 无 `INVALID_RELATION` 诊断
  （`depends-on` 的 owner 白名单为 `requirement`/`task`，`initiative` 不可用见 `parse.ts:462`）。
- i18n：模块级规划的新文案（提供/需要接口、悬空需求、闲置供给、未接入）。

### E3 装配器（新模块，main 侧）

按架构师工作区模型 §6：接口匹配（实边 / 悬空需求 / 闲置供给）、按 repoId 装配证据、库不可达降级、
id 命名空间化、rev 汇总。**严守单导入者纪律**（`note-provider.ts` 与装配器不得并行 import
harness-core/harness-node）。

测试：装配金样（接口匹配三分支、跨库解析、不可达降级、id 命名空间）；含坏 note 的 fixture 不得抛错。

### E4 原型（先设计后动手）

**按既有约定，E3/E4 的 UI 部分须先出原型再动手。** 需覆盖的新视觉：
- 模块节点上的"归属工作区"行 + "未接入"标记
- 跨库边橙色虚线（原型 v10 已有样式，需接真实数据）
- 悬空需求 / 闲置供给的节点或边样式（**原型未定义，需新设计**）
- 架构师工作区在切换器中的位置（项目全景为默认项）

现有原型 `design/blueprint-note-graph-composition.html`（v10）可直接作为基线；
`module` kind 过滤项应移除或改为 `initiative`。

### P2b: JanusX note 按 WorkFlowX 标准迁移（新增待办，后做）

- 范围：`.agents/notes/` 内存量（约 181 文件，混合旧 `# Agent Note:` + `Status:` 行与新
  `harness-note/1` frontmatter）按 `WorkFlowX/standards/harness-note/1` 规范化：
  frontmatter（schema/id/kind/lifecycle/created）+ 只留五 kind + 扁平 `notes/` +
  无 `views/` + `evidence/` 只属 task + `.local` 全自动（见架构师模型 §9/§9b）。
- 时机：P1 标准冻结 + P2 三仓实现就绪后；未做前不阻塞 P3（adapter 对旧格式降级进 `invalid` lane）。
- 门禁：逐批转正，相对链接不断；迁移前后 `verify-harness-standard` 全绿 + 投影 `invalid` 不新增。

### 明确不在本计划内

- 新增 note kind（`module` 已撤回）；任何 `harness-core` / agentX 的 schema 变更
- 放开 `parse.ts:462` 的 `depends-on` kind 限制（方案 A 验证失败后才考虑）
- legacy 蓝图的处理方式：C1 段"不读取"会使画布上用户写过的 description / todos / issues /
  techSolution 成为孤儿（adapter 无对应段）。**建议改为一次性迁移归档**
  （`blueprint-migrate.ts:335` 的 `applyMigration` 已具备能力），不做静默丢弃 —— 待确认。

(End of file)
