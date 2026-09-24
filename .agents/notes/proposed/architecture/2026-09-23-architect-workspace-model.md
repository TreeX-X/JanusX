# Agent Note: 架构师工作区 —— 项目级规划、权责拆分与共享治理

Status: proposed

Builds on [V2 workspace visualization](./2026-09-23-blueprint-workspace-graph-v2.md) and **supersedes the
storage half of** [V3 composition blueprint](./2026-09-23-blueprint-composition-v3.md): V3's three-layer
model, cross-workspace relations, stale-evidence rule and reusable-mechanism inventory all stand; its
"L1 规划骨架 = GLOBAL 蓝图 JSON（userData，`__global__` scope）" is replaced by "L1 规划骨架 = 一个共享
git 仓库里的标准 harness note". No prototype yet: the design landed in conversation first, prototype is
the next gate per the standing rule (先设计原型图才动手).

## Problem

V3 定义了"规划骨架 × 证据装配"的读时组合，但把骨架放在 userData 的 GLOBAL JSON 里，并假设
"一个项目"是一个单机概念。用户的实际设计意图比这更强，V3 无法表达：

1. **用户是架构师，不是画图的人。** 他要按架构设计把项目拆成若干**核心模块**，为每个模块**建立独立的
   开发工作区**，完成**权责拆分**。模块是权责边界（谁负责什么），不是代码边界。工作区内部再由 note
   维护和管理——“每个工作区是由 note 去维护管理的”。
2. **一个工作区可能是项目的一部分；多个工作区共同表达一个完整项目。** 工业软件的真实形态：
   UI 是一个工作区，UI 调用业务层（独立工作区），业务层调用算法模块（独立），UI 又调用渲染模块
   （独立），另有数据载入层（独立）。这是**横跨 5 个仓库、分叉的调用图**，不是一棵树。
3. **权限不对称是常态，不是例外。** 超大项目里不同工作区由不同人员开发，**开发者本身没有那么多
   工作区的权限**。任何"必须能写全部工作区才能维护顶层蓝图"的设计在大项目里都不成立，因为那种人
   不存在（或存在但不能那么用）。
4. **跨工作区的表示缺乏定义与存储。** 一条 UI→业务层的调用边，两端分属两个仓库：存在 UI 库则业务层
   看不到调用方，存在业务层库则 UI 不知道自己在调谁，存在"骨架"上则骨架退化为杂物袋。

现状盘点（本仓工作树，非 HEAD）：

- 单工作区投影链已建立：`src/main/notes/note-provider.ts`（唯一读文件边界）→ `note-to-blueprint.ts`
  （NoteAdapter v1）→ `Blueprint`；`projectView` 已透出 `adapterVersion` / `invalid`。
- 但**右侧对话框物理上不能维护任何东西**：`BlueprintMaintenancePanel` 建会话时
  `setApprovalMode('plan')`，agentX 的 `policy-gate.ts:179` 对 `plan` 模式拒绝所有写操作
  （`PLAN_MODE_BLOCKED`），且 project domain 的 `toolAllowlist` 只含只读工具。所以从蓝图 UI 出发
  没有任何写路径：“读免审批”做到了，“写走 approval”没接上。
- `changeset.ts`（795 行）的 `expandGroupSelection` / `selectOperations` / delete 逐项确认 / 审计 /
  撤销全部完好，**只是没有 UI 调用方**。C2 段"删 tabs/start/提案/审计/撤销 UI"把整包审批能力
  连同入口一起删掉了，是能力退化而非简化。
- **跳终端是坏的**：`note-to-blueprint.ts:215-218` 把投影节点的 `workspaceId`/`primaryWorkspaceId`
  恒设为 null，而 Canvas 的"开始工作 / 进入终端"依赖它（`BlueprintCanvas.tsx:542,589`），对 harness
  节点**必定**报 `bindWorkspaceFirst`。原型里最核心的动作是死的。
- **多 worktree 互相吞掉**：`projectGraphId = 'harness:project:' + (repoId ?? rootKey).slice(0,8)`，
  同一 repo 的多个 worktree 得到同一个 id，renderer 按 id 去重（`stores/blueprint.ts:100`），
  第二个 worktree 在切换器里直接消失；repoId 为 null 时取绝对路径前 8 字符（`C:\Users`），不同目录
  会撞 id。main 侧歧义保护只在"扫描工作区列表后发现多个匹配"时抛错（`maintenance-apply.ts:87`），
  优先路径直接命中就不检查，写事务可能落到错误的 worktree。
