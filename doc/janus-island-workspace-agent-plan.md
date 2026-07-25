# Janus Island 工作区 Agent 基础建设技术方案

## 1. 文档目的

本文档记录 JanusX 当前与以下目标相关的工程现状、缺口和实施规划：

- Janus Island 的普通对话不默认绑定任何工作区。
- 用户可以在 Island 中显式选择并拉入一个或多个工作区作为控制资源。
- 当 Janus 被嵌入某个工作区时，嵌入上下文才默认使用该工作区作为控制资源。
- Janus 能够读取并理解工作区工程结构。
- 用户可以通过自然语言请求修改工作区代码或配置。
- Janus 能够生成 `.janusX/janusX.launch.json` 运行配置。
- 在明确授权后，Janus 可以运行项目或执行受控命令。

本文档是后续实现、评审和验收的基础，不代表所有能力已经完成。

## 2. 当前工程概况

JanusX 是 Electron + React + TypeScript 桌面应用，已经存在以下相关模块：

| 模块 | 现有能力 | 当前状态 |
|---|---|---|
| Island/Janus | 展开、聊天、流式输出、当前 workspace 元数据 | 已有入口，尚未编排工具 |
| Agent Runtime | 会话、工具注册、超时、取消、审批、策略审计 | 基础执行层已具备 |
| 工作区工具 | `workspace.read`，路径校验和敏感文件拒绝 | 仅支持读取单个文本文件 |
| 项目检测 | 支持多种项目类型和检测置信度 | 已有检测器，复杂工程识别仍需增强 |
| 项目配置 | 默认配置生成、读取、写入、校验 | 已可生成 `.janusX/janusX.launch.json` |
| 项目运行 | `ProjectRunner` 启动、停止、输出轮询 | 已有人工操作链路 |
| 安全策略 | 只读自动允许，写入/运行/外部命令需审批 | 可作为 Janus 的统一安全边界 |

## 3. 当前调用链

### 3.1 Janus 聊天

```text
Island
  -> JanusChat
  -> useJanusChat
  -> chatStream
  -> LLM 文本响应
```

`useJanusChat` 当前由顶层 Provider 持有全局对话状态，并维护显式 workspace resource 列表。只有用户拉入的 active resource（或嵌入上下文自动绑定的 resource）才会作为 LLM 请求元数据传递；普通 Island 不再读取活动窗口作为默认控制资源。该链路尚未触发 Agent Runtime 工具执行。

### 3.2 项目配置与运行

```text
ProjectSettings / ProjectLauncher
  -> projectService
  -> typed preload API
  -> project IPC handlers
  -> ProjectDetector / ProjectConfig / ProjectRunner
```

没有配置时，系统可以根据检测结果生成默认 `LaunchConfig`，用户修改后写入 `.janusX/janusX.launch.json`。

### 3.3 Agent Runtime

```text
创建 workspace 会话
  -> 校验工作区注册路径
  -> 校验工具输入
  -> 评估 actionRisk
  -> 必要时请求审批
  -> 执行工具
  -> 产生审计记录和生命周期事件
```

目前 Runtime 中实际注册的工作区工具只有 `workspace.read`。

## 4. 主要缺口

### 4.1 Janus 未连接 Agent Runtime

Janus 目前只消费文本流，没有：

- 创建或复用 workspace Agent Session；
- 处理模型 function call 或 planner step；
- 将工具结果回写对话；
- 监听工具开始、结束、失败和审批事件。

### 4.2 工作区工具集不完整

当前缺少：

- 有限深度目录列表；
- 新增文件和修改文件；
- 工程检测工具；
- 运行配置生成和应用工具；
- 项目运行工具；
- 受控外部命令工具。

### 4.3 配置窗口未接入 Janus

`ProjectSettings` 当前支持检测、表单编辑和 JSON 编辑，但没有“让 Janus 分析工作区”或“让 Janus 生成配置”的入口，也没有候选配置预览和批准流程。

### 4.4 工程识别仍偏浅

`ProjectDetector` 主要扫描工程根目录特征文件。对于 monorepo、多应用目录、复杂脚本配置或低置信度工程，需要返回更完整的证据和候选结果。

