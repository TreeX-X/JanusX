# JanusX Chat 圆桌会议：设计与实施记录

> 当前状态：圆桌视觉舞台与基础交互已实现；会议引擎正在重构，当前 UI 不具备真实圆桌编排能力。
>
> 最近更新：2026-09-01
>
> 文档用途：维护当前代码事实、已确认产品规则、待实施设计和验收条件。已被实现淘汰的早期布局方案不再保留。

## 1. 当前产品目标

圆桌会议是 Janus Island 的一种扩展视图。用户提出议题后，由固定职责的参与者进行结构化讨论，JanusX 负责主持、整理共享状态，并最终形成可追溯的结论、分歧、风险和行动项。

圆桌会议不是普通 Chat 中连续发送多次请求，也不是一个脱离 Island 的独立窗口。它需要同时容纳四种信息：

1. 左侧圆桌会议场景，用于表达参与者、发言状态和会议进程；
2. 共享羊皮纸，用于显示 JanusX 整理后、适合人阅读的结构化结果；
3. discussion-only Chat，用于显示讨论过程和接收用户补充。
4. Agent 工作卡片，用于在不打散 Chat 阅读节奏的前提下，显示每个 Agent 的任务状态、阶段结果和可展开详情。

## 2. 当前 UI 的实际实现

以下结论以 2026-08-31 的仓库代码为准。

### 2.1 入口与容器

- `JanusIslandExpandedShell` 在 Monitor、Chat 之外提供 Roundtable 页签。
- Roundtable 直接渲染在展开态 Janus Island 内部，没有新窗口、overlay 弹层或工作区 Pane。
- 外层 Island 当前最大尺寸约为 `900px × 460px`，圆桌内容必须在这个固定舞台内分配空间。
- 当前圆桌根组件是 `JanusRoundtablePane`，左侧场景由 `RoundtableStage` 独立负责。

相关实现：

- `src/renderer/src/components/janus/JanusIsland.tsx`
- `src/renderer/src/components/janus/JanusIslandExpandedShell.tsx`
- `src/renderer/src/components/janus/JanusRoundtablePane.tsx`
- `src/renderer/src/components/janus/RoundtableStage.tsx`
- `src/renderer/src/components/janus/styles/09-janus-roundtable-final.css`

### 2.2 当前布局

桌面宽度下使用两列结构：

```text
┌──────────────────────────────┬──────────────────────┐
│                              │ 共享羊皮纸（打开时） │
│                              ├──────────────────────┤
│      左侧 3D 圆桌舞台        │ discussion-only Chat │
│                              │                      │
└──────────────────────────────┴──────────────────────┘
```

- 左侧圆桌跨越完整高度。
- 右侧默认只显示 Chat。
- 点击圆桌中心羊皮卷后，右侧切换为“上方羊皮纸 + 下方 Chat”。
- 再次点击羊皮卷会关闭共享羊皮纸，Chat 恢复占满右侧高度。
- 小于 `760px` 时改为纵向堆叠，避免横向内容溢出。

这套上下布局已经替代早期“三栏并排”“底部整宽输入条”和“独立工作区嵌入”等方案。

### 2.3 左侧圆桌舞台

当前固定显示四个会议单位：

| 角色 | 显示名称 | 当前身份视觉 |
|---|---|---|
| 用户 | 提议人 | `teammate` |
| JanusX | 主持人 | `main` |
| Agent-1 | 议题解决者 | `coder` |
| Agent-2 | 议题完善者 | `evaluator` |

已实现的舞台交互：

- 动态、俯视、等距、低位四种视角；
- CSS 3D 圆桌、座席、身份核心与职责标签；
- 座席 Hover、Focus 和选中状态；
- 中心羊皮卷 Hover、Focus、打开和关闭状态；
- 羊皮卷光环在静止态与桌面平行，未升起时也能完整显示；
- 视角切换和羊皮卷开合动画；
- 基础键盘可访问语义，如 `aria-pressed`、`aria-label` 和 toolbar。

### 2.4 当前功能边界

当前圆桌是视觉与交互骨架，不是已经可运行的会议产品：

- `parchmentOpen` 只是 `JanusRoundtablePane` 内的本地 UI 状态；
- 四名参与者来自静态数组，尚未连接真实会话或运行时 Agent；
- `workingRole` 固定为 `null`，不会随发言者变化；
- discussion-only Chat 收到的消息数组为空；
- Chat 发送处理是空函数，用户输入不会启动圆桌；
- 当前 UI 没有“用户显式开启下一轮”的控制，也没有区分首次输入与后续轮次；
- 共享羊皮纸目前只显示“新的圆桌引擎正在重构”的占位内容；
- 当前主进程和共享 IPC 中没有生效的圆桌编排、持久化、最终整理或导出链路；
- `onClose` 和 `resourceController` 在当前圆桌组件内尚未实际使用。

## 3. 实施状态

| 能力 | 状态 | 说明 |
|---|---|---|
| Roundtable 页签入口 | 已实现 | 位于展开态 Janus Island 顶部视图切换区 |
| 左侧 3D 圆桌舞台 | 已实现 | 四席、视角、标签、Hover/Focus/选中 |
| 中心羊皮卷开合 | 已实现 | 控制右侧共享羊皮纸显示 |
| 右侧上下布局 | 已实现 | 羊皮纸在上、discussion-only Chat 在下 |
| 羊皮卷静止光环显示 | 已实现 | 光环不再穿入桌面导致下半圈缺失 |
| 共享羊皮纸真实内容 | 部分实现 | 羊皮纸已消费 `projectParchment(roundtableState)`，动态显示结论、决策、依据、风险、行动项和来源；事实已由 Agent 结果自动生成，持久化仍待完善 |
| 通用附属 Island 与羊皮纸模块 | 已实现 | `JanusAuxiliaryIsland` 提供通用外壳，当前挂载羊皮纸详细模块 |
| 真实讨论消息流 | 部分实现 | Renderer 已接入 Roundtable IPC，可启动、推进和结束 fixture 会话；真实模型流仍待接入 |
| Agent 发言状态联动 | 部分实现 | Renderer 已订阅 Runtime 事件并驱动工作投影；真实 Agent 配置仍待完善 |
| Agent 工作预显与卡片化输出 | 部分实现 | 已有工作事件投影、可聚焦结果卡片和摘要列表；真实模型结果已接入 Runtime，完整详情正文仍待完成 |
| 卡片详情附属 Island | 部分实现 | `agent-result` 模块已接入附属 Island，支持 sections 与 evidenceRefs 展示；完整事实投影仍待完成 |
| 用户显式开启轮次 | 未实现 | 当前只能发送消息，不能空输入开启下一轮 |
| 圆桌编排与轮次推进 | 部分实现 | LangGraph.js、Agent Registry、RoundtableService、IPC 和 UI 生命周期已接入；真实模型适配具备默认模型路径，持久化仍待完成 |
| 共享结构化状态 | 已实现（内存） | 已建立事实、事件 envelope、版本、幂等 reducer 与羊皮纸投影器；持久化仍待落地 |
| 会话恢复与持久化 | 部分实现 | 主进程以 JSONL 记录圆桌事件与状态快照，并提供 `roundtable:restore`；恢复使用无副作用 Runtime hydrate，不会重新执行 Agent，跨进程 checkpoint 完整恢复仍待完善 |
| 最终整理与 Markdown 导出 | 部分实现 | Agent 结果会生成决策/依据/风险事实，并提供 `roundtable:export` Markdown 导出；完整最终整理与文件保存 UI 仍待完善 |
| 工作区工具与审批 | 未实现 | 圆桌尚未接入资源控制器 |