- **外部改 note 画布不刷新**：`HarnessScopeBar.tsx` 是唯一订阅 `harness:changed` 的组件，而已无任何
  挂载点（Workbench 里的挂载点被删）。watcher 驱动的自动刷新与 share 导入导出 UI 目前双双失效。

## Proposal

### 0. 一条更正：schema 不需要扩展

结论先行：**架构师仓库所需的一切 `harness-note/1` 都有，且解析器逐字保留。**

`harness-core/src/schema.ts:154-170` 的 `HarnessNoteMeta`：

```ts
schema; id; kind; lifecycle; created; class?; tags?; parent?;
relations?: Relation[];                                   // target 支持 note://<repoId>/<noteId>
repositories?: { primary?: string; related?: string[] };   // 模块 ↔ 开发工作区归属
codeRefs?: CodeRef[];                                     // 跨库代码定位 {repoId, path, role}
work?; execution?; disposition?; extensions?;             // extensions 是官方逃生舱
```

`ParsedNote.unknownFields`（`schema.ts:187`）逐字保留未知顶层 key。UUID 校验（`parse.ts:415,421,494`）
说明 `repositories` 与 `codeRefs` **本来就是为跨库设计的**。

真正的缺口在投影层：`note-provider.ts` 的 `toNoteDoc` 只取 `id/kind/lifecycle/tags/parent/created/
relations`，**`repositories` 与 `codeRefs` 被整个丢弃**，连 `NoteDoc` 都不传。

一句话：**不是 schema 缺字段，是 NoteAdapter 没把这些字段透出来。**

### 1. 三层资产（接 V3，替换 L1 的存储）

```
L0 证据资产：各开发工作区 .agents/notes/*.md（跟 repo 走）
     └── 写：各库自己的 harness 事务；回执/验收/版本全跟库走
          ⇕ 绑定（repositories.primary + codeRefs[{repoId,path,role}]）
L1 规划骨架：架构师工作区 .agents/notes/planning/*.md   ← 唯一变更：从 GLOBAL JSON 改为 note
     └── 存：项目→模块 的权责边界、接口契约、模块所属工作区、模块代码位置
     └── 不存：证据正文（永远现场读）；机制级结构（交给 L0 各库自治）
     └── 写：共享 git 仓库的 PR + Agent maintenance 事务 + approval
L2 组合视图：骨架 × N 个工作区投影（读时装配，不持久化权威源）
```

### 2. 架构师工作区（architect workspace）

**物理形态：一个普通 git 仓库，里面只有一个 `.agents/` 目录。**

```git
janusx-architecture/            ← git repo，成员共同拥有
├── .agents/
│   ├── harness.json            ← 自己的 repoId；这个 UUID 就是被引用的那个
│   └── notes/
│       └── planning/
│           ├── project-industrial.md    # 项目本身
│           ├── module-ui.md             # 模块：UI 层
│           ├── module-core.md           # 模块：业务层
│           ├── module-loader.md         # 模块：数据载入层
│           ├── module-render.md         # 模块：渲染模块
│           └── module-algo.md           # 模块：算法模块
├── CODEOWNERS                  ← 可选：每个模块一段 owner
└── README.md
```

关键判定：应用只要求 `resolveRoot(cwd)` 认得 `<cwd>/.agents` 加一份 `harness.json`——
**git 与否应用不关心**。但这里的"共同拥有"要求它**必须是 git 仓库**：

| | 独立 git 仓库（采用） | 共享目录 / 云同步 |
|---|---|---|
| 共同拥有 | clone + PR + review | 文件夹共享 |
| 变更评审 | ✓ 标准 PR | ✗ |
| 冲突处理 | git 解决 | 同步工具乱合并 |
| 历史回溯 | ✓ | 通常无 |

选 note 存骨架（而非 GLOBAL JSON）的全部收益——版本、评审、git 回溯——**只有它是 git 仓库时才成立**；
否则等于白折腾。反过来，只要它是 git 仓库，收益全部免费获得。

