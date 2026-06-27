# JanusX 底部 Runtime Status Bar 与终端遥测设计方案

## 1. 设计结论

JanusX 可以复用现有底部栏，将其升级为 `Runtime Status Bar`。它不应被设计成某个终端的附属底栏，而应成为应用级运行状态层，统一承载终端、模型、上下文、费用、SubAgent、审批和跨工作区组合的轻量摘要。

最终推荐方案：

- 复用现有底部栏，不新增独立的底部监控窗。
- 底部栏默认保持轻量，高度控制在 `28-34px`。
- 点击或快捷键展开 `Monitoring Drawer`，展示更完整的终端遥测详情。
- 顶部 Island 继续负责任务态势、SubAgent 编排、审批提醒和导航。
- 底部 Runtime Status Bar 负责模型、上下文、Token、费用、运行状态和终端资源态势。
- 多分屏和跨工作区模式下，底部栏显示 `active + aggregate`，不尝试平铺所有细节。

一句话定义：

```text
Island = 任务态势层
Runtime Status Bar = 运行遥测层
Workspace Pane = 执行现场
Monitoring Drawer = 详细观测面板
```

## 2. 为什么复用现有底部栏

当前底部栏尚未承担强业务职责，正适合升级为稳定的运行状态入口。如果另外新增一个底部监控窗，会带来三个问题：

| 问题 | 影响 | 复用底部栏的处理 |
|---|---|---|
| 空间冲突 | 未来终端分屏、跨工作区分屏都会占用中部主空间 | 底部栏作为固定 chrome，不侵入 pane 布局 |
| 信息归属混乱 | 多个终端同时运行时，不知道监控窗对应哪个终端 | 通过 `TelemetryScope` 明确当前显示范围 |
| 功能重复 | 底部栏和监控窗都承担状态展示，用户认知重复 | 底部栏做摘要，Drawer 做详情 |

复用底部栏还有一个优势：它符合 JetBrains 风格产品的状态栏思路。底部区域可以长期承载“当前系统状态”，而不是承载主要操作内容。

## 3. 与 CLI-Manager 的借鉴边界

CLI-Manager 中 Claude 终端底部的输入和提示区域主要来自 Claude Code 自己的 TUI 输出，不是 CLI-Manager 额外绘制的 React 底栏。

JanusX 不应仿照“终端内部底栏”，而应仿照它的外围能力：

- PTY 宿主负责运行 Claude / Codex / OpenCode。
- Hook 或日志解析负责采集运行事件。
- 应用 UI 在终端外层展示模型、上下文和状态摘要。
- 终端内部 TUI 保持由 CLI 自己控制，避免抢输入行、光标、alt-screen 和 resize 行为。

因此 JanusX 的底部栏应是应用 chrome：

```text
错误方向：在 xterm 内部插入状态栏
正确方向：在 JanusX 主窗口底部提供 Runtime Status Bar
```

## 4. 信息架构

底部 Runtime Status Bar 建议拆成四个区域。

```text
[Scope] [Active Runtime Telemetry] [Visible Runtime Chips] [Actions / Alerts]
```

### 4.1 Scope 区域

Scope 区域回答“当前底部栏展示的是谁”。

示例：

```text
JanusX
JanusX · 3 panes
Composed: JanusX + API Server
Pinned: Claude / JanusX
```

职责：

- 表示当前工作区或组合视图。
- 表示当前是 active pane、workspace aggregate 还是 pinned terminal。
- 点击后可以打开 scope 切换菜单。

### 4.2 Active Runtime Telemetry 区域

中间主区域展示当前最重要的运行遥测。

单终端示例：

```text
Claude · Sonnet 4 · ctx 68% · in 12.4k · out 2.1k · $0.42
```

多终端 active pane 示例：

```text
Active: Codex · GPT-5 · ctx 31% · running
```

未知数据示例：

```text
OpenCode · model unknown · ctx unknown · running
```

职责：