## 4. 已确认的产品规则

以下规则仍然有效，但除非在实施状态表中标记为“已实现”，否则不能当成当前能力。

### 4.1 角色职责

1. 用户是提议人，可以提出议题、补充约束、纠正事实和推进下一轮。
2. JanusX 是唯一主持人，维护共享结构化状态、归并重复观点并整理轮次结果。
3. Agent-1 是议题解决者，每轮既要回应已有审查问题，也要继续提出新方案或推进路径。
4. Agent-2 是议题完善者，检查方案的缺口、边界、风险和未验证假设。
5. MVP 使用一个用户、一个主持人、一个议题完善 Agent 和一个方案质疑 Agent 作为最小拓扑；用户和主持人仍各只有一个，但两类工作 Agent 都必须支持扩展数量。后续可注册不同编排流程，不得把 MVP 节点数量写死在主图中。

### 4.2 上下文与轮次

- 共享结构化状态是跨参与者的公共上下文；Agent 默认不直接读取其他 Agent 的完整原始发言。
- MVP 轮次顺序为 `Agent-1 -> Agent-2 -> JanusX`。
- 首次用户非空输入才创建会话并自动启动第 1 轮；首次输入前不得显示 Agent 工作状态。
- 每轮完成后停在 `awaiting-user`，用户必须通过明确的 `advance-round` 事件开启下一轮。
- `advance-round` 可以携带补充内容，也可以无文本推进；无文本表示沿用当前共享状态继续讨论，不产生空白用户消息。
- 未经证实的 Agent 观点必须标记为建议、疑点或待验证，不能直接升级为事实。
- 写工作区、运行命令和 Git 操作必须经过明确审批，不能由多个 Agent 自行并行修改。

### 4.3 会议结束

- 只有用户可以结束会议。
- JanusX 和 Agent 可以建议结束，但不能自行改变会议终止状态。
- 用户结束后，JanusX 需要执行一次最终整理，输出结论、分歧、依据、风险、行动项和引用索引。
- 导出失败不能删除会议历史或最终状态。

## 5. 双层文档模型

圆桌文档采用“一个事实源、两个阅读层”的原则。

### 5.1 AI 读取层：圆桌记录

机器层负责完整、稳定和可追溯，建议使用事件记录加版本化快照：

- 会话、轮次、事件和状态版本；
- 用户需求与约束；
- 候选方案、支持理由和反对意见；
- 已确认、待验证、已否决和已解决事项；
- 参与者、模型、工作区范围和来源引用；
- 每次结构化变更的操作者与前后差异。

建议状态至少包含：`confirmed`、`proposal`、`concern`、`pending-validation`、`rejected`、`resolved`。

### 5.2 人类阅读层：共享羊皮纸

羊皮纸是机器事实源的可读投影，不是原始长对话的全文转写。默认结构为：

1. 主题与当前结论；
2. 已确认决策；
3. 关键依据；
4. 未决问题与风险；
5. 行动项；
6. 来源索引。

用户修正结论时，应产生新的确认或变更事件，再重新生成羊皮纸；不允许羊皮纸与机器事实源各自维护一套真相。

## 6. 新设计方向：右侧等高详细 Island

### 6.1 问题

当前“羊皮纸在上、Chat 在下”的形式适合快速浏览，但右侧列宽和半高区域不足以承载长结论、依据、来源索引或多个结构化章节。继续压缩字体、减少留白或扩大上方区域都会损害 Chat 的可用性。

因此保留当前上下布局作为默认简易视图，并为共享羊皮纸增加一个可逆的详细阅读模式。

### 6.2 目标形态

宽屏桌面环境中，用户从羊皮纸控件触发展开后，在主 Island 右侧生成一个与主 Island 等高的详细 Island：

```text
默认上下布局
┌──────────────────────────────┬──────────────────────┐
│       左侧 3D 圆桌           │ 共享羊皮纸（摘要）   │
│                              ├──────────────────────┤
│                              │ Chat                 │
└──────────────────────────────┴──────────────────────┘

详细阅读布局
┌──────────────────────────────────────────────┐  ┌──────────────────────────┐
│             原 Janus Island                  │  │ 共享羊皮纸详细 Island    │
│  左侧圆桌 + 右侧上下布局保持可见             │  │ 等高、独立滚动、完整内容 │
└──────────────────────────────────────────────┘  └──────────────────────────┘
```

详细 Island 是原 Island 的附属阅读面，不是新窗口、模态框或另一场会话。两侧读取同一份羊皮纸状态，不复制数据，也不创建第二个 Chat。

### 6.3 主体 Island 视觉一致性（硬约束）

额外扩展的 Island 必须与主体 Janus Island 属于同一套视觉系统，不能因为当前首个内容是羊皮纸，就把整个分体做成米色纸张、卷轴窗口或另一套应用外壳。

必须保持一致的外层特征：

- 复用主体 Island 的近黑背景、边框、圆角、内高光、投影和层级关系；
- 复用主体 Island 已有的 `--shell-*` 设计变量、字号层级、间距系统和控件状态，不在模块内复制硬编码主题；
- 分体 Island 的高度、顶部和底部边线、圆角半径及外阴影与展开态主体 Island 对齐；
- 分体展开、收回和焦点状态使用与主体 Island 相同的缓动语言和动效节奏；
- 标题栏、图标按钮、Tooltip、Focus ring 和禁用状态沿用主体 Island 组件规范；
- 两个 Island 之间保留清晰间距，但视觉上应像同一个 Janus 系统分出的两个工作面，而不是两个不同产品窗口。

羊皮纸的旧金、深褐、纸张纹理和衬线字体只用于附属 Island 的内容画布与羊皮纸专属控件。附属 Island 的外层 chrome 仍然保持 Janus Island 风格。未来加载其他功能模块时，内容层可以使用对应功能的局部语义，但不得改写通用外壳。

### 6.4 羊皮纸风格控件

控件放在共享羊皮纸右上角，使用图标而不是带文字的圆角按钮：

- 默认布局使用 Lucide `PanelRightOpen`，Tooltip 为“展开羊皮纸”；
- 详细 Island 使用 `PanelRightClose`，Tooltip 为“返回上下布局”；
- 控件外观采用小型黄铜铰链或蜡封底座：深褐底、旧金描边、轻微内阴影；
- 尺寸建议 `28px × 28px`，圆角不超过 `4px`；
- Hover 只增强边缘高光，不使用霓虹、强发光或大幅缩放；
- Focus 必须有清晰的键盘轮廓，按钮提供 `aria-expanded` 和 `aria-controls`。