每个开发者的应用里，它就是一个普通工作区（加进工作区注册表，与其它仓库并列）；特殊之处是
**它出现在每个人的切换器里且内容共享**，于是项目全景在哪台机器打开都一致（pull 最新即可）。

### 3. 权责拆分：模块 ↔ 工作区是多对多绑定

模块是规划概念（有职责、有边界、在骨架里有位置）；工作区是物理载体（有路径、有 repoId、有自己的
note）。二者**不是一对一**：一个模块可能横跨两个库（C++ 核心 + Python 绑定），一个库可能承载两个
模块（monorepo）。

绑定由 L1 的 note 声明，用现成字段：

```yaml
repositories:
  primary: <ui-workspace-repo-id>        # 该模块的归属开发工作区
codeRefs:
  - repoId: <ui-workspace-repo-id>
    path: src/
    role: implementation
```

`BlueprintNode` 里 `primaryWorkspaceId` / `linkedWorkspaceIds` 的区分说明当初想到了这点，但当前投影把
`primaryWorkspaceId` 恒设为 null，这正是"进入终端必定失败"的根因（Problem 第 5 条）。

### 4. 接口声明模式（方案 A，采用）

**核心洞察：依赖是双边的，接口是单边的。**

"UI 依赖业务层"这条边，谁写都有归属争议。改成两边各自声明接口需求，则**没有归属问题**：

```yaml
# module-ui.md（架构师工作区，kind: initiative）
repositories: { primary: <ui-repo-id> }
relations:
  - type: related-to
    target: note://<architect-repo-id>/<module-core-note-id>
    reason: 需要 IBusinessEngine

## Decision
**提供给其它模块的接口**
- `IUiShell` — 主窗口挂载点、生命周期钩子

**需要其它模块提供的接口**
- `IBusinessEngine`（提供方：业务层）— 业务规则编排
- `IRenderPipeline`（提供方：渲染模块）— 图形后端抽象
```

```yaml
# module-core.md（架构师工作区，kind: initiative）
## Decision
**提供给其它模块的接口**
- `IBusinessEngine` — 业务规则编排
**需要其它模块提供的接口**
- `ILoader`（提供方：数据载入层）— 数据解析与校验
- `ISolver`（提供方：算法模块）— 数值求解
```

装配器匹配规则：

| UI 侧 | 业务层侧 | 结果 |
|---|---|---|
| 需要 `IBusinessEngine` | 提供 `IBusinessEngine` | **实边**（画出来） |
| 需要 `IBusinessEngine` | 无 | **悬空需求**（虚线/警示色 + 提示"无人提供"） |
| 无 | 提供 `IBusinessEngine` | **闲置供给**（虚线 + 提示"无人需要"） |

**为什么选 A 而非放开 `parse.ts:462` 的 kind 限制：**

- `parse.ts:462` 规定 `depends-on` 的 owner 只能是 `requirement`/`task`。模块是 `initiative`，
  写 `depends-on` 会被判 `INVALID_RELATION` 进 invalid lane——**不是静默生效，是直接报错**。
- 该规则的动机是任务契约：`CONTRACT_RELATIONS = ['implements','depends-on','governed-by']` 会进入
  task contract hash。放开后须重新决定"`initiative` 的 `depends-on` 要不要进 contract hash"，
  若进，则架构师每次调整模块都会改变下游任务的契约指纹、导致回执失效。**这个问题没有明显正确答案。**
- A 方案的失败成本低：先验证接口声明好不好用，不行再改 schema。反过来先改 schema 没有退路。
- A 的副产品 **悬空接口需求** 恰恰是架构演进中最有诊断价值的视图（"有个模块在等一个还不存在的
  接口"），双边依赖模型画不出来。

代价：接口名匹配是**软校验**——写错名字只能发现"匹配不上"，不能指出谁对。由装配器的悬空标记承担。

### 5. 声明粒度：止于模块级

```
L1 声明层（架构师工作区，人工守，约 10 条）
    项目 → 模块（权责 + 接口契约）
         ⇕ 装配
L0 申报层（各开发工作区，自动投影，机器扫）
    模块 → 机制 → 任务（各库自己的 note 关系）
```