- 优先展示 active pane 的模型和上下文。
- 不可用的数据显式显示 `unknown`，不要伪造。
- 对高风险状态使用短文本提示，例如 `ctx high`、`approval`、`failed`。

### 4.3 Visible Runtime Chips 区域

当可见 pane 超过一个时，主区域不应塞满所有详情，而是通过 chips 展示其他终端摘要。

示例：

```text
[Claude 68%] [Codex 31%] [Dev idle]
```

每个 chip 包含：

- provider
- context 百分比或 unknown
- running / idle / approval / failed
- 可选 workspace badge

交互：

- 单击 chip：focus 对应 pane 或 tab。
- 右键 chip：显示 `Pin to Status Bar`、`Open Details`、`Open in Split`。
- hover：展示完整模型、cwd、workspace、sessionId、最近更新时间。

### 4.4 Actions / Alerts 区域

右侧展示需要用户处理的动作和高优先级提醒。

示例：

```text
2 agents · 1 approval · ctx high
```

优先级：

1. `waiting-approval`
2. `failed`
3. `context-high`
4. `running`
5. `done / idle`

右侧按钮建议：

- `Agent Activity`
- `Approvals`
- `Monitoring Drawer`
- `Status Settings`

图标应使用项目现有图标库，不使用 emoji。图标按钮必须有 tooltip 和 aria-label。

## 5. TelemetryScope 设计

底部栏必须避免绑定单个终端。建议引入 `TelemetryScope`。

```ts
type TelemetryScope =
  | { type: 'active-terminal'; terminalId: string }
  | { type: 'active-workspace'; workspaceId: string }
  | { type: 'visible-panes'; paneIds: string[] }
  | { type: 'workspace-composition'; compositionId: string; primaryWorkspaceId: string }
  | { type: 'pinned-terminal'; terminalId: string }
```

默认解析规则：

| UI 场景 | 默认 Scope | 底部栏展示 |
|---|---|---|
| 单工作区单终端 | `active-terminal` | 当前终端完整摘要 |
| 单工作区多分屏 | `visible-panes` | active pane 详情 + 其他 pane chips |
| 跨工作区组合 | `workspace-composition` | composition 摘要 + 每个 workspace/terminal chips |
| 用户 pin 某终端 | `pinned-terminal` | 固定终端，不随焦点变化 |
| 无终端 | `active-workspace` | workspace 状态、无终端提示、可新建入口 |

这样设计后，底部栏不会因为分屏增加而失控。

## 6. 三类工作终端兼容策略

JanusX 当前预计兼容 Claude、Codex、OpenCode 三类 AI 工作终端，也可能存在普通 shell。底部栏不应假设所有 provider 都能提供完整 token 数据。

### 6.1 统一模型

```ts
type TerminalProvider = 'claude' | 'codex' | 'opencode' | 'shell' | 'unknown'

type RuntimeState =
  | 'idle'
  | 'running'
  | 'waiting-approval'
  | 'failed'
  | 'done'
  | 'unknown'

interface TerminalTelemetry {
  terminalId: string
  workspaceId: string
  workspacePath: string
  provider: TerminalProvider
  model?: string
  contextUsedRatio?: number
  contextWindowTokens?: number
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  costUsd?: number
  state: RuntimeState
  activeAgentRunIds: string[]
  lastEvent?: string
  updatedAt: number
}
```

### 6.2 Provider 能力分级

| Provider | 第一阶段能力 | 第二阶段能力 | 缺失处理 |
|---|---|---|---|
| Claude | hook 事件、session 状态、SubAgent 状态 | jsonl 解析模型、token、context、cost | 显示 `ctx unknown` |
| Codex | hook 事件、permission、stop、rollout token_count | context window、模型、token 趋势 | 显示 `model unknown` |
| OpenCode | terminal preset、进程状态、cwd | 后续适配日志或 API | 只显示 provider/state |
| Shell | cwd、running/idle | 命令耗时、exit code | 不显示模型字段 |

设计原则：

