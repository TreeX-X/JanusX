# BridgeMind 产品调研与 JanusX Agent Runtime 借鉴方案

> 文档状态：调研与方向方案稿
>
> 调研日期：2026-07-19
>
> 事实截止：2026-07-19
>
> 参考版本：BridgeSpace v3.4.15（官方更新日志标注 2026-07-17）
>
> 适用对象：JanusX 产品设计、WorkflowX、Agent Runtime、终端与知识系统的后续设计和实现 Agent
>
> 借鉴边界：仅学习公开产品机制与工程思想，不复制 BridgeMind 源码、视觉资产、样式或商业实现

## 1. 文档目的

本文记录对 Vibe Coding / Agentic Coding 产品 BridgeMind 的公开资料调研，并将其核心能力映射到 JanusX 当前产品与工程基础，形成后续 Agent 可直接消费的方向性技术方案。

本文回答四个问题：

1. BridgeMind 的核心产品和工作闭环是什么。
2. BridgeSpace 的真正产品优势是什么，而不只是表面的多终端布局。
3. 哪些机制适合 JanusX 借鉴，哪些不适合照搬。
4. JanusX 应以什么优先级把现有能力组织成 Agent Runtime。

本文不是实现 PRD，也不代表其中所有建议已经立项。涉及具体代码、数据结构、IPC 和验收标准时，后续仍需建立对应 Hybrid Tree。

## 2. 事实口径与限制

### 2.1 资料来源

本次调研主要依据 BridgeMind 官方产品页、BridgeMCP 文档、路线图、更新日志、公开项目说明和官方 LLM 索引。文末列出完整官方链接。

### 2.2 事实分级

本文使用以下标记：

- **官方确认**：BridgeMind 官方页面或官方文档明确描述的能力。
- **分析判断**：基于多个官方能力之间关系形成的产品或架构判断。
- **JanusX 建议**：结合 JanusX 当前工程基础提出的方向，不代表 BridgeMind 的实现方式。
- **待确认**：需要真实产品操作、源码、性能数据或 JanusX 新需求确认才能下结论。

### 2.3 调研限制

- BridgeSpace 核心商业产品未发现公开源码，本次不能形成源码级结论。
- 官网宣称的终端上限、Skill 数量、集成数量等属于官方产品规格或营销信息，不代表本次已独立压测。
- BridgeMind 公开的 Skills、Plugins、Agents 和 benchmark 项目不能等同于 BridgeSpace 核心源码。
- 本文不推断 BridgeMind 未公开的数据结构、同步协议、权限实现或商业后端架构。

## 3. 一句话结论

BridgeMind 表面上是多终端 Vibe Coding 工具，真正的核心是：

> 将任务、Agent、终端、知识、审查和生产反馈组织成一条可以被观察、控制、恢复和持续改进的软件工程闭环。

JanusX 最值得学习的不是“最多同时打开 16 个终端”，而是以下五项机制：

1. 任务成为人类与 Agent 共享的运行时对象。
2. 角色、文件所有权、依赖排序和 Reviewer Gate 约束多 Agent 并行。
3. Agent 发现沉淀为可继承、可审计的任务知识。
4. 终端恢复提升为 Agent 执行身份恢复。
5. 后台 Workspace 和高输出终端具有明确的资源治理策略。

## 4. BridgeMind 产品矩阵

| 产品 | 官方定位 | 核心能力 | 对整体闭环的作用 |
| --- | --- | --- | --- |
| BridgeSpace | 桌面 Agent Development Environment | 多 Agent 终端网格、文件树、编辑器、浏览器、Diff、项目 Workspace | 统一工作台与执行容器 |
| BridgeBoard | BridgeSpace 内置任务看板 | 任务状态、Agent Dispatch、Task Knowledge、人类审核 | 人与 Agent 的任务事实源 |
| BridgeSwarm | 多 Agent 编排系统 | Coordinator、Builder、Scout、Reviewer、Mission Tree、文件所有权、依赖排序 | 组织并行执行 |
| BridgeMemory | 仓库相邻的项目知识系统 | Plain Markdown、链接、反向链接、MCP 共享、Git 可版本化 | 跨 Agent 继承知识 |
| BridgeMCP | 跨 IDE/CLI 协作接口 | Projects、Tasks、Agents 等工具 | 让不同客户端共享控制面 |
| BridgeVoice | 系统级语音输入 | Push-to-talk、本地或云端转写、跨应用输入 | 降低输入摩擦 |
| BridgeAgent | 自治 Mission Runner（Beta） | 规划、编码、测试、PR、生产监控、修复反馈、Playbook 更新 | 将闭环延伸到生产环境 |
| BridgeBench | Agent 编码 Benchmark | 速度、成本、代码质量、可恢复运行、公开方法 | 评估模型和工作流质量 |