## 5. 目标架构

```text
全局 Janus Island 会话
  -> Resource Attachment Manager（零个或多个工作区资源）
  -> Janus Agent Orchestrator
  -> LLM function calling / planner
  -> Agent Runtime（按资源选择 workspace session）
  -> Policy Gate + Approval UI
  -> Workspace Tools / Project Tools
  -> 文件系统、ProjectConfig、ProjectRunner
```

设计原则：

1. Janus 只负责理解意图、规划步骤和展示结果。
2. 普通 Island 对话默认是全局上下文，不携带任何工作区控制权。
3. 工作区必须通过用户显式操作拉入，形成可见的资源附件和控制范围。
4. 嵌入到工作区的 Janus 对话可以把嵌入工作区作为默认资源，但仍应显示当前资源范围。
5. 所有文件、配置和命令操作都必须通过 Agent Runtime 工具执行。
6. 工具必须绑定已拉入且已注册的 workspace，禁止访问工作区外路径。
7. 写入、配置应用、运行和外部命令必须有预览和明确审批。
8. 项目配置必须复用 `ProjectConfig` 的类型和校验，不允许 Janus 自行写任意 JSON。
9. 保持 typed IPC 边界，不重新引入通用字符串 IPC。

## 5.1 Janus 会话与工作区资源模型

Janus 对话和工作区资源必须解耦：

| 场景 | 默认控制资源 | 行为 |
|---|---|---|
| 独立打开 Island | 无 | 可进行普通对话、规划和知识问答；不得直接读写任意工作区 |
| Island 中显式拉入工作区 | 用户选择的一个或多个 workspace | 只允许对已拉入资源执行工具；工具调用必须声明目标资源 |
| Janus 嵌入工作区 | 被嵌入的 workspace | 自动将嵌入工作区作为默认控制资源，同时允许用户追加或移除资源 |
| 多工作区对话 | 多个已拉入 workspace | 每个工具调用必须绑定明确 workspace，禁止根据“当前活动窗口”隐式猜测 |

建议维护以下状态：

- `JanusConversation`: 全局对话、消息、模型和运行状态。
- `WorkspaceResource`: workspaceId、路径、显示名、来源（`attached`/`embedded`）、权限状态。
- `activeResourceId`: 当前操作目标，仅用于消除多资源指令歧义。
- `resourceBindings`: 对话与多个工作区之间的显式绑定关系。

没有资源时，Janus 可以回答一般问题，但任何 workspace 工具调用都必须先提示用户选择资源。资源被移除后，关联 Agent Session 应取消或降权，不能继续执行未确认的操作。

## 6. 分阶段实施计划

### 阶段一：工作区理解与运行配置生成

目标是先打通低风险闭环：

1. 建立全局 Janus 会话，不默认绑定 workspace。
2. 增加 Island 的工作区资源选择/拉入/移除操作。
3. 增加嵌入上下文初始化：嵌入工作区自动成为默认资源。
4. 新增 `workspace.list`，限制深度、数量和敏感目录，并要求显式资源 ID。
5. 复用 `workspace.read` 读取指定资源中的非敏感文本。
6. 新增 `project.detect`，返回指定资源的项目类型、置信度、证据和候选目录。
7. 新增 `project.generate-config`，生成指定资源的候选 `LaunchConfig`。
8. 调用 `ProjectConfig.validate()` 校验候选配置。
9. 在 ProjectSettings 展示配置差异。
10. 用户批准后通过 `ProjectConfig.write()` 写入对应资源。

阶段一暂不开放任意 shell，也不默认自动修改普通源代码。

#### 阶段一当前实现状态