- 能拿到什么展示什么。
- 不同 provider 的不完整能力不能阻塞底部栏上线。
- `unknown` 是合法状态，不应当隐藏整段 telemetry。

## 7. Monitoring Drawer 设计

底部栏只展示摘要。详细内容通过 `Monitoring Drawer` 承载。

### 7.1 打开方式

- 点击底部栏中间 telemetry 区域。
- 点击右侧 monitoring 图标。
- 快捷键打开，例如 `Ctrl+Shift+M`，具体以项目快捷键体系为准。

### 7.2 尺寸

```text
Collapsed Status Bar: 28-34px
Expanded Monitoring Drawer: 140-240px
Resizable Advanced Mode: 240-420px
```

Drawer 不应默认长期占用大面积。它是观察面板，不是主工作区。

### 7.3 内容结构

默认表格：

| Workspace | Terminal | Provider | Model | Context | Tokens | Cost | State | Updated |
|---|---|---|---|---|---|---|---|---|
| JanusX | Claude | claude | Sonnet 4 | 68% | 14.5k | $0.42 | running | 10s ago |
| API | Codex | codex | GPT-5 | 31% | 7.1k | unknown | approval | 2m ago |

可选视图：

- `Terminals`: 终端级监控。
- `Agents`: AgentRun / SubAgent 状态。
- `Usage`: token、费用、上下文趋势。
- `Events`: 最近 hook 和运行事件。

不要在第一阶段做复杂图表。先做可靠表格和摘要。

## 8. 与分屏设计的兼容

未来实现 JetBrains 风格分屏后，底部栏不能跟随 pane 数量无限扩张。

推荐规则：

- 每个 pane header 或 tab 上只显示极简局部状态。
- 底部栏显示当前 active pane 的详细摘要。
- 其他可见 pane 通过 chips 展示。
- Drawer 展示所有可见 pane 的完整 telemetry。

Pane header 示例：

```text
[JanusX / Claude] ctx 68% · running
[API / Dev] idle
```

底部栏示例：

```text
JanusX · 3 panes | Active: Claude · Sonnet 4 · ctx 68% · running | [Codex 31%] [Dev idle]
```

这样用户可以同时获得：

- 局部状态：看 pane header。
- 当前焦点：看底部中间。
- 全局细节：打开 Drawer。

## 9. 与跨工作区组合的兼容

跨工作区组合模式下，底部栏要明确区分 `Primary Workspace` 和 `Composed Workspaces`。

示例：

```text
Composed: JanusX + API Server | Primary: JanusX | Claude ctx 68% · API Dev running · 1 approval
```

规则：

- Scope 区域显示 `Composed`。
- Primary workspace 明确可见。
- 每个 terminal chip 必须能显示 workspace 来源。
- 点击 workspace chip 可以切换 Primary，但不退出 composition。
- `Open Workspace Alone` 是显式动作，不由底部栏隐式触发。

跨工作区时不能混淆的内容：

- Analyzer 写回归属。
- Checkpoint restore 目标。
- Git 操作目标。
- 文件编辑目标。

底部栏只做观测和导航，不做隐式 destructive 操作。

## 10. 与顶部 Island 的分工

底部栏和 Island 必须避免职责重叠。

| 能力 | 顶部 Island | 底部 Runtime Status Bar |
|---|---|---|
| 当前任务目标 | 主责 | 不展示或仅显示 scope |
| Agent / SubAgent 拓扑 | 主责 | 只显示数量和高优先级状态 |
| 审批提醒 | 主责 | 右侧提醒入口 |
| 模型名称 | 可在详情里显示 | 主责 |
| 上下文消耗 | 不负责 | 主责 |
| token / cost | 不负责 | 主责 |
| 终端运行态 | 辅助跳转 | 主责 |
| 跨工作区运行摘要 | Global Island 可显示 Agent | 主责显示 telemetry |

建议边界：

```text
用户想知道“Agent 在做什么” -> Island
用户想知道“模型和上下文消耗多少” -> Runtime Status Bar
用户想看“所有终端的详细运行指标” -> Monitoring Drawer
用户想操作终端输入输出 -> Workspace Pane
```