**架构师工作区不重复表达机制级结构**，只钉模块边界，模块内部交给各库自治。这正对应原始设计意图
"对项目的各个核心模块建立独立的开发工作区进行权责拆分"——权责拆分发生在模块级，模块内部是那个
工作区的自治范围。

**共同拥有不改变这条结论，只改变理由。** 既然架构师仓库成员共同拥有，权限不再构成约束；理由
换成**责任**：共同拥有的是说明书，不是工作台。把机制级也搬进去，等于把各模块的自治范围重新变成
公共事务。若确需多人分管，用 CODEOWNERS 按模块分段，不发明新机制。

若模块级仍嫌文件太多，退路是**一篇 note 承载模块清单**（正文用表格表达职责/工作区/接口）。代价是
失去 per-module 的 `lifecycle` 独立性（"UI 已上线、算法还在设计"这个状态差异就看不见了）与
per-module 证据绑定。**不推荐，仅作退路记录。**

### 6. 装配器（新模块，main 侧）

输入 = 架构师工作区的骨架 note + 按骨架中出现的 repoId 尝试取得的各库投影；输出 = 一张组合图。

职责：

1. 解析模块 note 的 `## Decision` 中 `提供`/`需要` 两个约定列表，与 `relations[].reason` 对齐。
2. 接口匹配 → 实边 / 悬空需求 / 闲置供给。
3. 按 `repositories.primary` / `codeRefs[].repoId` 装配证据；库不可达 → 显示声明节点 + "未接入"标记，
   **不报错、不崩**。
4. 节点 id 命名空间化（`wsId:nodeId`，骨架 id 不加前缀）；跨库 relation 解析失败时降级
   （复用 unknown → `related-to` + invalid lane 通道）。
5. rev 汇总：骨架与各库各自 rev（见 Risks）。

**关键：项目全景不依赖"当前打开了哪些工作区"。** 只打开架构师工作区即可看到全貌，其它库显示为
声明节点 + 未接入。`workspaceSnapshot{name,path}`（`types.ts:199`）正是装配降级的依据——存的是
"叫什么、在哪"，不要求在线。

`note-provider.ts` 的单导入者纪律延伸到装配器：**只有一个模块可 import harness-core/harness-node**。

### 7. 治理：共同拥有的四条规则

| 规则 | 内容 |
|---|---|
| 所有权 | 架构师工作区由项目成员共同拥有的 git 仓库；可选 CODEOWNERS 按模块分段 |
| 写路径 | 计划性变更走 PR；应用内变更走 Agent maintenance 事务 + approval |
| 并发 | `expectedHash` 乐观并发（`maintenance-bridge.ts` 已有）；冲突返回 `HARNESS_CONFLICT`，Agent 转内重读重融重试并在聊天中叙述 |
| 原子性 | **跨库意图拆成多个事务分开提交**（架构师事务 + 各开发工作区事务），聊天里叙述顺序；**不做 saga、不做两阶段提交** |

原子性这条是 V3 open question（"Atomicity boundary for one intent split across workspaces"）的定论。
理由：两个库的 git 提交本来就独立，硬做原子性只会造出无法回滚的假象。

### 8. 两层审批串联（恢复被删掉的能力）

现状是"用 agent 逐动作审批**替换**了变更集审批"，于是"部分通过"消失、右列无法维护。
正确关系是**两层串联，不是二选一**：

```
用户提需求
  → Agent 探索（plan 模式，只读）
  → Agent 产出提案（changeset：N 组操作）        ← 停在这里等用户
  → 用户逐组勾选（部分通过）或全选（一次性通过）
  → 应用（原子事务 + expectedHash + 审计）
```

| | Agent 动作审批 | 变更集审批 |
|---|---|---|
| 粒度 | 单次工具调用 | 文档的一批操作 |
| 实现 | agentX `policy-gate` + `ApprovalPreview` | `janus/maintenance/changeset.ts` |
| 回答 | "这次工具调用放行吗" | "这份提案你要哪几条" |
| 现状 | 已接（但 plan 模式阻断写入） | 后端完好，**UI 入口被删** |

**部分通过属于外层**（`expandGroupSelection` / `selectOperations` 已实现依赖闭包补齐），内层按设计
就是逐项的、永远不该有批量。delete 必须逐项确认，不参与批量（已有校验）。