- 第 1 项已完成：Janus 会话由顶层 `JanusChatProvider` 全局持有，普通对话不再隐式绑定活动 workspace。
- 第 2 项已完成：Island Chat 提供 workspace 资源拉入、切换和移除操作；资源以 `WorkspaceResource` 显式维护。
- 第 3 项已完成：嵌入 workspace 的 Janus Chat pane 会将嵌入 workspace 设为默认资源；此前未显式拉入时标记为 `embedded`。切换嵌入 workspace 时替换旧的纯 embedded 资源，同时保留用户显式拉入的资源。
- 第 4 项已完成：Agent Runtime 注册 `workspace.list`；调用必须显式传入与会话绑定一致的 `workspaceId`，不接受模型传入工作区根路径。
- `workspace.list` 默认递归深度为 2、最多返回 200 项，硬上限分别为 4 和 1000；输出包含规范化相对路径、名称、类型、层级和截断状态，并使用目录优先的稳定排序。
- `workspace.list` 复用工作区路径守卫拒绝绝对路径、父级穿越和工作区外目标；不跟随符号链接，并隐藏 `.git`、凭据目录、环境文件、私钥和证书等敏感项。
- 第 5 项已完成：`workspace.read` 现在要求显式传入与会话绑定一致的 `workspaceId`，并在结果中回显资源 ID；读取仍仅允许工作区内、非敏感的 UTF-8 文本，并受字节数上限保护。
- 第 6 项已完成：Agent Runtime 注册 `project.detect`，使用显式 `workspaceId` 和相对目录执行有限深度扫描；默认最多扫描 50 个目录，硬上限 100，递归深度硬上限 3，并返回项目类型、置信度、证据和候选目录。
- 第 7 项已完成：Agent Runtime 注册 `project.generate-config`，根据检测结果或用户指定的合法项目类型生成完整候选 `LaunchConfig`，生成阶段不写入文件。
- 第 8 项已完成：所有生成候选都会调用 `ProjectConfig.validate()` 并返回结构化错误和警告；`project.apply-config` 写入前会再次校验，非法配置关闭式失败。
- 第 9 项已完成：Janus 分析完成后会将候选配置送入 ProjectSettings；ProjectSettings 保留当前配置作为基线，提供字段级新增、删除和修改差异，并对敏感字段值脱敏。
- 第 10 项已完成：ProjectSettings 通过 `project.apply-config` 提交候选配置；Agent Runtime 以 `config-apply` 风险等级生成审批请求，用户在界面明确批准后才调用 `ProjectConfig.write()` 写入目标资源。
- 当前资源范围已用于 Janus 知识召回请求；没有资源时保持全局范围，不发送 workspace 控制元数据。
- 资源状态会在 workspace 被删除或不可用时自动清理，并将当前资源回退到剩余资源。
- 资源栏提供“分析工作区”动作：Janus 为当前资源创建 Agent Session，依次执行 `workspace.list`、必要的 `workspace.read`、`project.detect` 和 `project.generate-config`；切换、移除资源或卸载会取消旧 Session。
- 阶段一低风险闭环已完成；下一步进入阶段二，增加受审批保护的普通文件修改能力和可恢复边界。

### 阶段二：受控文件修改

1. 增加 `workspace.write` 和 `workspace.create`。
2. 对每次变更生成摘要和 diff 预览。
3. 写入动作使用 `write/create` 风险等级并逐次审批。
4. 通过 Checkpoint 或 Git 记录可恢复边界。
5. Island 展示修改文件、审批状态、成功和失败原因。

### 阶段三：受控运行和命令执行

1. 增加 `project.run` 和 `project.stop` 工具。
2. 增加结构化的 `workspace.exec`。
3. 优先支持 npm、pnpm、yarn、bun、cargo、go、python、pytest 等工程命令。
4. 限制 cwd 必须位于 workspace 内。
5. 设置超时、输出大小和并发限制。
6. 命令显示完整预览后再请求审批。

## 7. 建议工具清单

| 工具 | 风险等级 | 作用 | 是否审批 |
|---|---|---|---|
| `workspace.list` | `list` | 获取有限深度文件树 | 否 |
| `workspace.read` | `read` | 读取非敏感文本文件 | 否 |
| `workspace.write` | `write` | 修改已有文件 | 是 |
| `workspace.create` | `create` | 新建文件 | 是 |
| `project.detect` | `inspect` | 识别工程类型和证据 | 否 |
| `project.generate-config` | `config-apply` | 生成候选启动配置 | 应用时是 |
| `project.apply-config` | `config-apply` | 校验并写入启动配置 | 是 |
| `project.run` | `run` | 启动项目 | 是 |
| `project.stop` | `run` | 停止项目 | 是 |
| `workspace.exec` | `external-command` | 执行白名单式工程命令 | 是 |

