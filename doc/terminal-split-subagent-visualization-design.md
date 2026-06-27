# JanusX 终端分屏与 SubAgent 可视化设计方案

## 1. 设计结论

JanusX 可以借鉴 CLI-Manager 的 JetBrains 风格分屏，但不应把 SubAgent 可视化简单做成“更多终端窗口”。

最终推荐方案：

- 终端分屏采用 JetBrains 风格的 `Pane Tree + Pane Tabs`。
- 顶部 Island 保留，升级为 `Agent Mission Bar`，负责 SubAgent 状态总览、告警和跳转。
- SubAgent 细节不常驻挤占主工作区，默认收纳在顶部 Island 的展开层或 Mission Control 中。
- 终端分屏负责执行现场，Island 负责运行态势、审批提醒、分析结果和导航调度。

一句话概括：

> Terminal Pane 是执行现场，Island 是任务态势层。

## 2. 为什么不把 SubAgent 都做成终端分屏

SubAgent 可视化和终端分屏不是同一层问题。

终端适合：

- 用户需要直接输入、审批、复制输出。
- Agent 正在跑交互式 CLI，例如 Claude Code / Codex。
- 用户需要观察实时 TUI 或 shell 输出。

Island 适合：

- 展示多个 SubAgent 的运行状态。
- 聚合待审批、失败、完成、排队等状态。
- 跳转到对应终端或打开详情。
- 展示 diff、tool call、分析结果、新需求发现。

如果每个 SubAgent 默认都占一个终端 pane，界面会很快失控。更合理的是：SubAgent 默认进入 Island，可被用户按需提升到 split pane。

## 3. 整体信息架构

推荐分为三层。

### 3.1 Terminal Layer：执行层

负责真实终端、分屏和 tab 管理。

能力包括：

- `Split Right`
- `Split Down`
- `Unsplit`
- pane 分隔线拖拽调整比例
- 每个 pane 独立 tab bar
- tab 在 pane 内排序
- tab 拖到其他 pane
- tab 拖到边缘创建新 split
- 关闭 pane 时选择合并 tabs 或关闭 pane 内终端

### 3.2 AgentRun Layer：运行状态层

统一表达主 Agent、SubAgent、headless agent、终端 agent。

建议数据模型：

```ts
interface AgentRun {
  id: string
  nodeId: string
  parentRunId?: string
  terminalId?: string
  engine: 'claude' | 'codex' | 'opencode'
  role: 'main' | 'coderX' | 'evaluatorX' | 'abstracterX' | 'subagent'
  status: 'queued' | 'running' | 'waiting-approval' | 'done' | 'failed'
  title: string
  lastEvent?: string
  changedFileCount?: number
  startedAt: string
  updatedAt: string
}
```

核心原则：

- Island、终端、Analyzer、Checkpoint 都围绕 `AgentRun` 协作。
- Island 不直接解析终端输出。
- 终端、headless agent、hook bridge、analyzer 都可以向 `AgentRun` 写事件。

### 3.3 Island Layer：态势层

顶部 Island 保留，不改成常驻右侧栏。

它的职责是：

- 当前任务下有哪些 Agent 在运行。
- 哪些 Agent 需要用户介入。
- 哪些 Agent 已完成或失败。
- 点击后跳转终端、打开 split、查看 diff 或 transcript。

## 4. 顶部 Island 的 SubAgent 可视化设计

顶部空间横向充足、纵向昂贵，因此 Island 不适合承载完整日志或复杂树图。

推荐三种状态。

### 4.1 Compact Mode：默认态

高度约 `44-56px`，只显示当前节点下的 Agent 状态胶囊。

示例：

```text
[Auth Refactor]  [Main Claude running] [coderX #1 done] [coderX #2 approval] [evaluatorX queued] [View All]
```

每个 chip 包含：

- Agent 类型：`Main` / `coderX` / `evaluatorX` / `abstracterX`
- 状态点：running / approval / done / failed / queued
- 简短编号或标题
- 点击行为

状态优先级：

1. `waiting-approval`
2. `failed`
3. `running`
4. `queued`
5. `done`

当 SubAgent 过多时，不全部平铺，显示聚合：

```text
[2 approval] [3 running] [1 failed] [4 done] [View All]
```