恢复成本极低：`changeset.ts` 795 行完整保留，只缺 UI 入口。**"一次性通过 + 部分通过"后端一行都不用写。**

### 8b. `xarch` 指令（与 `xdo` 同构，建仓脚手架，2026-09-25 落定）

触发形态与 `xdo` 一致：前缀一敲即执行令，不经 prompt 猜、不停在计划页。
定义面仿 `.claude/commands/xdo.md` + `orchestrateX` direct 模式：Main Agent 直接执行，
默认不 dispatch，不隐式并行；落盘原子（脚手架文件 + 本 note 原地同步 + 入口反向注释，
一个 commit，message 带 Note 路径）；写作文案走 `proseX`。

- 命令：`xarch <dir> [--name <name>] [--with-codeowners]`，过渡别名 `init-arch`
  （P1 冻结后的过渡脚手架，不作长期真源，见 Scope boundary）。
- 输入：目标目录（空目录或新建）；可选仓名（默认取目录名）、是否写 `CODEOWNERS` 分段模板。
- 确定性步骤（一步一验，失败即停，不猜）：
  1. `git init`（已是 git 仓则复用，脏树先报停，不自动 commit）；
  2. 写 `.agents/harness.json`（`schemaVersion: 1` + 新 UUID `repoId` + `name` +
     `profile: workflowx/1.0.0-s1.1` 当前冻结 digest；已存在则只校验不覆盖）；
  3. 写 `notes/planning/` 模板：`project.md` + 1 个示例 `module-example.md`
    （`kind: initiative` + `repositories.primary` 占位 + `## Decision` 提供/需要接口表示例，
     P1 冻结口径：不加 kind/字段、不建 `views/`）；
  4. 写 `CODEOWNERS`（`--with-codeowners` 时）+ `README.md`（建仓说明 + 后续走 PR 的提示）；
  5. 调现有工作区注册（`workspace.create` / `chooseAndCreateWorkspace` 同链路，
     `features/workspace/actions.ts:151`）接入本机，落 `.local/workspace-map`；
  6. 投影验证：`projectView` 可读、`invalid` 不新增（旧格式降级通道保留）。
- 不做的事（显式）：模块怎么切、接口名叫什么、`primary` 绑哪个 repoId——
  一律不管，留给 chat + changeset 两层审批（§8）与"接入工作区"显式操作；
  已纳管 note 的后续改动一律走事务 + `expectedHash` + approval，`xarch` 永不直写绕过。
- 双端同步：`.claude/commands` 与 `.codex`（或对应 commands）同逻辑只差路径，
  与 `orchestrateX` 的 sync contract 一致；`xdel`/`xflow` 的 bus-payload 不动，
  `xarch` 无固定 Payload、不要求 task note URI（同 `xdo`）。
- 落点说明（2026-09-25）：命令文件是 JanusX 本机同步产物（`.gitignore` 排除
  `.claude/`、`.codex/`、`AGENTS.md`，与 `xdo.md` 等同待遇，不入库），
  以 `check-skills-sync` 双端一致为准；晋升 WorkFlowX 受管集需另开版本道。
- 门禁：`verify-harness-standard` 全绿；`projectView` 含 `adapterVersion`；
  同 repo 多 worktree 不撞 id（E0-1 已修为前提，否则切换器仍吞条目）。

## Alternatives considered

- **骨架存 GLOBAL JSON（V3 原方案）** — 最强论据是不需要新仓库。排除理由：引入第二种资产形态与第二套
  版本来源，产生 rev 拼接、无法评审、无法共享、`__global__` scope 在 dev 下漂移（已修过一次）等
  一连串问题；而"架构师仓库 = 普通 git 仓库 + 标准 note"把这些问题一并消掉，且 schema 零改动。
- **放开 `parse.ts:462` 的 depends-on kind 限制（方案 B）** — 最强论据是边语义显式、装配器不用猜。
  排除为**当前**方案的理由：跨仓契约变更需 agentX 同步、共享 profile digest 需两边重建、
  `CONTRACT_RELATIONS` 语义待定；而 A 方案能先验证、保留退路。B 作为备选保留。