## 8. 安全设计

### 8.1 路径边界

- 所有路径使用 workspace 相对路径。
- 拒绝绝对路径、`..` 路径遍历和符号链接越界。
- 复用 `path-guard.ts` 的 canonical path 校验。
- 文件打开后再次校验目标身份，防止 TOCTOU 风险。

### 8.2 敏感内容

默认拒绝读取以下内容：

- `.env`、`.env.*`；
- `.ssh`、`.aws`、`.kube`、`secrets` 等目录；
- 私钥、证书、凭据文件；
- Docker、云平台默认凭据文件。

工具输出、错误和审计输入必须继续经过脱敏和长度限制。

### 8.3 审批

写入、配置应用、运行和外部命令必须包含：

- 工具名称；
- 工作区；
- 目标路径或命令；
- 变更摘要；
- 风险等级；
- 超时信息。

审批通过后才允许执行，拒绝、取消或超时都必须保持失败关闭。

## 9. ProjectSettings 集成建议

配置窗口增加 Janus 辅助入口：

1. 用户打开 ProjectSettings，或在 Island 中选择“拉入工作区”。
2. 系统明确显示资源名称、路径和来源（拉入/嵌入）。
3. 系统显示该资源的自动检测结果和置信度。
4. 用户点击“让 Janus 分析此工作区”。
5. Janus 只读取被选中的资源并解释检测依据。
6. Janus 生成该资源的候选配置。
7. 界面展示配置差异、启动命令、工作目录和端口。
8. 用户批准后写入该资源的 `.janusX/janusX.launch.json`。
9. 配置回填到现有快速配置和高级 JSON 编辑器。

不建议 Janus 在没有用户确认的情况下隐式修改配置或启动进程。

## 10. 工程检测优化

后续应增强 `ProjectDetector`：

- 有限深度递归扫描；
- 优先读取 `package.json`、`pyproject.toml`、`Cargo.toml`、`go.mod`、`CMakeLists.txt` 等主配置；
- 识别 monorepo 根目录和实际应用目录；
- 读取 `scripts.dev`、`scripts.start` 等可执行入口；
- 返回多个候选类型和证据，而不是只返回第一个结果；
- 低置信度时要求用户确认。

## 11. 验收标准

基础建设完成后至少满足：

1. 独立 Island 对话在没有资源时不会隐式读取当前活动 workspace。
2. 用户可以在 Island 中显式拉入、查看和移除 workspace 资源。
3. 嵌入到工作区时，该 workspace 自动成为默认控制资源。
4. 多工作区同时存在时，每个工具调用都能明确标识目标 workspace。
5. Janus 能读取指定资源的有限深度文件树和非敏感文本文件。
6. Janus 能识别指定资源的主要工程类型。
7. Janus 能为指定资源生成候选 `LaunchConfig`。
8. 候选配置必须通过 `ProjectConfig.validate()`。
9. 写入配置前必须展示预览并取得用户批准。
10. Janus 不得读取敏感文件或访问工作区外路径。
11. 所有写入、配置应用、运行和命令执行都有审计记录。
12. ProjectSettings 能继续编辑和保存 Janus 生成的配置。
13. 取消、拒绝、超时或移除资源后，关联操作停止且工作区保持一致。
14. Janus 不绕过 typed preload/IPC 和现有策略边界。
15. 不覆盖用户已有未提交修改。

## 12. 当前基线与后续工作

当前代码已具备 Agent Runtime 安全授权、审批和审计基础，并已提交推送：

- Commit：`1f94a90 feat: harden workspace agent authorization`
- 分支：`main`
- 远端：`origin/main`
- 验证：相关单元测试 22 个测试文件通过，276 个测试通过；TypeScript 类型检查通过。

后续实现应从阶段一开始，优先完成 Janus Agent 编排、工作区列表工具、项目检测工具和候选运行配置流程，再逐步加入文件修改与受控命令执行。