### 4.2 Expanded Mode：展开态

点击顶部 Island 后展开，高度约 `160-240px`。

展示当前节点下的 Agent 拓扑：

```text
Main Claude
  ├─ coderX #1    done        4 files changed
  ├─ coderX #2    approval    waiting for terminal input
  └─ evaluatorX   queued      waits for coderX #2
```

可展示字段：

- 父子关系
- 状态
- 最近事件
- 变更文件数量
- 是否绑定 terminalId
- `Focus Terminal`
- `Open in Split`
- `View Diff`
- `View Transcript`
- `Cancel`

### 4.3 Mission Control Mode：全局态势层

当并发 Agent 较多，或进入 Mode A-parallel / Agent Teams 场景时，使用浮层或全屏总览。

示例：

```text
Active Runs
┌ Main Claude ┐ ┌ coderX #1 ┐ ┌ coderX #2 ┐ ┌ evaluatorX ┐
│ running     │ │ done      │ │ approval  │ │ queued     │
└─────────────┘ └───────────┘ └───────────┘ └────────────┘
```

Mission Control 用于“看全局”，不是用于长期占屏。

## 5. JetBrains 风格工作区分屏设计

JanusX 的分屏建议不要命名为单纯 `TerminalSplit`，而应抽象为 `WorkspacePane`。

原因：未来 pane 不只承载终端，还可能承载：

- Terminal
- Blueprint Node Detail
- Agent Transcript
- Diff Review
- File Preview
- Analyzer Result

建议数据结构：

```ts
type PaneContent =
  | { type: 'terminal'; terminalId: string }
  | { type: 'agent-run'; runId: string }
  | { type: 'diff'; checkpointId: string }
  | { type: 'blueprint-node'; nodeId: string }

type PaneNode =
  | {
      type: 'leaf'
      id: string
      tabs: PaneContent[]
      activeTabId: string | null
    }
  | {
      type: 'split'
      id: string
      direction: 'horizontal' | 'vertical'
      ratio: number
      first: PaneNode
      second: PaneNode
    }
```

第一阶段可以只实现 terminal content，但模型上不要锁死。

## 6. Island 与分屏的交互关系

Island 不承载终端，Island 控制终端。

推荐交互：

- 点击 Agent chip：如果有 `terminalId`，激活对应 pane/tab。
- 双击 Agent chip：将对应终端打开到 split pane。
- 右键 Agent chip：显示菜单：
  - `Focus Terminal`
  - `Open in Split`
  - `View Transcript`
  - `View Diff`
  - `Cancel`
- 拖拽 Agent chip 到工作区边缘：创建 JetBrains 风格 split。
- 没有 `terminalId` 的 headless Agent：打开详情抽屉，不自动创建终端。

推荐边界：

- Island 负责状态、导航、调度。
- Pane 负责承载可操作内容。
- Analyzer 负责终端关闭、commit 后的结果理解。
- Checkpoint 负责会话前后 diff 与恢复。

## 7. 多屏切换策略

默认策略：少分屏，按需展开。

### 7.1 默认单主屏

用户聚焦一个 Blueprint Node，一个主终端，一个顶部 Agent Mission Bar。

### 7.2 SubAgent 默认不占 pane

多个 SubAgent 默认收纳在 Island，而不是自动铺满工作区。

### 7.3 自动分屏只给高价值会话

可以自动晋升到 split 的场景：

- 主 Agent 终端
- evaluatorX 审核终端
- 正在等待用户审批的 Agent
- 用户手动 pin 的 Agent

其余 SubAgent 保持在 Island。

### 7.4 超过 3 个活跃终端时进入 Mission Control

不要继续切碎主工作区。超过 3 个活跃终端时，提供总览层让用户选择要聚焦哪个。

### 7.5 Pane 是可晋升资源

Island 中的 AgentRun 可以被用户显式 `Open in Split`，但不默认占用 split。

## 8. 状态表达规范

状态建议：

| Status | Meaning | UI Treatment |
|---|---|---|
| `queued` | 等待执行 | gray |
| `running` | 正在执行 | blue / cyan |
| `waiting-approval` | 等待用户审批 | amber |
| `done` | 已完成 | green |
| `failed` | 执行失败 | red |

