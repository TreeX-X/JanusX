# Janus Island 工作区 Agent 基础建设技术方案

## 1. 文档目的

本文档记录 JanusX 当前与以下目标相关的工程现状、缺口和实施规划：

- Island 中的 Janus 能够绑定当前工作区。
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

`useJanusChat` 会读取活动工作区的 `workspaceId` 和 `workspacePath`，但这些信息目前只是作为 LLM 请求元数据传递，尚未触发 Agent Runtime 工具执行。

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
Island Janus
  -> Janus Agent Orchestrator
  -> LLM function calling / planner
  -> Agent Runtime
  -> Policy Gate + Approval UI
  -> Workspace Tools / Project Tools
  -> 文件系统、ProjectConfig、ProjectRunner
```

设计原则：

1. Janus 只负责理解意图、规划步骤和展示结果。
2. 所有文件、配置和命令操作都必须通过 Agent Runtime 工具执行。
3. 工具必须绑定已注册 workspace，禁止访问工作区外路径。
4. 写入、配置应用、运行和外部命令必须有预览和明确审批。
5. 项目配置必须复用 `ProjectConfig` 的类型和校验，不允许 Janus 自行写任意 JSON。
6. 保持 typed IPC 边界，不重新引入通用字符串 IPC。

## 6. 分阶段实施计划

### 阶段一：工作区理解与运行配置生成

目标是先打通低风险闭环：

1. Island 绑定活动 workspace。
2. 新增 `workspace.list`，限制深度、数量和敏感目录。
3. 复用 `workspace.read` 读取非敏感文本。
4. 新增 `project.detect`，返回项目类型、置信度、证据和候选目录。
5. 新增 `project.generate-config`，生成候选 `LaunchConfig`。
6. 调用 `ProjectConfig.validate()` 校验候选配置。
7. 在 ProjectSettings 展示配置差异。
8. 用户批准后通过 `ProjectConfig.write()` 写入配置。

阶段一暂不开放任意 shell，也不默认自动修改普通源代码。

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

1. 用户打开 ProjectSettings。
2. 系统显示自动检测结果和置信度。
3. 用户点击“让 Janus 分析此工作区”。
4. Janus 读取必要文件并解释检测依据。
5. Janus 生成候选配置。
6. 界面展示配置差异、启动命令、工作目录和端口。
7. 用户批准后写入 `.janusX/janusX.launch.json`。
8. 配置回填到现有快速配置和高级 JSON 编辑器。

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

1. Island 能识别当前活动 workspace。
2. Janus 能读取有限深度文件树和非敏感文本文件。
3. Janus 能识别现有支持的主要工程类型。
4. Janus 能生成候选 `LaunchConfig`。
5. 候选配置必须通过 `ProjectConfig.validate()`。
6. 写入配置前必须展示预览并取得用户批准。
7. Janus 不得读取敏感文件或访问工作区外路径。
8. 所有写入、配置应用、运行和命令执行都有审计记录。
9. ProjectSettings 能继续编辑和保存 Janus 生成的配置。
10. 取消、拒绝、超时后工作区和配置保持一致。
11. Janus 不绕过 typed preload/IPC 和现有策略边界。
12. 不覆盖用户已有未提交修改。

## 12. 当前基线与后续工作

当前代码已具备 Agent Runtime 安全授权、审批和审计基础，并已提交推送：

- Commit：`1f94a90 feat: harden workspace agent authorization`
- 分支：`main`
- 远端：`origin/main`
- 验证：相关单元测试 22 个测试文件通过，276 个测试通过；TypeScript 类型检查通过。

后续实现应从阶段一开始，优先完成 Janus Agent 编排、工作区列表工具、项目检测工具和候选运行配置流程，再逐步加入文件修改与受控命令执行。