这个控件表达的是“展开阅读面”，不应设计成普通窗口的最大化按钮，也不应使用文字胶囊破坏羊皮纸语义。

### 6.5 交互状态

建议将羊皮纸 UI 明确建模为两个正交状态：

```ts
type ParchmentVisibility = 'closed' | 'open'
type ParchmentLayout = 'stacked' | 'detail-island'
```

状态规则：

1. 点击圆桌中心羊皮卷：`closed <-> open`。
2. 羊皮纸打开后点击展开控件：`stacked -> detail-island`。
3. 点击详细 Island 的返回控件：`detail-island -> stacked`，羊皮纸仍保持 `open`。
4. 按 `Escape` 时优先关闭详细 Island 并返回上下布局；再次按下才交给 Island 原有收起逻辑。
5. 往返布局时保留当前章节、滚动位置、展开折叠项和文本选择上下文。
6. 切换 Monitor、Chat、Roundtable 后再返回时，当前布局是否恢复由后续产品决策确定；首版建议在本次 Island 展开生命周期内恢复。

### 6.6 详细 Island 内容

详细 Island 优先解决阅读空间，而不是增加新的操作密度。建议包含：

- 固定的文档标题、状态和最近更新时间；
- 可收起的章节导航；
- 结论、决策、依据、风险、行动项和来源索引；
- 独立纵向滚动区域；
- 当前轮次更新时的轻量变更标记；
- 返回上下布局控件。

Chat 输入、模型选择、会议推进和结束操作仍留在主 Island，避免两个 Island 同时出现命令入口。

### 6.7 通用附属 Island 模块化设计

分体 Island 不能写成 `JanusRoundtableDetailIsland` 的一次性页面。推荐拆成“通用附属 Island 外壳 + 功能模块”两层：

```text
JanusAuxiliaryIslandHost
  -> JanusAuxiliaryIsland（通用外壳、几何、动效、可访问性）
      -> JanusRoundtableParchmentModule（首个内容模块）
      -> 未来的其他功能模块
```

通用外壳负责：

- 与主体 Island 一致的外观和设计 token；
- 右侧展开、组合居中、等高约束和响应式降级；
- 通用标题栏、关闭/返回控件、Focus 管理、`Escape` 和过渡动画；
- 模块挂载、切换和卸载生命周期；
- 单一附属 Island 实例管理。MVP 同一时间只打开一个模块，禁止继续向右级联第三个 Island。

功能模块负责：

- 模块标题、图标、ARIA 标签和局部操作；
- 自己的内容渲染、滚动位置和业务状态；
- 与所属功能 controller 的数据连接；
- 局部内容风格，但不能覆盖通用 Island 外壳。

建议使用描述对象或注册表，而不是在 Host 中堆叠功能条件分支：

```ts
type JanusAuxiliaryModuleType =
  | 'roundtable-parchment'
  | 'knowledge-detail'
  | 'runtime-detail'
  | 'office-preview'

interface JanusAuxiliaryModuleDescriptor {
  id: string
  type: JanusAuxiliaryModuleType
  title: string
  ariaLabel: string
  preferredWidth?: number
  minWidth?: number
}
```

上述未来模块名称用于定义扩展边界，不代表这些功能已经确定或实现。新增模块时应只注册 descriptor 和内容组件，不复制定位、外壳 CSS、关闭逻辑或响应式规则。

### 6.8 推荐实现方法

当前 `.janus-island-shell` 是固定定位容器，`.janus-island` 已允许 `overflow: visible`。建议按以下边界实现：

1. 将 `parchmentOpen` 和新的 `parchmentLayout` 从 `JanusRoundtablePane` 本地状态提升到 `JanusIsland` 或 `JanusIslandExpandedShell`，由能够同时控制主 Island 与附属 Island 的层级持有。
2. `JanusRoundtablePane` 改为受控组件，只接收状态、切换回调和共享羊皮纸内容。
3. 在 `.janus-island` 的同级渲染通用 `JanusAuxiliaryIslandHost`；羊皮纸通过 `JanusRoundtableParchmentModule` 挂载，不要把详细内容塞进现有右列，也不要使用 Portal 创建脱离 Island 的浮层。
4. 为 `.janus-island-shell` 增加 `data-auxiliary-open` 和当前模块标识；`data-parchment-layout="detail-island"` 只描述圆桌内部状态，组合几何由通用 Host 计算。
5. 详细 Island 高度使用 `height: 100%` 与主 Island 严格同步；宽度建议 `clamp(420px, 36vw, 620px)`，两者间距建议 `10px`。
6. 打开详细 Island 时，整个双 Island 组合应重新居中或向左平移，不能简单从当前中心向右溢出屏幕。
7. 主 Island 最小可用宽度建议不低于 `640px`；详细 Island 最小阅读宽度建议不低于 `420px`。
8. 内容状态保持单一实例。布局切换只改变承载位置，不能复制羊皮纸数据或重新请求内容。
9. 外壳样式抽成主体与附属 Island 共同消费的 token/primitive，禁止复制主体 Island 的完整 CSS 后单独维护。
10. 动画采用约 `280ms` 的位置与宽度过渡，表现为一个 Janus 工作面从主体右侧分出；`prefers-reduced-motion` 下直接切换。

不建议直接把主 `.janus-island-shell` 宽度硬加上详情宽度。当前 shell 以 `left: 50% + translateX(-50%)` 居中，直接增加宽度会同时改变原 Island 内部布局并造成右侧越界。应把主 Island 和详细 Island 视为一个组合几何单元。

### 6.9 响应式边界

- 可用宽度足够时：显示右侧等高详细 Island。
- 宽度不足以同时保证主 Island `640px` 和详情 `420px` 时：进入单 Island 的“羊皮纸专注视图”，详细内容占据原 Island 主体，返回按钮恢复上下布局。
- 不允许通过页面横向滚动访问被裁切的详细 Island。
- 移动端不生成右侧附属 Island，直接使用专注视图。

### 6.10 验收条件

- 默认上下布局和现有羊皮卷开合行为不变；
- 展开后确实出现一个与主 Island 等高的右侧阅读面；
- 附属 Island 的背景、边框、圆角、阴影、标题栏和动效与主体 Island 使用同一套 token 和 primitive；
- 羊皮纸风格只影响内容画布，不把附属 Island 外壳变成另一套窗口风格；
- 主 Island、圆桌动画和 Chat 不被重新挂载，输入草稿不丢失；
- 返回上下布局后恢复原章节和滚动位置；
- `Escape`、键盘 Focus、Tooltip 和 `aria-expanded` 行为正确；
- 1280、1440、1920 宽度下不越出视口；
- 窄屏自动进入专注视图，不出现水平滚动；
- 详细 Island 只承载阅读，不重复 Chat 或会议命令；
- Host 可以在不复制外壳、定位和关闭逻辑的前提下挂载第二种测试模块；
- 同一时间最多存在一个附属模块，不出现多级 Island 连锁展开；
- `prefers-reduced-motion` 下无强制位移动画。