### 4.1 产品边界判断

**分析判断**：BridgeMind 不是一款单一编辑器，而是一套以 BridgeSpace 为桌面执行面、BridgeBoard/BridgeSwarm 为控制面、BridgeMemory/MCP 为知识与互操作层、BridgeAgent 为自治延伸的 Agent 工程平台。

它的竞争优势不是单项编辑器能力最强，而是把原本散落在终端、任务系统、聊天记录、知识库和监控平台中的信息连成一个闭环。

## 5. BridgeMind 核心工作闭环

```text
Mission / 产品目标
        ↓
BridgeBoard 拆分为可执行任务
        ↓
BridgeSwarm 分配角色、依赖和文件所有权
        ↓
多个终端 Agent 并行工作
        ↓
Task Knowledge + BridgeMemory 沉淀发现
        ↓
Reviewer Gate / In Review
        ↓
Diff、编辑器、浏览器和测试进行人工验收
        ↓
Complete / Ship
        ↓
BridgeAgent 读取生产监控反馈
        ↓
创建修复工作并更新 Memory / Playbook
```

这条链路揭示了 BridgeMind 的关键设计原则：

- Prompt 不是最高层对象，Mission 和 Task 才是。
- Terminal 不是独立工具，而是 Agent 的执行表面。
- Chat 不应成为唯一知识载体，任务知识需要结构化沉淀。
- 多 Agent 不是无约束并行，需要角色、文件范围、依赖和审核门禁。
- “代码写完”不是终点，还要经过 Review、Ship 和生产反馈。

## 6. BridgeSpace 核心能力

### 6.1 多 Agent 终端工作区

**官方确认**：

- BridgeSpace 基于 Tauri 2 与 Rust，支持 macOS、Windows 和 Linux。
- 单个网格最多容纳 16 个 Agent Terminal。
- 终端可以任意方向 Split 和 Resize。
- Workspace 按项目保存终端网格和 Agent。
- 内置文件树、编辑器、localhost 浏览器和 Diff/Review。
- 支持 Claude Code、Codex、Gemini CLI、OpenCode、Cursor 等工具。
- 支持键盘优先操作。

**分析判断**：其价值不在 16 这个数量，而在 Workspace、Pane、Agent、账号和任务之间形成稳定关系，使终端从一次性 Shell 变成可恢复的执行位置。

### 6.2 BridgeBoard：任务即人机协作协议

**官方确认**：BridgeBoard 的基本状态流为：

```text
todo
  → in-progress（Agent claim）
  → in-review（Agent 提交并停止工作）
  → complete（Human approve）
```

审核不通过时，人类修改 Instructions 并将任务重新放回 `todo`。Agent 在执行过程中可以持续附加 Task Knowledge，例如文件路径、错误堆栈、根因和调研发现。

**分析判断**：BridgeBoard 的核心不是 Kanban 视觉形式，而是建立明确协议：Agent 负责领取、执行、提交证据；人类负责最终验收。任务状态因此成为 UI、Agent 和审查流程共享的事实源。

### 6.3 BridgeSwarm：结构化并行而非 Agent 聊天室

**官方确认**：典型角色包括：

- Coordinator：协调和拆解。
- Builder：实现任务。
- Scout：调研代码库和技术路径。
- Reviewer：独立审查。

主要机制包括 Mission Tree、单一 Command Bar、`@` 指定 Agent、文件所有权、共享依赖排序以及每次合并前的 Reviewer Gate。

**分析判断**：BridgeSwarm 最重要的产品思想是“roles, not chatter”。并发质量来自职责边界和调度约束，而不是 Agent 数量。

### 6.4 BridgeMemory：仓库原生知识

**官方确认**：BridgeMemory 位于仓库旁的 `.bridgememory/`，使用 Plain Markdown，可提交到 Git，并通过 MCP 被不同 Agent 共享读取和写入；知识可以形成链接、反向链接和建议关联。