- **项目 = 已打开工作区的聚合（读法一）** — 最强论据是零存储。排除理由：解释不了"某工作区未打开时
  项目是否完整"、"模块尚无代码仓库时它算不算项目的一部分"、"两个工作区之间的依赖是谁的属性"。
  这三问正是本 note 要解决的。
- **机制级也由架构师工作区声明** — 最强论据是结构完整。排除理由：与"权责拆分"意图冲突（把自治范围
  变成公共事务），且声明条数从约 10 条涨到约 80 条、由无维护动机的人维护，必然腐坏。
- **架构师工作区用共享目录/云同步而非 git** — 最强论据是无需 PR 流程。排除理由：失去评审与历史，
  等于放弃选 note 存骨架的全部收益。

## Acceptance criteria

- [ ] 一个架构师工作区（git 仓库 + `.agents/harness.json` + `notes/planning/*.md`）能被应用作为普通
      工作区识别并投影。
- [ ] `xarch <dir>` 一次建仓 + 注册 + 投影验证通过（§8b 六步），不依赖 prompt 拼凑文件。
- [ ] 项目 → 模块 的 `parent` 树在组合图中渲染为层级；模块 note 的 `kind: initiative` 无
      `INVALID_RELATION` 诊断。
- [ ] UI→业务层、UI→渲染模块的**接口匹配**装配为实边；业务层→算法模块、业务层→数据载入层同理。
- [ ] 单边声明渲染为悬空需求 / 闲置供给，带可点击定位（不崩、不抛错）。
- [ ] 模块 note 的 `repositories.primary` / `codeRefs` 经 NoteAdapter 透出到 `NoteDoc`，组合图节点
      可据此解析其开发工作区。
- [ ] 某个开发工作区未打开/不可达时，组合图仍完整渲染骨架，缺失部分标"未接入"，无未捕获异常。
- [ ] 只打开架构师工作区即可看到完整项目全景（不依赖其它工作区已加载）。
- [ ] 两个 worktree 同时打开时，切换器出现**两个独立条目**（`projectGraphId` 按 rootKey 而非
      repoId 前缀）。
- [ ] 对 harness 投影节点，"进入终端"不再报 `bindWorkspaceFirst`。
- [ ] 维护面板可发起提案并支持**一次性通过**与**部分通过**（组级勾选 + 依赖闭包自动补齐）；delete
      仍需逐项确认。
- [ ] 架构师工作区与开发工作区的并发修改：冲突由 Agent 转内重试并叙述，不出现用户可见冲突条。

## Risks

- **接口名软校验**：声明与代码不一致时装配器只能标记不能纠正。缓解：先只对顶层模块做声明（约 10 条），
  并保留"用构建描述文件（CMake/package.json/project reference）校验声明、不一致标 stale"的后续路径。
- **双边声明腐坏**：接口契约需人维护，无机器来源。缓解同上传言；声明数量控制在几十条以内。
- **共同拥有的评审成本**：模块边界变更是跨团队事件，PR 流程可能成为瓶颈。缓解：CODEOWNERS 按模块
  分段，避免全局审批。
- **rev 语义**：骨架、各库、组合视图三个 rev 若同屏展示会混乱。缓解：组合全景显示骨架 rev 为主，
  证据视图显示所属库 rev；不拼成一个数字。
- **装配器成为第二个 harness 内部导入者**：严守单导入者纪律（`note-provider.ts` 或装配器二者之一，
  不并行）。
- **legacy 蓝图数据不可达**：C1 段"不读取旧蓝图数据"使画布上用户写过的 description / todos / issues /
  techSolution 变成孤儿（`note-to-blueprint.ts` 无对应段，映射不出来）。缓解：一次性迁移归档
  （`blueprint-migrate.ts:335` 的 `applyMigration` 已具备能力），**不做静默丢弃**。
- **repoId 登记流程**：架构师要把新工作区的 repoId 写进模块 note 才能绑定，这是人际流程而非技术问题。
  缓解：登记动作产品化为一个明确的"接入工作区"操作。

## Scope boundary: 三阶段 + note迁移（2026-09-24 修订，2026-09-25 重排执行顺序）

执行顺序：P1 → P2 → P2b → P3，单源以本节为准，实施计划 E 段服从本节门禁。