### 6.11 Agent 工作预显与卡片化输出（后续对话默认交互）

这是基于 3D 原型需要固化的对话交互，不是普通 Chat 的换肤。目标是让用户始终知道“谁正在工作”，同时避免长输出把讨论流淹没。

#### 交互原则

1. **工作前预显**：调度器确认任务后，立即在左侧 3D 席位将对应 Agent 标记为 `queued`/`working`，显示工作阶段、简短任务名和开始时间。多个 Agent 排队时按实际执行顺序显示，不虚构并行状态；未开始的 Agent 不得显示为工作中。
2. **工作中联动**：`workingRole` 必须来自运行时事件，而不是组件常量。当前工作席位使用 active-speaking/working 视觉状态，Chat 只追加一条轻量事件（如“CODER 正在分析”），不插入半成品长文本。
3. **结果卡片**：Agent 完成、失败、等待审批或需要用户输入时，输出写入一张 `AgentResultCard`，Chat 中只显示卡片摘要（Agent、状态、标题、时间、要点计数、是否需要操作）。完整 Markdown、工具调用、引用和错误堆栈不直接平铺到 Chat。
4. **点击查看详情**：点击卡片后，使用现有 `JanusAuxiliaryIslandHost` 打开右侧等高附属 Island；详情面板显示该卡片的完整内容并独立滚动。详情是同一结果对象的阅读投影，不复制消息、不创建第二个 Chat，也不重新执行 Agent。
5. **返回与上下文保持**：关闭详情或按 `Escape` 回到原布局，保留卡片选中态、详情章节和滚动位置；新结果到达时不强制抢焦点，除非该卡片标记为 `requiresUserAction`。
6. **状态可追溯**：卡片状态必须能回溯到圆桌记录中的事件和版本。未经验证的内容显示 `proposal`、`concern` 或 `pending-validation` 标签，不得因卡片展示而升级为事实。

#### 建议数据契约

```ts
type AgentWorkState = 'queued' | 'working' | 'completed' | 'failed' | 'awaiting-input' | 'cancelled'

type AgentResultCard = {
  id: string
  sessionId: string
  roundId: string
  agentId: string
  role: 'main' | 'coder' | 'evaluator' | string
  title: string
  status: AgentWorkState
  summary: string
  sections: Array<{ id: string; title: string; markdown: string }>
  evidenceRefs: string[]
  requiresUserAction: boolean
  createdAt: string
  updatedAt: string
  sourceEventIds: string[]
}
```

运行时至少发布 `agent:queued`、`agent:working`、`agent:result`、`agent:error`、`agent:awaiting-input` 五类事件。UI 只订阅事件并更新投影；持久化层保存事件和卡片，不保存与卡片重复的第二份正文。

#### 组件与状态边界

- `JanusRoundtablePane` 继续负责圆桌、Chat 输入和卡片列表的组合，不负责生成 Agent 内容。
- `RoundtableStage` 接收 `participants` 与 `workingAgents`，只负责左侧席位的状态表达。
- 新增 `AgentWorkRail`（可先作为 Stage 内部区域）负责显示队列、工作中席位和最近完成项；窄屏时折叠为顶部紧凑状态条。
- 新增 `AgentResultCard` 负责摘要、状态徽章、更新时间和点击回调；卡片正文不得在 Chat 中展开。
- `JanusAuxiliaryIslandHost` 增加 `agent-result` descriptor，复用现有外壳；`AgentResultDetail` 仅负责详情阅读和章节导航。
- 同一时间最多打开一个详情 Island；切换卡片只替换详情数据，不重新挂载主 Island、3D 场景或输入框。

#### 实施拆分与验收

1. **事件与类型**：建立上述事件和 `AgentResultCard` 类型，使用本地 fixture 驱动 UI；验收为状态转换可测试、事件带 `sessionId/roundId` 且可去重。
2. **左侧预显**：把 `workingRole` 改为事件派生的 `workingAgents`，实现 queued/working/completed/failed 的席位样式和无障碍标签；验收为每次调度先出现预显，结束后准确归档，不能出现“幽灵工作中”。
3. **卡片投影**：将 `postDebateBubble` 的 Agent 长文本改为结果卡片摘要，保留用户消息和主持人轮次提示；验收为长 Markdown 不进入 Chat 平铺区，卡片可键盘聚焦和激活。
4. **详情 Island**：注册 `agent-result` 模块并接入点击、返回、`Escape`、独立滚动和窄屏专注视图；验收为详情与卡片内容一致、不会重复执行、不会丢失 Chat 草稿。
5. **真实引擎接线**：将 fixture 替换为圆桌运行时事件，接入失败恢复、审批和持久化；验收为刷新/恢复后卡片状态和详情可追溯，导出的 Markdown 与卡片正文来源一致。

该交互在真实运行时接入前均标记为“部分实现/占位数据”。原型中的 `debate-bubble` 可保留用于用户消息和系统事件，但不再作为 Agent 长结果的最终呈现形式。

### 6.12 用户显式开启轮次（会议生命周期约束）

每一轮讨论都必须由用户人为开启。输入框发送和“开始下一轮”是同一个推进动作的两种入口：首次输入负责创建会议并自动开始第 1 轮，之后用户可以补充文字后开启下一轮，也可以不输入任何内容直接让 Agent 基于当前共享状态继续讨论和优化。

#### 生命周期

```text
idle
  -- 用户首次提交非空需求 --> round-1/running
round-N/awaiting-user
  -- 用户输入补充内容并点击开启 --> round-(N+1)/running
round-N/awaiting-user
  -- 不输入内容、直接点击开启 --> round-(N+1)/running
round-N/running
  -- Agent-1 -> Agent-2 -> JanusX 完成 --> round-N/awaiting-user
```

- `idle` 阶段不显示工作 Agent、工作卡片或“正在讨论”状态；可以显示空圆桌和输入控件。
- 用户首次提交非空需求后，系统原子地创建 `session`、写入用户议题并启动第 1 轮，随后才显示左侧 Agent 工作预显。
- 每轮完成后必须停在 `awaiting-user`，不得自动开始下一轮；JanusX 可以给出建议，但不能替用户点击开启。
- 开启下一轮时先记录可选的用户补充事件；空输入表示“沿用当前共享状态并继续优化”，不是一条空消息，也不应在 Chat 中生成空白气泡。
- 轮次开启按钮在运行中禁用，避免重复点击创建重复轮次；请求幂等键使用 `sessionId + nextRoundNumber`。
- 会议结束是独立的用户操作。结束后不再显示开启下一轮，仅允许查看卡片、共享羊皮纸和导出结果。

#### UI 约束