**分析判断**：其优势是知识可读、可 Diff、可审计、可版本控制。风险是并非所有记忆都适合进入仓库，因此 JanusX 只能借鉴其可审计性，不能把用户隐私和运行日志统一提交。

### 6.5 BridgeMCP：跨客户端控制面

**官方确认**：BridgeMCP 为 Cursor、Claude Code、Windsurf、Codex 等提供统一项目、任务和 Agent 数据。官方文档列出的工具包括：

| 类别 | 工具 |
| --- | --- |
| Projects | `list_projects`、`create_project` |
| Tasks | `list_tasks`、`get_task`、`create_task`、`update_task` |
| Agents | `list_agents`、`get_agent`、`create_agent`、`update_agent` |

Agent 可以具有名称和自定义 System Prompt。

**分析判断**：BridgeMCP 让 BridgeMind 成为跨 IDE/CLI 的协作控制面，而不是把任务和知识锁在 BridgeSpace UI 中。

### 6.6 Skills 与 Pane 的显式绑定

**官方确认**：BridgeSpace 可以把 Skill 拖到 Agent Pane，使 Agent 获得安全审查、SEO、Commit/Push 等能力。

**分析判断**：值得学习的不是拖拽动作，而是将以下关系显式化：

```text
Pane
  ├─ Agent
  ├─ Task
  ├─ Skill
  ├─ Permission Scope
  └─ File Scope
```

Skill 的启用应成为可追踪 Invocation，而不是把一段 SKILL.md 文本无记录地塞入 Prompt。

### 6.7 BridgeVoice

**官方确认**：BridgeVoice 支持系统级 Push-to-talk 和 Hands-free Dictation，可将文本写入当前光标所在应用；支持本地 whisper.cpp、NVIDIA Parakeet 或云端 Groq Whisper，并覆盖多语言与三大桌面平台。

**分析判断**：它解决的是高频输入摩擦，不是 BridgeMind 工程闭环的核心。对 JanusX 属于增强项，而非当前优先能力。

### 6.8 BridgeAgent 与生产反馈

**官方确认**：BridgeAgent Beta 被描述为自治 Mission Runner，可分析代码库、规划任务、编写代码与测试、创建 PR，并在合并后结合 Sentry、PostHog 等生产系统调查异常和创建修复 PR，同时更新自身 Playbook。

**分析判断**：生产反馈闭环很有价值，但自动修改、自动 PR、自动 Merge 和自我更新同时引入权限、误判、行为漂移和供应链风险。JanusX 不应在基础任务协议尚未稳定时直接追求全自治。

## 7. BridgeSpace 工程稳定性信号

BridgeSpace 更新日志反映出，多 Agent 桌面产品的难点并不止 UI 布局。

### 7.1 Agent 身份恢复

**官方确认**：会话恢复会关联 Workspace、Pane Identity 和 Account Profile，并支持多账号 Claude/Codex 的 Profile-aware Resume。

**JanusX 启示**：恢复对象不能只有 `terminalId`，还应包含 Agent Profile、任务、启动配置、外部 Session、Transcript 和可恢复原因。

### 7.2 冷启动预算与熔断

**官方确认**：BridgeSpace 对终端恢复设置预算和 Circuit Breaker，不在冷启动时无限重建全部 PTY；失败恢复保留可恢复性信息。

**JanusX 启示**：项目越多，越不能把“恢复全部终端”当成无成本动作。恢复必须有优先级、资源上限和失败解释。

### 7.3 PTY 到 Renderer 的背压

**官方确认**：更新日志提到 Bounded PTY Chunks、xterm 单一 Write In-flight、Backpressure、Stalled Callback Watchdog 和后台 Workspace Hibernation。

**JanusX 启示**：多终端高输出时，应将 PTY、IPC、Renderer、xterm 写入视为一条有界数据管线，而不是无限制转发字符串。

### 7.4 结构化 Agent 状态

**官方确认**：BridgeSpace 不再只依赖终端文本推断 Agent 状态，而是使用结构化 Hooks/Events。

**JanusX 启示**：ANSI 文本适合展示，不适合作为运行状态数据库。任务看板、通知和调度必须消费结构化事件。

### 7.5 Pre-ship Read-only Review