注意：

- 不要只靠颜色表达状态，必须有文字或图标。
- 状态 chip 需要可点击。
- 有待审批时，顶部 Island 必须显著提示。
- failed 状态优先级高于 running，但低于 waiting-approval。

## 9. 与 CLI-Manager 的借鉴关系

可以借鉴：

- Pane Tree 分屏模型
- Pane 内独立 tab bar
- tab 拖拽到边缘创建 split
- 终端状态点
- hook bridge 驱动的运行状态
- SubAgent 自动布局思路

不建议照搬：

- 每个 SubAgent 默认创建终端
- 把历史、diff、审批、统计都塞进终端界面
- 让终端成为唯一状态来源

JanusX 更适合的方向：

```text
Blueprint Node = 工作目标
Terminal Pane = 执行现场
AgentRun = 可追踪运行单元
Island = 状态 / 审批 / 分析 / 发现的可视化层
Analyzer = 事后理解和回写节点进度
```

## 10. 跨工作区终端组合设计

JanusX 当前的基础逻辑是：左侧切换工作区，中部区域显示对应工作区的终端、Blueprint 和上下文。

后续如果实现 JetBrains 风格分屏，可以进一步支持跨工作区终端组合：

> 用户从左侧工作区列表拖动另一个工作区或其中某个终端到中部区域后，中部进入跨工作区分屏状态。

这个能力建议定义为：

```text
Workspace Composition Mode
```

它不是简单的“多个工作区同时 active”，而是一个显式的组合视图。

### 10.1 设计目标

跨工作区终端组合用于解决真实开发中的多项目协作场景，例如：

- 一个前端项目 + 一个后端 API 项目。
- 一个主应用 + 一个插件项目。
- 一个 JanusX 工作区 + 一个测试工程。
- 一个 Claude/Codex 任务运行在项目 A，同时需要观察项目 B 的 dev server。

目标：

- 中部一个分屏面板可以同时展示多个工作区的终端。
- 左侧多个工作区可以同时呈现高亮状态。
- 用户仍然能明确知道哪个工作区是当前主上下文。
- Blueprint、Island、Analyzer、Checkpoint 不因为跨工作区显示而混淆归属。

### 10.2 核心概念：Primary Workspace

组合模式下必须始终存在一个 `primaryWorkspaceId`。

```ts
interface WorkspaceComposition {
  id: string
  primaryWorkspaceId: string
  workspaceIds: string[]
  paneTree: PaneNode
  activePaneId: string | null
  activeTabId: string | null
}
```

语义：

- `primaryWorkspaceId` 决定当前 Blueprint、顶部 Island、默认 Git、默认文件树、默认 Analyzer 上下文。
- `workspaceIds` 决定当前中部组合面板里包含哪些 workspace 的 terminal。
- pane/tab 自己携带 `workspaceId`，不能依赖当前左侧选中状态。

没有 Primary Workspace，多个工作区高亮会变得含糊：用户无法判断文件树、Blueprint、Island 当前到底属于谁。

### 10.3 左侧工作区状态

左侧工作区列表建议有三种状态。

| 状态 | 含义 | 左侧表现 |
|---|---|---|
| Active Workspace | 当前主工作区 | 强高亮，实心背景，名称加粗 |
| Composed Workspace | 已加入当前跨工作区面板 | 次高亮，左侧色条 / ring，显示 `In Panel` |
| Available Workspace | 未加入组合 | 普通状态 |

示例：

```text
● JanusX        Primary
◐ API Server   In Panel
  Docs Site
```

或：

```text
[ACTIVE] JanusX       2 terminals
[PINNED] API Server   1 terminal
         Docs Site    0 terminals
```

规则：

- Primary 使用主色背景。
- Composed 使用弱高亮，不应看起来和 Primary 同级。
- 当前 focused pane 所属 workspace 可以显示临时 focus ring，但它不等于 Primary。

### 10.4 左侧终端预览

每个 workspace item 可以展开展示终端预览。

```text
JanusX
  Claude    running
  Shell     idle

API Server
  Codex     approval
  Dev       running
```

终端预览项可拖拽到中部区域：