- 首次输入前：不显示 Agent 工作预显，不显示结果卡片列表中的占位卡，不自动播放 Agent 发言动画。
- 第 1 轮启动后：左侧席位按事件显示 queued/working；右侧 Chat 仅显示用户议题、轮次提示和卡片摘要。
- 轮次等待用户时：输入框旁显示明确的“开启下一轮”图标按钮；按钮在文本为空时仍可用，并提供 Tooltip 说明“沿用当前方案继续讨论”。
- 文本非空时按钮语义变为“补充并开启下一轮”，发送快捷键不得绕过轮次确认规则。
- 移动端和专注视图沿用同一生命周期，不因布局切换自动推进轮次。

#### 事件与验收补充

新增 `session:created`、`round:started`、`round:awaiting-user`、`round:ended` 事件；`round:started` 必须包含 `trigger: 'initial-input' | 'user-advance'` 与 `userInput?: string`。验收要求：

1. 首次输入前无 Agent 工作状态；首次非空提交只启动一次第 1 轮。
2. Agent 完成一轮后不会自行启动下一轮，必须等待用户操作。
3. 空输入开启下一轮成功，且不会产生空白用户消息。
4. 带补充内容开启下一轮时，补充内容在该轮上下文中可追溯。
5. 快速重复点击、刷新恢复和网络重试不会生成重复轮次。

## 7. 下一步实施顺序

1. [已完成] 抽取主体与附属 Island 共用的视觉 token 和外壳 primitive，锁定一致性基线。
2. [已完成] 实现通用 `JanusAuxiliaryIsland` 模块契约，并挂载羊皮纸模块。
3. [已完成] 实现纯 UI 状态：`stacked <-> detail-island`，用占位羊皮纸内容验证几何和往返行为。
4. [已完成] 将羊皮纸状态提升到 `JanusIsland`，保证 Chat 不因布局切换重新挂载。
5. [已完成] 完成宽屏双 Island、窄屏专注视图和键盘交互测试。
6. [已完成（内存）] 定义共享结构化状态的数据模型和羊皮纸投影器。
7. [部分完成] 定义 Agent 工作事件与 `AgentResultCard` 投影，完成 Renderer 事件订阅、摘要卡片、`agent-result` 详情 Island 和真实结果章节/证据展示；持久化仍待完成。
8. 实现用户显式开启轮次：首次非空输入启动第 1 轮，后续支持空输入或补充输入开启下一轮，并加入幂等与防重复提交。
9. [部分完成] 接入 LangGraph.js fixture Runtime 与 Agent Registry，验证可配置数量的完善/质疑 Agent fan-out/join；真实 Agent 工作队列仍待接入。
10. 将 `workingRole` 接入真实运行时，完成 Agent 工作队列、轮次等待和结果卡片生命周期。
11. 重建圆桌运行时的失败恢复和用户结束流程，并将卡片与轮次事件写入圆桌记录。
12. [部分完成] 已接入 JSONL 事件/快照存储与恢复、事实生成和 `roundtable:export`；仍需工作区只读工具、完整最终整理和导出文件选择 UI。

UI 扩展与会议引擎应分阶段实施。右侧详细 Island 可以先使用真实结构的占位数据完成交互验证，但文档中必须持续标记其数据链路尚未实现。

## 8. 多智能体编排框架选型

### 8.1 结论

JanusX 建议采用 **LangGraph 作为编排内核**，而不是直接使用 CrewAI、MetaGPT 或 Swarms 作为产品的总控制器。JanusX 的核心难点是可恢复状态机、用户控制的轮次闸门、事件追踪、审批、取消、超时、重试和 UI 实时投影；LangGraph 的 StateGraph、checkpoint、interrupt/resume、streaming 和 subgraph 能直接表达这些边界。

框架本身不会自动带来更好的调度。LangGraph 负责“状态如何合法流转”，JanusX Runtime 负责队列、并发、模型路由、超时和观测。

### 8.2 候选框架对比

| 框架 | 优势 | 主要限制 | JanusX 定位 |
|---|---|---|---|
| LangGraph（JS/TS 或 Python） | 显式状态图、检查点、人工中断/恢复、流式事件、条件分支、子图和可测试性强 | 抽象层较低，需自行设计队列、模型路由和观测 | 首选编排内核 |
| CrewAI | Role/Task/Crew 抽象清晰，上手快，适合固定流程 PoC | 复杂暂停、恢复、幂等和产品级事件语义需要额外包裹 | 快速实验或 Agent 适配器 |
| MetaGPT | SOP、角色协作和软件工程流程经验丰富 | 约束较强、默认流程偏重，动态扩展和低延迟交互改造成本高 | 借鉴角色/SOP，不直接接管运行时 |
| Swarms | 提供多种 swarm 编排模式，适合探索并行协作 | 产品级生命周期、检查点和稳定契约需自行建设 | 并行策略参考或实验适配器 |

### 8.3 推荐运行时架构

```text
Renderer (React) <-> Electron IPC <-> Janus Orchestrator Service
                                      - LangGraph StateGraph
                                      - Round Scheduler / Queue / Cancellation
                                      - Agent Registry + Model Router
                                      - Event Journal + Checkpoint Store
                                      - Approval / Workspace Policy Gateway
                                      <-> AI SDK / MCP / CLI adapters
```

- UI 不直接依赖 LangGraph 类型，只消费 JanusX 自己定义的 session、round、agent、card 事件。
- `await-user` 是图中的显式 interrupt/等待节点；首次非空输入启动第 1 轮，之后每轮结束都暂停，只有 `advance-round` 才 resume。
- MVP 默认按“完善 Agent 集合 -> 质疑 Agent 集合 -> JanusX 汇总”执行。集合内可以串行或并行，最终必须在主持人节点统一归并；流程顺序、并发策略和汇聚规则由编排模板声明，而不是由 UI 假设。
- Agent 通过 registry 声明 schema、能力、模型偏好、超时和工具权限，新增 Agent 不应修改主图控制流。
- 通过 bounded queue、并发上限、取消令牌、节点 timeout、指数退避和幂等 `runId` 保证响应及时且不重复执行。
- 长任务放入 Node worker 或独立 service，避免阻塞 Electron 渲染和窗口响应。

### 8.3.1 可扩展拓扑与流程模板

“一用户 + 三 Agent”只表示 MVP 的最小可运行单位，不是长期固定编排。编排内核从第一天就必须支持可配置拓扑：