**官方确认**：BridgeSpace 可将 Staged、Unstaged 和 Untracked Changes 交给只读 Agent 进行发布前审查。

**JanusX 启示**：这一机制与 evaluatorX、Git Panel 和 Checkpoint 高度契合，适合作为较低成本的近期增强。

## 8. JanusX 当前工程基线

以下基线来自当前项目已有能力和此前已确认的产品边界：

- Electron + React + Zustand 桌面架构。
- 中央 Workspace 已有任意 Terminal Pane Tree。
- 每个 Workspace 已有 Terminal Snapshot。
- 中央内容支持 Terminal、Janus Chat 和 Blueprint。
- WorkflowX 已定义 coderX、evaluatorX、promptMasterX、abstracterX 等角色。
- 已有 Git Panel、Checkpoint、Knowledge/Assist、Office Preview、Agent Notification、飞书远程控制和 Runtime Telemetry。
- 左侧工作区暂不进入本轮重构范围。
- 右侧正在形成固定工具轨、可变工具面板和多工具 Singleton Tabs。
- Office 是中央与右侧 Dock 之间的临时 Workspace，不属于右侧工具 Registry。
- JanusX 学习外部产品机制，但保持自身视觉风格与 Clean-room 实现边界。

## 9. BridgeMind 与 JanusX 能力对照

| BridgeMind 能力 | JanusX 已有基础 | 主要缺口或下一步 |
| --- | --- | --- |
| Terminal Grid | Workspace Pane Tree、终端分屏 | Agent 身份、任务与 Pane 绑定仍需强化 |
| Workspace Persistence | Terminal Snapshot | 从终端恢复提升到 Agent Session 恢复 |
| BridgeBoard | Hybrid Docs、AC、调度流程 | 缺少持续可见的 Runtime Task Object |
| BridgeSwarm | WorkflowX 角色体系 | 文件所有权、依赖、Ready Queue 和运行状态可视化 |
| Mission Tree | Blueprint、Hybrid Tree | 尚未成为实时执行控制面 |
| BridgeMemory | Knowledge/Assist | 需要区分仓库知识、私人知识、运行观察 |
| Reviewer Gate | evaluatorX | 需要接入任务状态、Git Diff 和完成门禁 |
| Diff Review | Git Panel、Checkpoint | 可增加统一 Pre-ship Read-only Review |
| Structured Events | 通知、遥测、终端状态基础 | 需要统一 Agent Runtime Event Schema |
| Skill-to-Pane | Skills + Pane | 需要正式 Invocation、Scope 和审计记录 |
| Voice | Janus Chat/终端输入 | 可先做输入框级转写，暂不做系统级注入 |
| Production Loop | 遥测和远程控制基础 | 宜先做“检测→待审任务”，不直接自动修复 |

## 10. JanusX 借鉴建议

### 10.1 P0：建立 Agent Runtime 基础

#### P0-1：Task Runtime Board

将 WorkflowX 任务从文档中的静态描述提升为运行时对象。建议状态：

```text
Planned → Ready → Running → Review → Done
                    ↘ Blocked ↗
```

任务至少应关联：

- Objective 与 Acceptance Criteria。
- Execution Brief。
- Scope 与 Forbidden Files。
- Required Skills 与 Stop Conditions。
- 当前 Agent、Pane 和 Workspace。
- 文件所有权与依赖任务。
- Verification Evidence。
- Blocked Reason 与 Review Result。

Board 不一定采用传统 Kanban 外观；关键是任务在执行中持续可见，并成为 UI、Agent、调度器和审查器共享的事实源。

#### P0-2：统一结构化 Agent Events

建议建立可演进的事件域，例如：

```text
AgentStarted
AgentClaimedTask
AgentWaitingForInput
AgentRequestedPermission
AgentOpenedFile
AgentModifiedFile
AgentVerificationStarted
AgentVerificationPassed
AgentVerificationFailed
AgentSubmittedForReview
AgentCompleted
AgentFailed
AgentInterrupted
```

这些事件可以统一驱动 Board、Blueprint、Pane 标记、右侧任务详情、通知和 Runtime Telemetry。终端文本继续用于展示，但不再是唯一状态来源。

#### P0-3：Role + File Ownership + Reviewer Gate

优先增强现有 WorkflowX 角色，而不是继续增加角色数量：