## 11. 状态优先级与视觉规则

状态优先级：

| Priority | State | UI 表达 |
|---|---|---|
| 1 | waiting-approval | amber，必须有文字，不只靠颜色 |
| 2 | failed | red，显示失败来源 |
| 3 | context-high | amber/red，显示 ctx 百分比 |
| 4 | running | blue/cyan，显示 provider |
| 5 | idle/done | neutral/green，低视觉权重 |
| 6 | unknown | muted，明确写 unknown |

上下文阈值建议：

```ts
contextUsedRatio < 0.60 => normal
0.60 <= contextUsedRatio < 0.80 => watch
0.80 <= contextUsedRatio < 0.92 => high
contextUsedRatio >= 0.92 => critical
```

视觉规则：

- 底部栏高度稳定，内容变化不能导致布局跳动。
- 状态 chip 使用固定高度和最大宽度，长文本截断并提供 tooltip。
- 不使用大面积鲜艳背景，只在状态点、细边框、文字上表达优先级。
- 所有可点击元素需要 hover、focus 和 tooltip。
- 颜色不能是唯一状态表达，必须配合文字或图标。

## 12. Slot 化设计

底部栏不要写死为 telemetry 专用组件。建议抽象为 slot 系统。

```ts
type StatusBarSlot =
  | 'scope'
  | 'activeRuntime'
  | 'visibleRuntimes'
  | 'agentActivity'
  | 'approval'
  | 'cost'
  | 'git'
  | 'sync'
  | 'diagnostics'
  | 'system'

interface StatusBarContribution {
  slot: StatusBarSlot
  priority: number
  minWidth?: number
  maxWidth?: number
  render: () => React.ReactNode
  onClick?: () => void
}
```

布局策略：

- `scope` 固定在左侧。
- `activeRuntime` 占据中间主区域。
- `visibleRuntimes` 在空间不足时折叠为 `+N`。
- `approval`、`failed` 等高优先级状态固定保留。
- 低优先级 slot 在小窗口下隐藏到 overflow menu。

这样未来可以扩展 Git、索引、同步、日志诊断，不需要重写底部栏。

## 13. 数据流建议

推荐数据流：

```text
PTY / Hook / History Parser / Provider Adapter
  -> RuntimeTelemetryStore
  -> StatusBar Selector
  -> Runtime Status Bar
  -> Monitoring Drawer
```

### 13.1 RuntimeTelemetryStore

职责：

- 收集终端级 telemetry。
- 维护 provider 能力。
- 处理 stale 数据。
- 根据 workspace、pane、composition 聚合视图。

建议接口：

```ts
interface RuntimeTelemetryStore {
  byTerminalId: Record<string, TerminalTelemetry>
  providerCapabilities: Record<TerminalProvider, ProviderTelemetryCapabilities>
  staleAfterMs: number
  updateTelemetry(input: Partial<TerminalTelemetry> & { terminalId: string }): void
  markTerminalClosed(terminalId: string): void
  selectScopeTelemetry(scope: TelemetryScope): ScopeTelemetrySummary
}
```

### 13.2 stale 状态

如果某终端超过一定时间未更新，不应继续显示为实时。

建议：

```ts
updatedAt 超过 30s：显示 stale hint
updatedAt 超过 5min：降级为 unknown 或 idle
terminal closed：保留短时间历史，然后移除
```

## 14. 交互流程

### 14.1 单终端

```text
用户打开 Claude 终端
-> RuntimeTelemetryStore 接收 provider/state/model/context
-> 底部栏显示 Claude 当前摘要
-> 点击底部栏打开 Drawer
-> Drawer 显示该终端完整使用情况
```

### 14.2 多分屏

```text
用户 split 出 Claude + Codex + Dev
-> active pane 为 Claude
-> 底部栏主区域显示 Claude
-> Codex / Dev 变成右侧 chips
-> 点击 Codex chip 聚焦 Codex pane
-> 底部栏主区域切换为 Codex telemetry
```