- 拖 workspace：将该 workspace 的默认终端或 pinned terminal 加入当前 composition。
- 拖 terminal item：只将该 terminal 加入当前 pane。
- 拖到中部边缘：创建 split。
- 拖到已有 pane 的 tab bar：加入该 pane tabs。
- 拖到中部空白区域：创建或替换当前 composition，具体行为可通过明确 drop hint 提示。

### 10.5 中部 Composition Bar

仅靠左侧组合高亮不够。中部顶部应显示当前组合状态。

示例：

```text
Composition: JanusX + API Server
Primary: JanusX
[Switch Primary] [Save Panel] [Exit Composition]
```

紧凑形态：

```text
JanusX primary  +  API Server pinned     Exit
```

交互：

- 点击 workspace chip：设为 Primary Workspace。
- 点击 chip 上的 `x`：从 composition 移除该 workspace 的 terminals。
- `Exit Composition`：回到 Primary Workspace 的单工作区视图。
- `Save Panel`：保存当前组合，例如 `Frontend + API Debug Panel`。

### 10.6 组合高亮后的单独工作区显示

组合模式下，用户点击左侧某个已组合工作区时，必须区分两个动作。

#### Focus Workspace

单击推荐执行 `Focus Workspace`。

行为：

- `primaryWorkspaceId = clickedWorkspaceId`
- 中部 `paneTree` 不变
- Blueprint / Island / file tree 切到该 workspace
- 左侧 clicked workspace 变为强高亮

适用场景：

- 用户想查看 API Server 的 Blueprint。
- 但仍希望保留 JanusX + API Server 的跨工作区终端分屏。

#### Open Workspace Alone

右键菜单或显式按钮执行 `Open Workspace Alone`。

行为：

- 中部切回该 workspace 自己的 workspace layout。
- 当前跨工作区 composition 被保存为可恢复 session。
- 左侧只有该 workspace 处于 Active。
- 原组合显示为 Saved Panel，可从顶部或侧边恢复。

必须分开这两个动作，否则用户无法判断点击 workspace 是“切主上下文”还是“退出组合视图”。

### 10.7 Pane Tab 的 Workspace Badge

跨工作区模式下，每个 pane tab 必须显示来源 workspace。

示例：

```text
[JanusX / Claude] [API / Codex] [API / Dev]
```

如果不是跨工作区模式，可以隐藏 workspace badge，减少视觉噪音。

### 10.8 状态模型

推荐新增视图模式状态：

```ts
type WorkspaceViewMode =
  | { type: 'single'; workspaceId: string }
  | { type: 'composition'; compositionId: string; primaryWorkspaceId: string }
```

终端会话应全局化：

```ts
interface TerminalSession {
  id: string
  workspaceId: string
  workspacePath: string
  name: string
  preset: TerminalPreset
  status: TerminalStatus
}
```

Pane 引用终端，不拥有终端：

```ts
type PaneContent = {
  type: 'terminal'
  terminalId: string
  workspaceId: string
}
```

这样一个终端可以被跨工作区组合面板引用，而不会被当前 workspace store 锁死。

### 10.9 Island / Analyzer / Checkpoint 边界

组合模式下最容易出错的是归属。

边界规则：

- 顶部 Island 默认显示 `primaryWorkspaceId` 的 Island。
- 进入 Global Island 模式时，才显示所有 composed workspaces 的 AgentRun。
- Analyzer 写回必须根据 `terminal.workspaceId` 找对应 Blueprint。
- Analyzer 不允许使用当前 UI 的 Primary Workspace 隐式推断终端归属。
- Git / checkpoint / restore 必须显式携带 `workspacePath`。
- 跨 workspace restore 或 destructive git 操作必须显示 workspace 确认。

可以跨工作区聚合：

- terminal session
- AgentRun 状态
- approval 提醒
- terminal output view
- open in split

不应默认跨工作区混合：

- Blueprint 编辑上下文
- Analyzer 默认归属
- Checkpoint restore
- Git 操作默认目标
- 文件编辑默认目标

### 10.10 推荐交互范式

最终交互可以整理为：

1. 左侧 workspace 默认单选。
2. workspace item 下展示 terminal preview。
3. 用户拖另一个 workspace 或 terminal 到中部。
4. JanusX 进入 Composition Mode。
5. 左侧多个 workspace 高亮：
   - 一个 Primary
   - 多个 In Panel