- 每个任务只有明确 Owner。
- 每个可写文件具有 Writer Ownership。
- 共享文件需要排队或显式冲突处理。
- 依赖未满足的任务不进入 Ready。
- coderX 不批准自己的实现。
- evaluatorX 默认只读审查。
- Review 通过后任务才进入 Done。

#### P0-4：Task Knowledge

每个任务保存结构化工程知识，而不是完整聊天镜像：

```text
Files Read
Files Changed
Root Cause
Key Decisions
Risks
Failed Attempts
Verification Evidence
Follow-up Work
```

任务结束时，可将确认后的知识写入 Hybrid Child、Knowledge Engine 或后续任务 Context Manifest。

#### P0-5：Recoverable Agent Identity

建议将 Terminal Snapshot 演进为 Agent Session Snapshot，概念上包含：

```text
Workspace / Pane / Terminal Identity
Agent Type / Agent Profile / Account Profile
Task / Role / Owned Files
Launch Command / CWD / Environment Profile
Transcript / External Session ID
Last Known Runtime State
Recoverability / Recoverability Reason
```

恢复失败必须解释受影响任务、已保存结果、能否重新启动以及重启是否可能重复执行。

#### P0-6：多终端资源治理

建议建立 Workspace 生命周期：

```text
Visible → Background Active → Hibernating → Suspended
                                      ↘ Recovered / Disposed
```

逐步覆盖 PTY 有界分块、Renderer 背压、xterm Watchdog、后台休眠、冷启动恢复预算、Circuit Breaker 和完成 Agent 回收。

### 10.2 P1：在 Runtime 基础上形成控制面

#### P1-1：Blueprint Mission Tree

不另造一套 Swarm 页面，而是让 Blueprint 复用 Hybrid Tree，显示 Coordinator、Worker、Evaluator、依赖、状态、文件所有权、阻塞原因和验证结果。

#### P1-2：统一指挥栏

在 Janus Chat 或 Island 中支持显式目标，例如：

```text
@coderX 修复当前任务
@evaluatorX 审查当前 Diff
@pane:3 汇报测试失败
@all 停止并汇报状态
```

发送前必须展示目标 Agent 数量、是否修改文件、是否启动进程以及是否需要确认，避免普通聊天被意外广播。

#### P1-3：Skill Invocation

将 Skill 与 Agent Session、Task、Pane、Scope、Permission 和执行状态绑定。重点是可见、可追踪和可审计，不强制采用拖拽交互。

#### P1-4：三层 Memory

| Memory 类型 | 典型内容 | 默认是否进入仓库 |
| --- | --- | --- |
| Project Memory | 架构决策、模块约定、长期有效知识 | 可选 |
| User Private Memory | 用户偏好、账号和个人习惯 | 否 |
| Runtime Observation | 日志、临时调研、失败和遥测 | 否 |

项目知识可附加来源任务、来源 Agent、适用范围、最后验证时间、可信度和过期状态。

#### P1-5：Git Pre-ship Review

在 Git Panel 增加 `Review Current Changes`，由 evaluatorX 只读审查 Staged、Unstaged、Untracked、Checkpoint Diff、Affected AC 和相关 Hybrid Docs，输出阻断问题、风险、测试缺口和 Fix Instructions，不直接修改代码。

### 10.3 P2：谨慎验证后再投入

#### P2-1：Voice

先实现“按住说话→转写→填入 Janus 输入框→用户确认→发送”。暂不建设系统级输入注入、多个本地模型管理或自动发送语音指令。

#### P2-2：拖动任务直接 Dispatch

拖到 Running 可以进入 Dispatch Preview，但不能跳过 Execution Brief、Scope、Forbidden Files、Required Skills、Stop Conditions、冲突检查和必要的人类确认。

#### P2-3：并发 Agent 数量

JanusX 不以 16 Agent 为目标。近期应优先把 3～6 个高质量并发 Agent 的状态、依赖、冲突、资源和审查管理好。

#### P2-4：生产自动修复

近期建议采用：

```text
监控检测异常
  → 创建待审核调查任务
  → Agent 诊断并提交证据
  → 人类批准
  → coderX 修复
  → evaluatorX 审查
  → 人类决定提交或发布
```

不默认自动修改、Merge、部署或改变 Agent 的长期规则。

## 11. 明确非目标

除非后续产品决策变化，本调研不自动推动以下事项：