### 14.3 跨工作区组合

```text
用户从左侧拖 API Server 终端到 JanusX 中部
-> 进入 Workspace Composition Mode
-> 底部栏 Scope 显示 Composed: JanusX + API Server
-> 主区域显示 active pane telemetry
-> chip 显示各 workspace 的终端状态
-> Drawer 展示所有 composed workspaces 的 telemetry 表格
```

### 14.4 Pin 监控对象

```text
用户右键 Claude telemetry chip
-> 选择 Pin to Status Bar
-> 底部栏 Scope 显示 Pinned: Claude / JanusX
-> 即使焦点切到 Codex，底部栏仍显示 Claude
-> 用户点击 Unpin 恢复 active scope
```

## 15. 实施阶段

### Phase 1：底部栏结构升级

目标：

- 将现有底部栏改造成 `Runtime Status Bar` 容器。
- 建立左中右区域。
- 接入静态 mock 数据。
- 支持打开和关闭 Monitoring Drawer。

不做：

- 不解析真实 token。
- 不做复杂 provider adapter。
- 不做跨工作区聚合。

### Phase 2：TerminalTelemetry 基础接入

目标：

- 接入终端 session、workspaceId、provider、state。
- 支持 Claude / Codex / OpenCode / Shell 的基础显示。
- unknown 状态可正确展示。
- active pane 切换时底部栏跟随更新。

### Phase 3：Claude / Codex 上下文与 token

目标：

- 从 hook、history、jsonl 或 provider adapter 提取模型、token、context。
- 增加 context 阈值提醒。
- Drawer 展示终端级 telemetry 表格。

### Phase 4：多分屏适配

目标：

- 实现 `visible-panes` scope。
- active pane 显示详情，其他 pane 显示 chips。
- chip 支持 focus pane。
- pane header 显示极简局部状态。

### Phase 5：跨工作区组合适配

目标：

- 实现 `workspace-composition` scope。
- 底部栏显示 Primary Workspace 和 composed workspaces。
- Drawer 按 workspace 分组展示 telemetry。
- 所有 terminal chip 显示 workspace 来源。

### Phase 6：Slot 化与扩展

目标：

- 将底部栏改造成可插拔 slot 系统。
- 增加 Git、sync、diagnostics 等后续 slot 的接入边界。
- 支持用户配置显示项和 pin 项。

## 16. 验收标准

第一阶段可验收标准：

- 底部栏在单终端、多终端、无终端状态下都有稳定显示。
- 不侵入 xterm，不影响 Claude/Codex/OpenCode 的终端输入和 TUI。
- 窗口宽度变化时内容可折叠，不出现文本重叠。
- 点击底部栏可打开 Monitoring Drawer。
- unknown 数据有明确表达，不出现空白或误导性数值。

完整阶段可验收标准：

- Claude、Codex、OpenCode 三类终端都能显示基础 provider/state。
- Claude / Codex 能显示模型和上下文消耗。
- 多分屏时底部栏能正确区分 active pane 和 visible panes。
- 跨工作区组合时底部栏能显示 composition scope 和 workspace 来源。
- waiting-approval、failed、context-high 能按优先级显示。
- Island 和底部栏职责不重叠，用户能明确知道哪里看任务，哪里看消耗。

## 17. 最终判断

复用现有底部栏是更合理的方向。它可以把 JanusX 当前尚未充分利用的底部空间升级成稳定的运行遥测层，同时不破坏未来的终端分屏、跨工作区组合和 SubAgent 可视化。

关键不是“在底部放更多信息”，而是建立清晰边界：

```text
底部栏默认轻量摘要
Drawer 承载详细监控
Pane header 承载局部状态
Island 承载任务和 Agent 态势
```

这样 JanusX 可以逐步获得 CLI-Manager 类似的终端运行感知能力，但不会复制它的 UI 形态，也不会被某一个 CLI 的 TUI 行为绑定。