- **参与者基数**：`user` 和 `host` 在 MVP 及后续版本保持单例；`refiner`（方案完善/建设型）和 `challenger`（问题/风险质疑型）都是可扩展集合，数量可以是 `1..N`。
- **角色与实例分离**：角色定义能力和输入输出契约，实例定义模型、提示词、工具权限、并发额度和超时。同一角色可以创建多个实例，也可以在不同流程中复用。
- **流程模板注册**：使用 `WorkflowTemplate`/`GraphTemplate` descriptor 注册流程，不在 `JanusRoundtablePane` 或主图中硬编码 Agent-1、Agent-2。模板至少声明节点、边、fan-out、join、失败策略、终止条件和版本。
- **动态 fan-out/join**：根据当前会话配置生成多个完善 Agent 和质疑 Agent 节点；每个分支结果必须带 `agentId`/`role`/`roundId`，由 join 节点按策略归并、去重和标注冲突。
- **流程可替换**：MVP 的默认模板可以是 `refiners -> challengers -> host-synthesis`；后续可增加“先检索后讨论”“多阶段审查”“投票/仲裁”“用户确认后执行”等模板，UI 只渲染事件和状态，不感知具体图结构。
- **版本与兼容**：会话创建时锁定 `workflowId`、`workflowVersion` 和参与者快照；流程升级不改变历史会话的解释方式，恢复时使用原版本或显式迁移。

建议契约：

```ts
type ParticipantSpec = {
  role: 'host' | 'refiner' | 'challenger' | string
  min: number
  max: number
  instances: Array<{ id: string; model?: string; capabilities: string[] }>
}

type WorkflowTemplate = {
  id: string
  version: string
  participants: ParticipantSpec[]
  stages: Array<{ id: string; role: string; fanOut?: string; join?: string }>
  termination: 'user-only' | string
}
```

第一阶段 PoC 也必须用配置生成至少 1 个和 2 个 `refiner`、1 个和 2 个 `challenger` 两种拓扑，证明 fan-out、join、卡片排序、失败分支和主持人汇总不依赖固定数量。

### 8.4 分阶段落地

1. 先定义可扩展 `WorkflowTemplate`、参与者集合和事件契约；用内存 checkpointer + fixture 图验证轮次闸门、动态 fan-out/join、卡片投影和 `await-user` 恢复。
2. 在 Node/TypeScript 侧接入 LangGraph.js，保留 Provider adapter，避免业务节点绑定单一模型 SDK。
3. 接入持久化 checkpoint、事件日志、取消/超时/重试和 IPC streaming，再替换 fixture Agent。
4. 对独立子任务增加并行 subgraph；以首 token 时间、轮次完成时间、失败恢复率和重复执行率评估调度。
5. 其他框架只能通过 `AgentAdapter`/`SubgraphAdapter` 接入，事件必须映射回 JanusX 统一契约。

当前选型状态：**建议采用 LangGraph.js + JanusX Runtime 外壳，待 PoC 后冻结依赖版本**。

## 9. 文档维护规则

- 代码事实优先于旧讨论记录；每次 UI 或引擎改动后同步更新第 2、3 节。
- 已实现、部分实现、待实施和已移除必须明确区分。
- 被当前实现淘汰的布局方案直接删除，不继续累积历史描述。
- 新设计先记录目标、状态、交互、实现边界和验收条件，再进入编码。
- 产品规则不等于代码能力；未通过代码与测试验证的项目不能标记为已实现。

## 10. 最新决策记录

### 2026-09-01 / 后续对话交互基线

- 后续圆桌对话采用“左侧 Agent 工作预显 + Chat 结果卡片 + 右侧附属 Island 详情”的交互基线。
- Agent 开始工作前必须先发布队列/工作状态并在左侧席位可见；工作状态由运行时事件驱动，不再使用固定 `workingRole`。
- Agent 长输出不直接平铺到 Chat，统一落为可追溯的 `AgentResultCard`；Chat 只保留摘要和状态。
- 卡片点击打开 `agent-result` 附属 Island，详情与卡片共享同一数据对象，支持独立滚动、返回和 `Escape`，不重复执行任务。
- 会议轮次由用户显式推进：首次非空输入才创建并启动第 1 轮；每轮结束后停在等待状态，后续可用空输入让 Agent 自主优化，或输入补充想法后开启下一轮。
- 该方案先以 fixture 验证 UI，再接入真实圆桌事件、审批、恢复和持久化；在真实数据链路完成前不得标记为已实现。

### 2026-09-01 / 多智能体编排框架选型

- 推荐 LangGraph.js 作为状态编排内核，JanusX 自建 Runtime 负责队列、并发、模型路由、取消、超时、重试和 IPC。
- 不让 CrewAI、MetaGPT 或 Swarms 直接成为产品事实源；需要试用时通过适配器接入并映射统一事件契约。
- 选型依据是 JanusX 对显式轮次闸门、interrupt/resume、checkpoint、streaming、可追溯事件和灵活扩展的要求。
- 先完成小型 PoC，再冻结依赖版本；PoC 未验证恢复、取消和响应指标前，不扩散到 UI 数据模型。
- MVP 的一用户三 Agent 只是最小拓扑；完善型 Agent 与质疑型 Agent 均按集合建模并支持 `1..N` 扩展。
- 编排流程通过带版本的 `WorkflowTemplate` 注册，支持动态 fan-out/join 和多种后续流程；不得在主图、UI 或持久化结构中写死 Agent 数量。
- 第一阶段 PoC 已落地 `src/shared/roundtable` 类型契约、`src/main/roundtable/runtime.ts` LangGraph.js 运行时和 `tests/unit/roundtable-runtime.test.ts`；已验证 2 个完善 Agent + 2 个质疑 Agent、用户轮次闸门、空输入推进和单 Agent 失败保留结果。
- 下一阶段已新增 `src/main/roundtable/agent-registry.ts`，Runtime 可接收动态注册的 Agent 集合；已通过 4 项定向单元测试。真实模型适配、IPC streaming、checkpoint 持久化、取消/超时策略仍未接入。

### 2026-08-31 / 当前实现校准

- 文档状态从“需求研讨中，未进入实现”修正为“视觉舞台已实现，会议引擎重构中”。
- 当前布局确认为左侧完整 3D 圆桌，右侧共享羊皮纸在上、discussion-only Chat 在下。
- 当前羊皮纸默认关闭，由圆桌中心羊皮卷控制开合。
- 当前圆桌消息、Agent 状态、共享文档、编排、持久化和导出均未连接真实运行时。
- 删除已被代码淘汰的三栏、独立窗口、工作区嵌入和底部整宽输入条方案描述。

### 2026-08-31 / 右侧详细 Island 新方向

- 保留现有上下布局作为快速浏览模式。
- 共享羊皮纸新增符合羊皮纸视觉语言的展开控件。
- 用户需要详细阅读时，在主 Island 右侧生成等高的附属 Island，显示完整羊皮纸内容。
- 附属 Island 必须复用主体 Island 的外层视觉系统；羊皮纸风格只用于内容画布和专属控件。
- 分体能力按通用附属 Island Host 和可注册功能模块设计，羊皮纸只是首个模块，后续可以承载其他功能界面。
- MVP 同一时间只允许一个附属模块，避免形成连续级联的多重 Island。
- 用户可以通过返回控件或 `Escape` 回到上下布局，阅读位置和内容状态不得丢失。
- 宽度不足时使用单 Island 专注视图，避免压缩主圆桌和 Chat 到不可用尺寸。
- 当前状态：UI 交互已实现并接入圆桌；真实会议数据仍未接入，羊皮纸内容继续使用占位投影。