- 不修改 JanusX 左侧工作区和会话管理。
- 不复制 BridgeSpace 的 UI、颜色、图标、布局尺寸或代码结构。
- 不把右侧工具做成 16 Agent 终端矩阵。
- 不把 Office 注册为右侧工具或持久化其 Runtime Lease/Port。
- 不以终端文本解析作为 Agent 状态的长期主方案。
- 不保存完整聊天记录作为唯一 Task Knowledge。
- 不将所有 Memory 提交到仓库。
- 不因拖动任务卡而绕过 WorkflowX Dispatch Contract。
- 不默认广播指令给所有 Agent。
- 不在当前阶段自动 Merge、自动部署或自动修复生产环境。
- 不为了对齐 BridgeMind 而将 Electron 迁移到 Tauri。
- 不围绕 SaaS Credits、统一订阅或账号锁重构 JanusX；保持 Local-first 和 Provider-neutral。

## 12. 分阶段路线

### Phase 1：Task Runtime 与结构化事件

- 定义 Runtime Task Model。
- 建立结构化 Agent Event Schema。
- 绑定 Task、Agent Session、Pane 和 Workspace。
- 提供轻量任务状态视图与 Blocked Reason。
- 建立 Task Knowledge 与 Review Result。

**完成判据**：无需解析 ANSI 文本，即可判断任务由谁执行、处于何种状态、是否阻塞以及是否进入审核。

### Phase 2：WorkflowX 并行控制

- Blueprint 展示 Mission Tree。
- 增加文件所有权和依赖图。
- 建立 Ready Queue 和冲突检测。
- coderX → evaluatorX Reviewer Gate。
- 将验证证据挂接到任务。

**完成判据**：多个 Agent 不能无约束写同一文件，依赖任务不会被提前启动，任务不能绕过 Review 直接完成。

### Phase 3：恢复和资源治理

- Agent Session Snapshot。
- Profile-aware Resume。
- Workspace Hibernation。
- 冷启动恢复预算和 Circuit Breaker。
- PTY/IPC/Renderer 背压。
- 完成 Agent 回收和失败解释。

**完成判据**：多 Workspace 重启不会无上限拉起全部 PTY；恢复失败可定位到具体 Agent 和任务。

### Phase 4：操作效率与审查

- Skill-to-Task / Skill-to-Pane Invocation。
- `@agent` 指挥栏。
- Git Pre-ship Read-only Review。
- 任务详情展示 Verification Evidence。
- 通知与 Blocked/Review 状态联动。

### Phase 5：输入和生产反馈

- Janus 输入框语音转写。
- Sentry/PostHog 等只读集成。
- 异常自动创建待审任务。
- 人工批准后的调查、修复和审查流程。
- Project Playbook 更新建议。

## 13. 风险与决策原则

| 风险 | 影响 | 原则或缓解 |
| --- | --- | --- |
| 把 BridgeMind 营销规格当成实现事实 | 错误架构推断 | 官方事实、分析建议和待确认项分开记录 |
| 为多 Agent 数量牺牲可控性 | 冲突、成本和恢复复杂度上升 | 优先优化 3～6 Agent 的质量 |
| Board 成为第二套文档系统 | 状态漂移 | Runtime Task 引用 Hybrid AC，不复制需求正文 |
| 通过 ANSI 文本猜状态 | 状态误判和脆弱适配 | 使用结构化 Hooks/Events，文本只展示 |
| 文件所有权过度刚性 | 合理协作被阻塞 | 支持共享文件显式排队和升级确认 |
| Memory 混合隐私与项目事实 | 隐私泄露和仓库污染 | Project/User/Runtime 三层隔离 |
| 恢复全部 Agent 造成启动风暴 | CPU、内存、PTY 和网络拥塞 | 恢复预算、优先级、休眠和 Circuit Breaker |
| 全自治生产修复误操作 | 生产事故 | 默认检测与建任务，保留人类批准和 Reviewer Gate |
| Skill 隐式注入不可审计 | 权限和行为来源不清 | 正式 Invocation、Scope、Permission 和日志 |
| 新控制面与现有 Office/Right Dock 冲突 | 生命周期回归 | 保留 Office 临时中间 Workspace 边界 |

统一决策原则：