- P1 冻 WorkFlowX（note 只留五 kind，不新增字段，不建 `views/`）。门禁：现有 fixture 全绿 +
  `verify-harness-standard`。冻结前 JanusX 只修与 schema 无关的 E0-1/E0-4。
- P2 再修三仓底层：`harness-core` 独占哈希与校验 → `harness-node` 文件仓库/watcher/锁/恢复 →
  `wfx-notes` 与 `janus notes` 同结果 → 同步工具（受管 skills/templates/agents/commands +
  AGENTS/CLAUDE 双端导航）→ `harness.json digest` + `release-matrix` 锁定 + 联动验收。
  严守单导入者纪律。
- P2b JanusX note 按 WorkFlowX 标准迁移（新增待办，后做）：标准冻结 + 三仓实现就绪后，把 JanusX
  `.agents/notes/` 按 `harness-note/1` 规范化（frontmatter + 五 kind + 扁平 `notes/` + 无 `views/` +
  `evidence/` 只属 task + `.local` 全自动，见 §9/§9b）。存量旧格式（`# Agent Note:` + `Status:` 行）
  逐批转正，相对链接不断，git 历史为归档。门禁：迁移前后 `verify-harness-standard` 全绿 +
  投影 `invalid` 不新增。未做前不阻塞 P3 读路径（adapter 对旧格式降级进 `invalid` lane，不抛错）。
- P3 最后做蓝图上层：E0 剩余项（E0-2/E0-3/E0-5）→ 装配器（实边/悬空需求/闲置供给）→ 切换器/橙色边/未接入态 →
  changeset 部分通过恢复。原型先行规则不变。
- 原 A 轨 `init-arch`/接口表/`validate` 降为 P1 冻结后的过渡脚手架，不作长期真源。

## 9. 已砍：无 1.2（note 冻五 kind，views 删除）

- note 只留 `idea/initiative/requirement/decision/task`，不新增 `interfaces/project` 等字段；
  接口表继续放正文，装配器在 JanusX 侧软匹配。
- 删除 `harness-view/1` 与 `.agents/views/`：无共享视角文件，全景即架构仓内容（`parent` 树 +
  `repositories.primary` 装配），页签与过滤只存本机 `.local`。
- 上述 8 项收敛一律不做，维持 1.0 原样。

## 9b. 运行与索引约定（2026-09-24 落定）

- `notes/` 为唯一真源：扁平存放，稳定 UUID，`parent` 树表达层级，`relations[]` 表达边。
- `evidence/` 只属 task：永久随提交、建后不可改，`execution.receipts` 引用；临时过程只放
  `.local/runs/transactions/locks`，可删可重建。
- 无 `views/`：全景即架构仓内容，页签与过滤只存本机 `.local`，不共享、不提交。
- `.local` 全自动：打开工作区写 `workspace-map`，首次投影写 `index`，画布操作写 `ui`，
  跑 task 写 `runs/locks`；Agent 只调 `prepare/apply`，永不手写 `.local`。
- WorkFlowX 只约定 `.local` 位置、非真源可重建、重扫时机（启动/回焦点/切分支/watcher 溢出）；
  实现归宿主：`harness-core/node` 在 janus-agentX，`note-provider` 在 JanusX，`wfx-notes` 为轻 CLI。
- 读取走轻索引（URI/标题/kind/lifecycle/摘要/codeRefs），默认选中+一跳+同模块祖先链，
  全图按需取；终端直写文件由 watcher 重扫，坏值进 `invalid` lane，不抛错、不导入、不换 ID。

## 10. 三能力评估（2026-09-24，以当前 note 为基）

要求 1——完整表达工作区机制和能力：部分，不及格。能：initiative→requirement→task +
parent 树，codeRefs/work.scope/work.verification 落点，decision 四节。不能：无能力注册表
（MCP/终端预设/runner 无栏）、无接口一等字段（靠正文表格+reason 软匹配）、无机制行为栏
（状态机/API 签名全散文）、无边界栏（role 仅三档）。修：不补字段，装配器软匹配，能力栏后议。