### 2026-08-31 / 附属 Island 首次落地

- `JanusIsland` 持有羊皮纸开合与附属模块状态，`JanusRoundtablePane` 改为受控组件。
- 通用外壳位于 `JanusAuxiliaryIsland.tsx`，羊皮纸内容位于 `JanusRoundtableParchment.tsx`，后续模块通过 descriptor 注册挂载。
- 宽屏显示主 Island 右侧等高阅读面；窄屏自动切换为单 Island 专注视图，不产生横向滚动。
- 返回控件和 `Escape` 关闭附属面并恢复上下布局，羊皮纸保持打开；同一时间仅允许一个附属模块。
- 关闭附属 Island 后清除羊皮纸激活状态，主体恢复为圆桌与 Chat 的原始布局。
- 圆桌主体移除羊皮纸内容面板及展开/收缩按钮，仅保留中心羊皮纸交互。
- 点击中心羊皮纸后直接打开右侧等高附属 Island，附属面板承载完整羊皮纸内容。
- 附属 Island 保留羊皮纸顶部标题和状态字样，不再显示第二个展开/收缩控件。

## 11. 2026-09-02 实测问题与修复记录

本次结合实际代码和原型复核，确认此前“已实现”描述存在偏差：

- Roundtable Chat 的消息列表由 `work.cards` 反推，用户输入没有写入任何消息状态。首次发送后输入框清空，重渲染时用户消息消失，因此右侧看不到用户消息卡片。
- `JanusRoundtablePane` 将 Agent 结果卡片放在中部 Chat 下方，右侧状态栏只保留羊皮纸展开按钮；同时样式末尾存在 `display: none !important`，导致右侧工作区即使收到结果也不可见。
- `roundtableMessages` 只包含 Agent 摘要，不包含用户消息，无法满足“用户提议 + Agent 结果”可追溯的讨论流。
- 原型右侧 Agent 卡片强调状态、标题、摘要和点击展开；原实现卡片过于扁平，摘要单行截断，层级与右侧工作区职责不一致。

本次修复：

- 在 `JanusRoundtablePane` 增加用户消息投影，非空发送先记录用户消息，再调用 `start/advance`；用户消息与 Agent 摘要按时间排序并去重显示。
- 将 Agent 结果卡片移入右侧 Agent Work Deck，空状态、结果计数、状态标签和多行摘要均可见；点击卡片继续打开 `agent-result` 详情 Island。
- 调整卡片视觉为原型风格的深色档案面板：细边框、状态色、标题/摘要层级、悬停和键盘焦点反馈。
- 覆盖冲突的隐藏规则，确保右侧工作区在 Roundtable 视图中稳定显示。

仍需后续验证：真实模型事件流、会话恢复后的用户消息持久化、端到端浏览器交互截图，以及 `advance-round` 幂等性测试。当前用户消息投影属于 Renderer 本地状态，尚未写入 Roundtable JSONL 事件日志。
### 2026-09-02 / Agent 输出呈现优化

补充实测问题：Agent 卡片摘要曾被转换为 assistant 消息，因此完整 Agent 回复直接展开在 Chat；同时 `modelNotice` 将内部 `workingRole` 字段（如 Agent-1）渲染到输入框底部，造成内部实现信息泄漏。

已调整为：Chat 只显示用户提议；Agent 工作中/已完成状态统一显示在右侧小型工作卡片，卡片点击后才打开附属 Island 查看完整 sections/evidence。Roundtable Chat 不再传递 `modelNotice`，内部 Agent 角色字段不再出现在底部。

### 2026-09-02 / 白字状态泄漏修复

实测发现 Roundtable 仍把 workingRole 拼接为 Chat 的 modelNotice，导致输入框底部显示 Agent-1/Agent-2，且 Agent 工作状态未形成卡片。现已彻底移除该 notice 传递；运行阶段无事件时也按默认 MVP Agent 集合生成 working 小卡片，结果完成后由事件卡片替换。Agent 详细输出仅通过点击卡片打开附属 Island。

### 2026-09-02 / Roundtable 中部布局重构

实测确认此前卡片栏与 Chat 以横向 flex 兄弟节点渲染，导致卡片占据整个右侧并挤压对话区；会议操作按钮使用 absolute 定位覆盖 Chat。现已改为中部纵向结构：Chat 占据主高度，Agent 卡片在 Chat 内下方左对齐，用户消息保持 Chat 原有右对齐；“开启下一轮/结束会议”改为独立底部操作行，不再覆盖对话内容。
### 2026-09-02 / 卡片与操作区顺序修正

再次实测确认，卡片位于 Chat 组件之后时会落到整个对话框最底部（晚于 Chat 自带输入区）。现已调整 JSX 顺序和 flex order：Agent 卡片区位于对话流上方并左对齐，Chat 消息及输入区位于中部，会议推进/结束控件位于最底部独立操作行。
<!-- Document role: implementation plan and ongoing implementation record. -->

## 12. 2026-09-02 / MVP 验证与双层数据模型校准

### 当前结论

- 圆桌 Runtime MVP 已完成 PoC 级跑通：用户输入、首轮启动、Agent 编排、轮次等待、用户推进、结束会议和基础事件记录均已接入。
- Agent 工作卡片、对话流、附属 Island、Chat/圆桌视图保持和工作区添加反馈已完成基础 UI 实现。
- 该版本仍不能标记为完整产品 MVP：真实模型适配、完整恢复、取消/超时、最终整理和导出文件 UI 仍未全部验证。

### 双层数据模型核对

设计要求是维护两份数据：

1. **Agent 公有池（机器读取层）**：完整、结构化、可追溯，供 Agent 读取事实、来源、状态和历史变更。
2. **人类羊皮纸（人类阅读层）**：由 JanusX 主持人整理后的简洁文本，只展示结论、确认决策、关键依据、主要风险和下一步行动。

当前实现仍存在偏差：`RoundtableState.facts` 是机器读取层，但 `projectParchment()` 只是按事实类型分类，`JanusRoundtableParchment` 又将分类后的事实逐条展开。因此羊皮纸目前是“结构化事实投影”，还不是独立的人类可读总结。

### 后续实施方案

- 保留 `RoundtableState.facts` 作为 Agent 公有池，不将其直接作为羊皮纸正文。
- 增加主持人整理步骤，生成独立的 `HumanReadableParchment` 内容。
- 羊皮纸正文默认只显示简洁结论、决策、依据、风险和行动项。
- 来源索引、原始 Agent 输出、状态和证据引用改为可展开的追溯信息。
- 在测试中分别验证公有池完整性和羊皮纸可读性，禁止以“事实分类完成”替代“主持人整理完成”。

### 实施状态