1. **状态优先于界面**：先定义任务、事件、身份和所有权，再设计 Board 或 Mission Tree。
2. **结构优先于并发数量**：先解决依赖、冲突和审查，再扩大并发。
3. **证据优先于自我声明**：完成状态必须携带验证结果和 Review 结论。
4. **恢复优先于重启**：Agent Session 必须说明是否可恢复以及恢复代价。
5. **Local-first 与 Provider-neutral**：不把 JanusX 绑定到单一 Agent CLI 或云账号。
6. **Clean-room 借鉴**：只学习公开机制，自行设计数据模型、交互和实现。

## 14. 后续 Agent 交接上下文

### 14.1 建议的后续工作流

当用户决定实施任一 Phase 时，应使用 WorkflowX Local/Whole Workflow 创建新的 Hybrid Tree，不应直接把本文当作代码级 AC。

### 14.2 优先阅读

后续规划 Agent 应至少检查：

- 本文档。
- `.codex/skills/orchestrateX/SKILL.md` 及相关 Dispatch Contract。
- `src/renderer/src/lib/workspace-pane.ts`。
- `src/renderer/src/stores/workspace.ts`。
- 当前 Agent/Terminal 生命周期和 Runtime Telemetry 代码。
- Blueprint、Git、Checkpoint、Knowledge/Assist 相关实现。
- 当前 Right Dock 与 Office Workspace 的 Hybrid 文档和代码边界。

### 14.3 第一个推荐实施主题

推荐首先单独立项 `Agent Task Runtime v1`，范围只包括：

- Runtime Task Model。
- Structured Agent Events。
- Task ↔ Agent Session ↔ Pane 绑定。
- Task Knowledge 基础字段。
- Review/Blocked 状态。
- 最小可见状态视图。

首期不包含 Voice、生产监控、自动修复、完整 Memory Graph 或 16 Agent 扩容。

### 14.4 需要产品确认的问题

在生成实现 PRD 前仍需确认：

1. Runtime Task Board 的首个入口放在 Blueprint、右侧工具还是独立 Workspace。
2. Hybrid Child 与 Runtime Task 是一对一还是允许一个 Child 拆成多个 Runtime Task。
3. 文件所有权是强制锁、软警告还是按风险分级。
4. Task Knowledge 哪些字段自动采集，哪些必须由 Agent 显式提交。
5. Agent Session 恢复是否允许自动重新执行命令。
6. evaluatorX Review 是否作为所有代码任务的强制门禁。
7. 哪些 Runtime 数据允许持久化，保留多久，是否进入项目仓库。

## 15. 最终建议

BridgeMind 最值得 JanusX 学习的是协作控制面，而不是界面样式。

JanusX 已经拥有终端分屏、WorkflowX、Blueprint、Knowledge、Git、Checkpoint、通知和遥测等基础。当前最有价值的方向不是继续堆叠孤立功能，而是用运行时协议把它们连接起来：

```text
任务定义
  → Agent Dispatch
  → 角色与文件范围
  → 结构化状态
  → 任务知识
  → 独立审查
  → 人工验收
  → 可恢复执行
```

建议将 JanusX 的差异化定位收敛为：

> 一个能够看见、控制、恢复和审查 Agent 软件工程过程的本地工作台，而不只是同时打开更多 AI 终端的桌面容器。

## 16. 官方资料

- [BridgeMind 官方 LLM 索引](https://www.bridgemind.ai/llms.txt)
- [BridgeMind 产品总览](https://www.bridgemind.ai/products)
- [BridgeSpace](https://www.bridgemind.ai/products/bridgespace)
- [BridgeVoice](https://www.bridgemind.ai/products/bridgevoice)
- [BridgeMCP](https://www.bridgemind.ai/bridgemcp)
- [BridgeMCP 文档](https://www.bridgemind.ai/docs)
- [BridgeSwarm](https://www.bridgemind.ai/bridgeswarm)
- [BridgeAgent](https://www.bridgemind.ai/products/bridgeagent)
- [BridgeBench](https://www.bridgemind.ai/bridgebench)
- [BridgeMind 路线图](https://www.bridgemind.ai/roadmap)
- [BridgeMind 定价](https://www.bridgemind.ai/pricing)
- [BridgeMind 公开项目说明](https://www.bridgemind.ai/opensource)
- [BridgeMind 更新日志](https://www.bridgemind.ai/changelog)