要求 2——蓝图索引 + wiki 快搜：基本满足。通：单导入→Adapter v1→projectGraph+invalid lane；
cmdList/cmdShow/workspace_search 读免审批，默认选中+一跳+同模块祖先链；
processing-queue/deterministic+llm-stage/bm25+embedding/retention MCP 两段读。漏：无反链
（全库扫）、无摘要栏（全文或不进，80 节点必超预算）、接口表不在索引（提供/需要分不清）。
修：不加接口与 summary 栏，反链后议。

要求 3——task 工作流流转：最强超配。通：work 三组必填 + execution 7 态 + baseline
taskContractHash + receipts/changeset/bundle + xdo/xdel/xflow + changeset.ts 整套
（expandGroupSelection/环检测/delete逐项/审计/撤销）+ expectedHash 并发。缺：多任务调度未做
（S9 另立项）、AC-1 按文件编号易错配、hash 逐字易雪崩、lifecycle/execution 双轨重。
修：只收敛（验收三写→一写、验证双写→一写），不动状态机。

修复序：1 机制表达 → 2 索引 → 3 task 收敛。后续设计讨论以本节为基。

## 10b. 打包版本道 + 逐项裁决（2026-09-25，标尺：简洁高效好用）

原则：凡碰密封文件的优化项，一律攒进**同一次**版本 bump（新版本 + 新 digest +
三仓 checkout 重记 + F01–F12 重跑），不零散改标准；实现层可修的不进版本道；
判冗余的直接砍并记理由。字段只增不减是负债：快变信息不出规划 note，
派生信息由实现层算、不存第二份。

| 项 | 属实？ | 裁决与修法 | 去向 |
|---|---|---|---|
| 能力注册表 | 缺口部分属实 | 不加。能力是快变的运行时资产，note 是慢变的规划资产，耦合必腐坏；`codeRefs` + `work.scope` 已覆盖定位 | 砍 |
| 接口一等字段 | 属实（软匹配定责弱） | 保持软匹配 + 悬空标记（零字段拿主要诊断价值）；P3 证伪后才加最小 `interfaces[]`，且明确不进 contract hash | 版本道（有条件） |
| 机制行为栏 | 非 schema 缺口，是文档分层问题 | `codeRefs` 指代码，不搬状态机/API 签名正文 | 砍 |
| 边界栏 role 三档 | 举证不足（暂无消费者喊不够） | 保持三档，等装配器规则真需要再议 | 后议 |
| 反链 | 属实但属实现缺口（索引已有 byId + relations，派生查询即可） | P2 实现层做 | P2，不进版本道 |
| 摘要栏 | 属实但加栏必致双源分叉（与 §9 砍掉的同类冗余） | 索引层按节提取 + 绑哈希；或约定 Goal/Decision 节即摘要，零字段 | 不加字段 |
| 接口表进索引 | 同接口字段 | 定正文约定格式，索引层解析约定 | 不加字段 |
| 多任务调度 | 属实但属 scope 问题 | S9 另立项 | 另立项 |
| AC 编号错配 | 属实但属 UI 层 | 进位显示 `URI + AC-1` | 工具层 |
| hash 雪崩 | 属实但保守方向正确（误过期优于误通过） | 维持；放宽需数据证明误过期成本 | 维持 |
| lifecycle/execution 双轨 | 重叠属实但双轨承重（execution 进 hash 则收据自失效） | 文档定界（lifecycle 管接受态，execution 管运行态），不并字段 | 不并 |
| 接口载体结构化 | 合理 | 只定正文约定格式，机器读约定 | 约定层 |

## Open questions

- 多架构师工作区并存：无 views，全景即各架构仓内容，多全景并存、各管各，不合并；
  默认项为本机 pin（`.local`），待 E2 定案。
- 架构师工作区是否需要独立的 `NOTE_CLASS`（如 `planning`）以便过滤？当前 `class` 是可选自由值。
- 模块 `lifecycle` 与证据 `lifecycle` 不同步时（模块 accepted、证据全 draft）的展示规则。
- 接口声明列表是否需要一个更结构化的载体（现为 `## Decision` 下的约定列表 + `relations[].reason`
  双写）；若后续要做机器校验，可能需要规范化格式。
- 组合全景的布局不跨机共享（存 `<checkout>/.agents/.local/ui/project.json`，各 checkout 独立）。
- "接入工作区"操作是否应写入 `repositories.related[]` 而非仅 `primary`。