| 能力 | 状态 | 说明 |
|---|---|---|
| 圆桌 Runtime 生命周期 | 已完成 PoC | 已验证启动、轮次闸门、推进和结束 |
| Agent 结果卡片 | 已实现 | 支持状态、摘要、详情 Island |
| Agent 公有事实池 | 已实现基础版 | 结构化事实和来源可追溯 |
| 人类可读羊皮纸 | 待实现 | 当前仍是事实分类投影，缺少主持人整理 |
| 最终整理与导出 | 部分实现 | 有 Markdown 导出路径，完整整理和文件保存 UI 待完善 |
## 13. 2026-09-02 / 工作区上下文接入计划

当前核对确认：添加工作区目前只对普通 Janus Chat 生效，尚未接入圆桌 Runtime。普通 Chat 会保存 `conversation.attachedWorkspaceIds` 并创建 workspace session；圆桌 Agent 只收到用户输入和前序卡片摘要，不接收工作区路径、文件内容或工具，因此目前不能宣称 Agent 能围绕需求与工作区进行讨论。

### 分阶段实施计划

1. **会话数据契约**：扩展 `roundtable:start/advance` 携带 `workspaceResources`，并在 `RoundtableState` 保存资源快照，验证事件日志和恢复状态可还原。
2. **只读工作区上下文**：复用安全 workspace session，为 Agent 提供结构摘要、文件索引和用户指定文件；默认禁止写文件、命令和 Git 修改。
3. **共享公有事实池**：让 Refiner、Challenger、Host 读取同一版本的工作区事实，引用记录路径、行号或事件 ID，并区分 confirmed/proposal/concern/pending-validation。
4. **人类可读羊皮纸**：新增独立 `HumanReadableParchment`，由 Host 整理结论、决策、依据、风险和行动；原始输出、状态和来源改为可展开追溯信息。
5. **恢复与端到端验收**：覆盖绑定工作区、Agent 读取文件、多轮讨论、卡片详情、羊皮纸草稿、结束和导出，并增加超时、取消、重复事件和大仓库测试。

### 实施状态

| 能力 | 状态 | 下一步 |
|---|---|---|
| 普通 Chat 添加工作区 | 已实现 | 保持现有行为 |
| 圆桌绑定工作区资源 | 未实现 | 阶段 1：扩展 IPC 与状态契约 |
| 圆桌 Agent 只读工作区 | 未实现 | 阶段 2：复用安全读取适配器 |
| 多 Agent 共享工作区公有池 | 未实现 | 阶段 3：上下文版本与来源追踪 |
| 人类可读羊皮纸 | 待实现 | 阶段 4：主持人整理模型 |
| 恢复与完整端到端验收 | 部分实现 | 阶段 5：补齐测试与真实链路 |

## 16. 2026-09-02 / 阶段 3 实施记录：共享公有事实池

### 已完成

- 启动时读取到的工作区文件路径会生成共享 `evidence` 事实，进入 `RoundtableState.facts`。
- 所有 Refiner、Challenger、Host Agent 使用同一份工作区上下文和共享事实列表。
- Agent 输入新增 `priorFacts`，不再只依赖前序卡片摘要。
- 结果卡片的 `evidenceRefs` 同时记录工作区文件路径和前序卡片 ID，支持追溯。
- 共享事实保留 `confirmed/proposal/concern/pending-validation` 等状态语义，供后续主持人整理使用。
- `RoundtableState.getState()` 和 hydrate 快照复制工作区资源、上下文文件和事实，避免跨轮次引用丢失。

### 阶段 3 边界

当前公有池使用的是启动时的只读文件快照；Agent 仍不能在讨论中动态调用读取工具，也没有实现事实冲突合并策略和行号级来源定位。这些能力将在后续工具接入与主持人整理阶段补齐。

### 状态

| 能力 | 状态 |
|---|---|
| 工作区证据进入共享事实池 | 已实现基础版 |
| 多 Agent 读取同一份事实 | 已实现 |
| 结果卡片引用工作区文件 | 已实现基础版 |
| 事实状态语义 | 已实现基础版 |
| 讨论中动态读取文件 | 待后续实现 |
| 冲突合并与行号级来源 | 待后续实现 |

## 15. 2026-09-02 / 阶段 2 实施记录：只读工作区上下文

### 已完成

- 圆桌启动时会读取绑定工作区的文本文件，生成受限大小的只读上下文快照。
- 复用 `JanusWorkspaceFs.collectTextEvidence()`，自动跳过 `.git`、`node_modules`、构建产物和敏感路径。
- 上下文限制为最多 40 个文件、单文件 12KB、总上下文 96KB，避免大仓库阻塞会议。
- Runtime 将工作区证据上下文传递给每个 Refiner、Challenger 和 Host Agent。
- Agent 提示词会同时包含工作区路径、文件内容摘要和前序 Agent 结果。
- 无法读取的工作区不会阻塞圆桌，会以“无可读证据”继续运行。

### 阶段 2 边界

本阶段实现的是启动时只读上下文快照，不是动态工具调用。Agent 暂时不能在讨论中自行再次读取文件，也不能写文件、执行命令或修改 Git；这些属于后续权限与工具接入工作。

### 状态

| 能力 | 状态 |
|---|---|
| 读取工作区文本文件 | 已实现基础版 |
| 排除敏感目录和非文本文件 | 已实现 |
| 上下文大小限制 | 已实现 |
| Agent 接收工作区证据 | 已实现基础版 |
| 讨论中动态读取文件 | 阶段 3 待实现 |
| 写入、命令和 Git 操作 | 禁止，待后续审批设计 |

## 14. 2026-09-02 / 阶段 1 实施记录：圆桌绑定工作区资源

### 已完成

- 新增 `RoundtableWorkspaceResource` 契约，统一记录 `workspaceId`、`workspaceName`、`workspacePath`。
- `roundtable:start` 支持传入 `{ prompt, workspaceResources }`，并保留字符串输入兼容。
- 圆桌 Renderer 从当前 `resourceController.resources` 生成工作区资源快照后再启动会话。
- `RoundtableState` 保存会话级 `workspaceResources` 快照；后续轮次沿用该快照，不随 UI 临时变化漂移。
- Runtime 的 Agent 输入契约携带工作区资源，当前模型提示词会明确列出只读工作区路径。
- IPC、Preload、Main Service、Runtime 和共享类型已完成贯通。
- 既有圆桌 Runtime 与状态单元测试通过。

### 阶段 1 边界

本阶段只完成“资源绑定和上下文传递”，尚未实现文件读取工具、工作区内容摘要、权限审批或写操作。Agent 当前知道绑定了哪些工作区路径，但还不能因此读取项目文件；这些能力属于阶段 2。

### 状态

| 能力 | 状态 |
|---|---|
| 圆桌启动携带工作区资源 | 已实现 |
| 圆桌状态保存资源快照 | 已实现 |
| 后续轮次复用资源快照 | 已实现 |
| Agent 接收工作区路径上下文 | 已实现基础版 |
| Agent 读取工作区文件 | 阶段 2 待实现 |
| 工作区权限与只读策略 | 阶段 2 待实现 |