6. 单击 composed workspace：切换 Primary，但不拆组合。
7. 右键或按钮 `Open Alone`：单独显示该 workspace。
8. `Exit Composition`：回到 Primary Workspace 单独视图。
9. composition 可保存、恢复、命名，例如 `Frontend + API Debug Panel`。

### 10.11 设计判断

跨工作区终端组合是有价值的，但必须显式建模，不应只靠多个左侧高亮表达。

正确模型是：

```text
Single Workspace View
  -> drag workspace / terminal into center
Workspace Composition Mode
  -> one Primary Workspace
  -> multiple Composed Workspaces
  -> one shared PaneTree
```

这样既能满足真实多项目终端监控需求，又不会破坏 JanusX 原有的工作区切换、Blueprint 归属和 Analyzer 闭环。

## 11. 推荐实施阶段

### Phase 1：Terminal-only JetBrains Split

目标：

- 实现 `PaneTree`
- 支持 terminal tabs
- 支持 split right / split down / unsplit
- 支持 pane resize

暂不做 SubAgent 自动布局。

### Phase 2：统一 PaneContent 抽象

目标：

- pane tab 不再只支持 terminal
- 为后续 diff、agent-run、blueprint-node 预留结构

### Phase 3：全局 Terminal Registry 与 Workspace Badge

目标：

- 将 terminal sessions 从当前 workspace store 抽象为全局 registry。
- TerminalSession 显式携带 `workspaceId` 和 `workspacePath`。
- 跨工作区模式下 pane tab 显示 workspace badge。
- 保持单工作区模式下的 UI 简洁。

### Phase 4：Workspace Composition Mode

目标：

- 实现 `WorkspaceViewMode`。
- 支持从左侧 workspace / terminal preview 拖到中部形成组合。
- 支持 Primary Workspace 与 Composed Workspace 高亮。
- 支持 Composition Bar。
- 支持 `Focus Workspace` 与 `Open Workspace Alone`。

### Phase 5：AgentRun 数据模型

目标：

- 串联 `nodeId`、`terminalId`、`engine`、`role`、`status`
- 让 terminal、headless agent、analyzer 都能写入运行事件

### Phase 6：顶部 Agent Mission Bar

目标：

- Compact Mode
- Expanded Mode
- Agent chip 跳转终端
- 待审批 / 失败 / 运行中聚合显示

### Phase 7：Island 与 Split 联动

目标：

- Agent chip 支持 `Open in Split`
- Agent chip 支持拖拽到工作区边缘创建 split
- headless Agent 支持打开 transcript/diff 详情

### Phase 8：Hook Bridge 与实时状态

目标：

- 给 PTY 注入 JanusX session env
- 接收 Claude/Codex `SessionStart`、`PermissionRequest`、`Stop` 等事件
- 实时更新 AgentRun 和 Island

### Phase 9：SubAgent Auto Layout

目标：

- 只将高价值 AgentRun 自动晋升为 split
- 其余 AgentRun 保持在 Island
- 超过阈值进入 Mission Control

## 12. 最终判断

JanusX 可以使用 JetBrains 风格分屏，但它应该是“工作区分屏”，不是单纯“终端分屏”。

顶部 Island 也不需要移动到侧边。它更适合升级成 Agent Mission Bar：

- 顶部负责总览和告警。
- 展开层负责 SubAgent 拓扑。
- Mission Control 负责多 Agent 并行态势。
- 主工作区负责终端、diff、transcript、Blueprint 详情等可操作内容。

这样可以同时满足：

- 多终端协作
- SubAgent 可视化
- Blueprint 节点绑定
- Analyzer 闭环
- 不让多屏界面失控

跨工作区终端组合可以作为分屏能力的高级形态加入。它的关键不是让多个工作区“同时 active”，而是显式维护 `Workspace Composition Mode` 与 `Primary Workspace`：

- 左侧可以多工作区高亮，但必须有主次层级。
- 中部可以跨工作区分屏，但每个 tab 必须带 workspace 来源。
- Island、Analyzer、Checkpoint 必须使用明确的 workspace 归属。
- 单击组合中的工作区应切换 Primary，显式 `Open Alone` 才退出组合。
