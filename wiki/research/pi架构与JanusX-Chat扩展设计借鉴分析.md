# Pi 架构与 JanusX Chat 扩展设计借鉴分析

> 分析日期：2026-07-29  
> JanusX 基线：`0f93861429bb87bf97d16e2ccf10c4a18e0201db`  
> Pi 参考仓库：<https://github.com/earendil-works/pi>  
> Pi 参考基线：`027a5847901b5dde30270abaa1041046cd2b4b55`（2026-07-28）  
> 分析性质：架构调研与演进建议，不是已确认的实施 PRD。

## Overview

- **Project Goal**：判断 JanusX Chat 的基础设置和扩展设计能否学习 Pi 的专业化架构，并给出不推倒重写的演进路线。
- **Tech Stack**：JanusX 为 Electron + React + TypeScript + Zustand + Vercel AI SDK；Pi 为 TypeScript monorepo，拆分 AI、Agent Core、Coding Agent、TUI、Server、Storage 等包。
- **Current Summary Scope**：JanusX Chat UI、LLM Provider/模型配置、会话上下文、Workspace Tools、Agent Runtime、策略审批、Knowledge Recall，以及 Pi 的设置、资源加载、扩展、Provider、Session、SDK 与包管理机制。

## Executive Conclusion

结论：**可以学习，而且 JanusX 已经有足够好的地基；正确方向是把现有能力“协议化、组合化、可发现化”，不是把 Pi 的代码或 TUI 模型直接搬进 Electron。**

JanusX 当前并非缺少扩展能力，而是扩展能力分散在多个局部注册表和硬编码组合点中：

- `@janusx/llm-core` 已有 `ProviderExtension`、`ExtensionRegistry`、`ProviderFactory`；
- Agent Runtime 已有 `ToolRegistry`、输入 Schema、风险等级、审批、审计和工作区路径隔离；
- Janus Chat 已能动态选择 Provider/模型、挂载多个工作区、调用工具、回放工具轨迹并注入知识召回；
- Renderer 已有 Right Tool registry 和 typed preload/IPC 边界。

但这些还没有构成一个对第三方或内部模块稳定开放的“JanusX Extension Platform”。与 Pi 相比，JanusX 的主要缺口不是某一个接口，而是下面六个系统能力没有统一：

1. **统一的扩展生命周期与事件协议**：目前 Provider、Tool、Knowledge、UI 各自扩展，没有一个 Chat Runtime 级扩展 API。
2. **资源发现与来源治理**：没有 global/workspace/session 三层资源加载、冲突优先级、来源元数据、信任决策和热重载。
3. **配置作用域与可追溯合并**：LLM 配置是全局 JSON；Chat 选择和会话参数多为内存态或常量，缺少 workspace/session override。
4. **会话是 UI 状态，不是领域对象**：消息、模型选择、工具轨迹和运行时会话没有统一持久化、迁移和恢复协议。
5. **扩展交付与兼容契约**：没有 manifest、API 版本、能力声明、权限申请、安装来源、诊断与升级策略。
6. **可编程 SDK 与测试契约**：内部类可复用，但尚无稳定的 `createChatSession()`/`ExtensionHost` 等应用无关入口。

建议将 Pi 的设计分成三类处理：

| 决策 | 内容 |
|---|---|
| 直接学习 | 分层包边界、统一 ResourceLoader、global/project 配置覆盖、typed lifecycle events、SessionManager、Provider/Tool 动态注册、来源诊断、SDK-first 测试 |
| 结合 Electron 改造 | 项目扩展信任、热重载、UI 扩展、包管理、事件拦截、配置表单、会话存储 |
| 明确不照搬 | 默认以主进程权限执行任意 TypeScript、扩展默认拥有完整系统权限、把 `!command` 作为桌面端秘密值的常规解析方式、第一版就开放 Pi 级别的超大 API 面 |

## Engineering Structure & Module Responsibilities

### JanusX Chat 当前结构

| Module/Directory | Primary Responsibility | Key Files |
|---|---|---|
| Chat presentation | 消息展示、输入、Provider/模型选择、工作区挂载、审批 UI | `src/renderer/src/components/janus/JanusChat.tsx`, `JanusChatPane.tsx` |
| Chat controller | 消息内存态、流式请求、模型选择、工具轨迹、工作区 Agent Session | `src/renderer/src/components/janus/useJanusChat.ts` |
| Renderer LLM service | typed preload API 的轻量封装、流事件订阅 | `src/renderer/src/services/llm.ts` |
| IPC contract/boundary | Chat 请求、Provider、Model、Recall/Tool Trace 类型和固定通道 | `src/shared/ipc/llm.ts`, `src/preload/index.ts` |
| Chat orchestration | Provider 解析、知识召回、系统消息注入、工具循环、Observation 采集 | `src/main/ipc/llm-handlers.ts` |
| LLM core | Provider 接口、适配器注册、模型实例工厂、配置校验 | `packages/llm-core/src/core/*`, `packages/llm-core/src/adapters/*` |
| LLM persistence/catalog | 全局 Provider 配置、默认 Provider、OpenRouter 模型目录缓存 | `src/main/llm/ConfigStore.ts`, `ModelCatalogService.ts` |
| Workspace tool bridge | 将 Agent Runtime 工具包装成 Chat 可调用工具和系统提示 | `src/main/llm/workspace-chat-tools.ts` |
| Agent Runtime | Tool registry、会话、执行、审批、超时、审计、脱敏 | `src/main/agent/runtime/*` |
| Knowledge | Chat recall、untrusted context 注入、对话 Observation | `src/main/knowledge/*`, `src/main/ipc/llm-handlers.ts` |
| App settings | LLM、模型目录、知识和通知设置入口 | `src/renderer/src/components/AppSettingsModal.tsx` |

### Pi 参考结构

| Module/Directory | Primary Responsibility | Key Files |
|---|---|---|
| `packages/ai` | side-effect-free AI 类型、模型、认证、Provider/API 实现 | `packages/ai/src/index.ts`, `providers/*`, `api/*` |
| `packages/agent` | UI 无关的 Agent loop/harness、hooks、tools、session abstractions | `packages/agent/src/harness/agent-harness.ts`, `harness/types.ts` |
| `packages/coding-agent` | Coding Agent 产品层、Extension API、ResourceLoader、Settings、Session、SDK | `src/core/extensions/*`, `resource-loader.ts`, `settings-manager.ts`, `sdk.ts` |
| `packages/tui` | 可替换的交互显示层 | `packages/tui/src/*` |
| `packages/server` / `storage` | 服务化和存储实现 | 对应包目录 |
| docs/examples/tests | 扩展协议说明、示例扩展、兼容和回归测试 | `docs/extensions.md`, `examples/extensions/*`, `test/*` |

Pi 的专业感首先来自**分层所有权清晰**：AI、Agent、产品 Harness、UI、Storage 彼此不是同一个“大服务”的内部文件，而是具有导出边界和独立测试面的包。`packages/ai/src/index.ts` 甚至显式说明 root export 保持 side-effect free，Provider factories 和兼容层使用子路径导出；`packages/coding-agent/src/index.ts` 则把 Session、ResourceLoader、Extension、Settings 和 SDK 作为正式公共 API 导出。

## JanusX Chat Settings Capability Inventory

### 已对用户开放的基础设置

| Capability | Current Behavior | Scope / Persistence | Evidence |
|---|---|---|---|
| Provider 管理 | 新增、编辑、删除、设默认、连接测试、运行状态检查 | 全局；`userData/janusx/llm-config.json` | `LlmConfigModal.tsx`, `ConfigStore.ts::LlmConfigStore` |
| OpenAI Compatible | 名称、Base URL、API Key、默认模型 | 全局 Provider 记录 | `LlmConfigModal.tsx::buildSettings` |
| Vertex AI | Project、Region、ADC/Service Account/JSON、模型、代理 | 全局 Provider 记录 | `LlmConfigModal.tsx::buildSettings` |
| 模型目录 | 浏览能力、价格、上下文等 OpenRouter 元数据并刷新缓存 | 全局缓存；24 小时 stale | `ModelCatalogService.ts`, `ModelCatalogPanel.tsx` |
| Chat 模型切换 | Chat 内切换 Provider 和模型 | 当前 Renderer 生命周期；未持久化为会话配置 | `JanusChat.tsx`, `useJanusChat.ts::selectModel` |
| 工作区资源 | 同一 Chat 可挂载多个工作区 | 挂载 ID 写入 `localStorage` | `useJanusChat.ts`, `janusResources.ts` |
| Knowledge | 仅提供是否启用采集的开关 | 全局 `config.json` | `KnowledgeSettingsPanel.tsx`, `shared/knowledge-settings.ts` |
| 工具审批 | 写入/创建等操作展示预览并等待允许/拒绝 | 每次调用；审计持久化 | `runtime.ts::executeTool`, `policy-gate.ts`, `JanusChat.tsx` |

### 类型中存在、但设置中心尚未完整开放的能力

- `ProviderSettings` 定义了 `enabled`、`organization`、`testModelId`、`extra`；UI 保存时固定 `enabled: true`，没有停用、组织 ID、独立测试模型或扩展字段表单。
- `AuthType` 包含 `OAUTH` 和 `NONE`，但 `LlmConfigModal` 只提供 OpenAI Compatible 与 Vertex AI；`validateSettings()` 对 OAuth 落入“不支持”的 default 分支。
- `ProviderCapabilities` 和 `ModelInfo` 已有 chat、embedding、vision、function calling、context window、pricing 等能力信息，但 Chat 选择器主要展示 Provider 名和 Model ID，没有按当前 Chat 能力过滤或解释不兼容原因。
- `ProviderExtension` 已定义 `initialize()`/`dispose()`，但应用启动只注册两个 built-in adapter，缺少发现、加载、停用和错误隔离流程。

### 仍为硬编码或运行时内存态的 Chat 设置

| Item | Current State | Consequence |
|---|---|---|
| System prompt/persona | `src/shared/janus/persona.ts::JANUS_PERSONA` 编译期常量 | 用户、工作区和扩展无法组合 prompt；修改需发版 |
| 历史窗口 | `HISTORY_MESSAGE_LIMIT = 24` | 不能按模型 context window 或项目策略调整 |
| UI 消息上限 | `MAX_CHAT_MESSAGES = 200` | 只是内存裁剪，不是会话压缩/持久化策略 |
| 工具轨迹窗口 | Renderer 48、Main 请求最多 24 | 上限分散，缺少统一 session policy |
| Agent step 上限 | `CHAT_MAX_STEPS = 12` | 无 UI/工作区覆盖和模型差异化 |
| Knowledge recall | max items/chars 等常量位于 `llm-handlers.ts` | 只有采集开关，没有 recall policy |
| Sampling/reasoning | 未见 temperature、top-p、max output、thinking level 的 Chat 设置入口 | 无法利用不同模型的推理能力和成本档位 |
| Retry/transport/proxy | Chat 无统一配置；Vertex 有 Provider 专属 proxy | 网络策略不一致，无法按全局/Provider/Session 分层 |
| Tool allowlist | Chat 系统提示固定列出工具；无用户或工作区启停配置 | 注册工具与本次允许使用的工具没有产品化分离 |
| Conversation session | `useState<Message[]>` + refs | 重启不可恢复，无法分支、命名、迁移或审计完整上下文 |

因此，JanusX 的“基础设置”已经足够完成 Provider 接入和安全工具调用，但还属于**连接配置面板**，不是完整的 **Chat Runtime Settings**。

## Core Implementation & Workflow

### JanusX 当前 Chat 主流程

1. `useJanusChat()` 从全局 LLM 配置加载启用 Provider 和模型列表，在 Renderer 内选择当前模型。
2. Renderer 构造 persona + 最近 24 条消息，创建每个挂载工作区的 Agent Runtime session，通过 typed preload 发起 `chatStream`。
3. `llm-handlers.ts` 验证 Provider 与工作区 session，执行 Knowledge recall，将结果以明确的 `untrusted/reference-only` 边界注入消息。
4. Main Process 根据受信工作区生成 Chat tools；工具调用进入 `WorkspaceAgentRuntime`，接受 schema、workspace root、风险、审批、超时、审计和脱敏控制。
5. 工具结果以压缩 trace 回传 Renderer，并在下一轮作为 system history 重放；消息结束后写入 Knowledge Observation。

这个流程的安全基础优于“直接给 Agent 一个本机 shell”：工作区身份、路径范围、敏感文件、变更审批、checkpoint 和审计均有明确实现。后续扩展设计必须保留这些边界。

### Pi 的扩展主流程

1. `SettingsManager` 加载 global 与 project settings；项目配置递归覆盖全局配置，项目资源受 trust 状态控制。
2. `DefaultResourceLoader` 先以不可信项目模式加载 global/temporary trust extensions，决策项目 trust 后再装载最终 extension、skill、prompt、theme 和 context 集合。
3. `loader.ts` 从标准目录、显式路径或 package manifest 发现 `.ts/.js` extension，执行同步或异步 factory，收集 tool、command、shortcut、renderer、provider 和 event handlers。
4. `ExtensionRunner` 将注册项绑定到当前 session/runtime；事件分成 session、agent、turn、message、provider、model、tool、input 等阶段，部分事件可观察，部分可以取消或变换数据。
5. Session 替换或 `/reload` 时，旧 runtime 收到 `session_shutdown`，旧 context 被标记 stale，资源重新发现并绑定新 runtime。
6. `createAgentSession()` 和相关 SDK 将同一套 ResourceLoader、Settings、Session 和 Extension 机制用于 TUI、print、JSON、RPC 或自定义宿主。

### Pi 专业化和高扩展性的关键机制

1. **Extension API 是产品协议，不只是一个 Map**  
   `ExtensionAPI` 同时定义注册能力和生命周期事件；类型覆盖 Provider、Tool、Command、Message/Entry Renderer、Shortcut、Flag、Session metadata、EventBus 等。调用方不需要修改 Agent 主循环来添加常见能力。

2. **资源加载与运行时绑定分离**  
   `loader.ts` 负责发现和构建 extension runtime state，`runner.ts` 负责将其绑定到 session。这使异步初始化、reload、session replacement 和 stale-context 防护成为可测试流程。

3. **Settings 有作用域、合并规则和存储抽象**  
   `SettingsManager` 明确定义 `global | project`，嵌套对象合并，数组整体覆盖；File storage 使用锁，同时提供 in-memory storage 供 SDK 和测试使用。

4. **ResourceLoader 是组合根**  
   Extension、skill、prompt、theme、context file 都从同一入口加载，携带 `source/scope/origin` 元数据，能报告 collision 和 diagnostic；项目资源加载前有 trust gate。

5. **Provider 不等于一组凭证字段**  
   `registerProvider()` 可以覆盖 endpoint、动态模型、OAuth、headers、compat、custom stream，并支持立即 register/unregister。Provider composer 负责把 built-in、models.json 与 extension contributions 组合和验证。

6. **Session 是一等领域对象**  
   Session 负责消息、模型状态、事件流、压缩、分支/树、命名和持久化；扩展可追加不进入 LLM context 的自定义 entry，避免把扩展状态塞进 UI store。

7. **SDK 与产品 UI 共用内核**  
   Pi 不把 TUI 当核心；`createAgentSession()`、`AgentSessionRuntime`、`DefaultResourceLoader`、`SettingsManager`、`SessionManager` 都正式导出，RPC/print/TUI 是不同宿主。

8. **扩展行为有大量契约测试**  
   `extensions-discovery.test.ts`、`extensions-runner.test.ts`、`resource-loader.test.ts`、`settings-manager.test.ts` 和大量 regression tests 覆盖发现、优先级、trust、reload、stale context、动态 Provider/Tool 与冲突。

## Side-by-side Gap Matrix

| Dimension | JanusX Today | Pi Reference | Gap | Priority |
|---|---|---|---|---|
| Core layering | LLM core 已拆包；Chat orchestration 仍集中在 IPC handler/hook | AI、Agent、Harness、UI、Storage 分层并导出 SDK | 中 | High |
| Settings scope | Provider/Knowledge 主要全局；Chat 多为内存常量 | global + project 深合并，CLI/session 再覆盖 | 大 | High |
| Session model | Renderer 消息数组和临时 refs | 可持久化、迁移、分支、命名、事件化 Session | 大 | High |
| Extension lifecycle | Provider 有可选 init/dispose；Tool 只有 register | 完整 startup/reload/session/turn/tool/provider 生命周期 | 大 | High |
| Resource discovery | 无 Chat 统一 loader | global/project/package/CLI 统一 ResourceLoader | 大 | High |
| Provider extensibility | 接口存在，但 built-in 注册与 UI 类型硬编码 | 动态注册/覆盖/OAuth/custom stream/model refresh | 中到大 | High |
| Tool extensibility | Registry、schema、risk、policy 很强；启动时硬编码注册 | 动态注册、启停、覆盖、来源、生命周期 hooks | 中 | High |
| Security | 工作区隔离、审批、审计、脱敏较强 | 项目 trust 强，但 extension 默认完整系统权限 | JanusX 在工具安全上更强 | Preserve |
| UI extensions | Right tools 是编译期 union/array | 可注册 renderer/widget/editor/dialog | 大 | Medium |
| Prompt/resources | persona 常量；Knowledge 特殊注入 | system/append prompt、skills、templates、context 统一加载 | 大 | High |
| Diagnostics | 运行状态、tool trace、policy audit 分散 | resource source/scope、collision、extension errors 统一 | 中 | Medium |
| Compatibility | LLM config 有 version，但无迁移；扩展无 API version | compat exports、session/settings migrations、回归测试 | 大 | High |
| Distribution | 无 Chat extension package | npm/git/local package + manifest + scope/filter | 大 | Later |

## Key Code Interpretation

### JanusX

- `packages/llm-core/src/core/types.ts::ProviderExtension`：已经是可用的 Provider SPI，包含 capability、模型创建、模型枚举、校验和生命周期；问题在宿主加载流程，不在接口从零缺失。
- `packages/llm-core/src/core/ExtensionRegistry.ts`：当前只管理 Provider，名称容易让人误以为是全局扩展平台；建议未来改为 `ProviderRegistry`，避免和真正的 `ChatExtensionRegistry` 混淆。
- `src/main/llm/LlmService.ts::registerBuiltInAdapters`：只注册 OpenAI Compatible 与 Vertex AI；`AUTH_TYPE_TO_ADAPTER` 让 API-key Provider 共用同一适配器，适合兼容端点，但不足以表达任意 Provider 插件生命周期。
- `src/main/agent/runtime/registry.ts::ToolRegistry`：已具备 fail-fast 重名检查、输入 schema 与 action risk，是未来工具贡献点的良好内核。
- `src/main/agent/runtime/runtime.ts::WorkspaceAgentRuntime`：将 session、tool、policy、approval、timeout 和 audit 串联，是 JanusX 应保留的安全执行层。
- `src/main/ipc/agent-runtime-handlers.ts`：工具在 IPC 注册时由 `registerWorkspaceTools()`/`registerProjectTools()` 硬编码装配；这是从“内部 registry”走向“扩展 host”的首要替换点。
- `src/main/ipc/llm-handlers.ts`：同时承担 Chat application service、knowledge middleware、tool loop adapter、trace formatter 和 IPC controller；建议拆出 UI/IPC 无关的 `ChatSessionRuntime`。
- `src/renderer/src/components/janus/useJanusChat.ts`：消息、active model、tool traces、agent sessions 均由 React hook 持有；UI 生命周期承担了领域会话职责。
- `src/renderer/src/right-tools/registry.ts`：有 declarative registry 的雏形，但 `RightToolId` 和 icon 均为闭合 union，仍是 build-time composition。

### Pi

- `packages/coding-agent/src/core/extensions/types.ts::ExtensionAPI`：扩展契约的单一类型入口，同时限制注册项的结构，并通过 typed event results 区分观察、取消和变换。
- `packages/coding-agent/src/core/extensions/loader.ts::discoverAndLoadExtensions`：定义 global、project、configured path 的发现顺序，并支持 `package.json` 的 `pi.extensions` manifest。
- `packages/coding-agent/src/core/resource-loader.ts::DefaultResourceLoader`：统一资源装配、trust 前后两阶段加载、冲突诊断、来源元数据和 reload。
- `packages/coding-agent/src/core/settings-manager.ts::SettingsManager`：global/project 深合并、文件锁、错误收集、迁移和 memory backend，使配置既可用于产品又可用于 SDK 测试。
- `packages/coding-agent/src/core/provider-composer.ts::composeModelProvider`：Provider 注册不是简单覆盖 Map，而是 built-in、配置覆盖、扩展模型和认证的组合与结构校验。
- `packages/coding-agent/src/core/session-manager.ts::SessionManager`：将会话格式、迁移、树和 context 构建从 UI 中独立出来。
- `packages/coding-agent/src/core/sdk.ts::createAgentSession`：证明核心运行时不依赖 TUI，外部宿主可以注入 settings、session、resources 和 tools。

## Learn / Adapt / Do-not-copy Decisions

### 应直接学习

1. `ResourceLoader` 作为所有 Chat resources 的组合根。
2. global/workspace/session 的明确覆盖顺序和来源追踪。
3. Extension factory + typed lifecycle events + teardown。
4. SessionManager 独立于 React/Electron UI。
5. Provider、Tool、Prompt、Command 等 contribution 的统一来源元数据和 diagnostics。
6. 内核 SDK 与 Electron IPC adapter 分离。
7. 扩展发现、冲突、reload、migration、stale context 的契约测试。

### 应结合 JanusX 改造

1. **Project trust → Workspace trust**：JanusX 已有工作区身份，扩展权限应绑定 workspaceId、真实路径与 trust record，而不是只看 cwd。
2. **TUI UI extensions → Declarative Electron contributions**：首版只允许设置页 schema、命令、状态项、Right Tool metadata 等声明式贡献；不要让第三方 React 直接进入 Renderer。
3. **In-process extensions → Isolated Extension Host**：内建扩展可同进程，第三方代码优先运行在 Electron `utilityProcess`/受限 child process，通过结构化 IPC 调用能力代理。
4. **热重载 → 开发模式能力**：生产环境先支持“停用并重启 host”；开发模式再提供 reload，明确 teardown、超时与 stale handle。
5. **Package manifest → JanusX manifest**：学习资源声明和过滤，但增加 API 版本、权限、完整性、入口进程类型和兼容范围。
6. **Pi Session tree → Janus Chat conversation store**：先解决恢复、命名、归档、迁移和 tool trace；分支/树导航可在后续按产品需求加入。

### 不应照搬

1. Pi 文档明确说明 extension/package 拥有完整系统权限。JanusX 是桌面 GUI 和工作区管理器，用户更可能从 UI 安装扩展，因此不能把“审源码后信任”作为唯一安全模型。
2. 不应在 Electron Main/Renderer 中直接执行任意第三方 `.ts`；这会绕过 context isolation、Agent policy gate 和 Renderer CSP。
3. 不应默认支持 `!command` 解析 API Key。桌面端应优先使用 OS credential vault/keychain，并让 Provider 只拿到短生命周期 secret handle 或解析后的值。
4. 不应第一版复制 Pi 数十种事件和 UI API。过大的 v1 契约会冻结内部实现；应从 Chat/Tool/Provider/Session 的最小稳定事件开始。
5. 不应允许扩展绕过 `WorkspaceAgentRuntime` 直接操作文件。所有外部能力必须经 capability broker、workspace scope、policy、approval 和 audit。

## Proposed Target Architecture

### 目标分层

```text
Renderer (React)
  └─ Janus Chat UI / declarative contribution renderer
       └─ typed preload API
Main Process
  └─ Chat IPC Adapter
       └─ ChatSessionRuntime (UI-agnostic application service)
            ├─ SessionStore / Context & Compaction Policy
            ├─ ModelRuntime / ProviderRegistry
            ├─ ToolRuntime / Policy & Approval Broker
            ├─ Knowledge Middleware
            └─ ExtensionHost Client
Extension Host (isolated for third-party code)
  └─ Manifest + lifecycle + contributions + capability RPC
Storage
  ├─ global settings
  ├─ workspace settings
  ├─ session log/snapshot
  └─ secret references / OS vault
```

核心原则：**ChatSessionRuntime 只依赖协议，不依赖 Electron UI；Renderer 只展示状态和发命令；Extension Host 不能直接获得 Node/Electron 主进程对象。**

### 建议的最小扩展 manifest

```ts
interface JanusExtensionManifestV1 {
  schemaVersion: 1
  id: string
  name: string
  version: string
  engines: { janusx: string; extensionApi: '^1' }
  entry: { main: string; renderer?: never }
  permissions: Array<
    | 'chat.observe'
    | 'chat.transform-context'
    | 'provider.register'
    | 'tool.register'
    | 'workspace.read'
    | 'workspace.write'
    | 'network.fetch'
    | 'settings.secret'
  >
  contributes?: {
    providers?: string[]
    tools?: string[]
    prompts?: string[]
    commands?: string[]
    settings?: string
    panels?: DeclarativePanelContribution[]
  }
}
```

第一版 manifest 的重点不是字段数量，而是让**来源、版本、权限、入口和贡献**在加载代码之前可审查。

### 建议的最小生命周期

```ts
interface JanusChatExtensionV1 {
  activate(ctx: ActivationContext): void | Promise<void>
  onSessionStart?(event: SessionStartEvent): void | Promise<void>
  beforeContext?(event: BeforeContextEvent): ContextPatch | void | Promise<ContextPatch | void>
  beforeToolCall?(event: BeforeToolCallEvent): ToolDecision | void | Promise<ToolDecision | void>
  afterToolResult?(event: AfterToolResultEvent): ToolResultPatch | void | Promise<ToolResultPatch | void>
  onSessionEnd?(event: SessionEndEvent): void | Promise<void>
  deactivate?(): void | Promise<void>
}
```

事件需要按语义分组：

- `observe`：只读，不可改变主流程；错误记录后隔离。
- `transform`：按固定顺序串行合并，必须返回受 schema 限制的 patch。
- `gate`：可 allow/deny/require-approval，必须有 reasonCode 和审计。
- `lifecycle`：有超时、幂等 teardown 和 stale context 保护。

不要提供一个无限能力的通用 `emit(any)` 来修改核心状态。

### 配置作用域与优先级

建议统一为：

```text
built-in defaults
  < global user settings
  < workspace settings
  < session settings
  < one-request overrides
```

每个有效值应可查询：`value + source + scope + schemaVersion`。嵌套对象可深合并，数组默认整体覆盖；只有 manifest 明确声明 `mergeStrategy` 时才做集合合并。

配置至少拆为：

- `model`：provider/model、thinking、sampling、max output、fallback；
- `context`：history/compaction、system prompt resources、knowledge recall；
- `tools`：allowlist、approval profile、step/timeout；
- `network`：proxy、retry、transport、idle timeout；
- `extensions`：enablement、permission grants、per-extension settings；
- `session`：persistence、retention、workspace attachments。

秘密字段只存 secret reference，例如 `secret://janusx/provider/{id}/api-key`；JSON 中不再保存明文 API Key、private key 或 service account JSON。现有明文配置需要单向迁移和回滚说明。

### Provider 设计

保留并演进现有 `ProviderExtension`，但做三点调整：

1. 将 `ExtensionRegistry` 明确重命名为 `ProviderRegistry`；
2. Provider definition 与 Provider credential profile 分离，同一 adapter 可有多个 profile；
3. 增加 schema-driven settings、OAuth/secret resolver、dynamic model refresh、compat metadata 与 source diagnostics。

Provider 注册应进入 Extension Host 的 capability API，最终由 Main Process `ModelRuntime` 组合验证；第三方 Provider 不直接取得 Electron session 或全局 app 对象。

### Tool 设计

沿用 `ToolRegistry + WorkspaceAgentRuntime`，补充：

- `source: builtin | extension:{id}`；
- `requiredPermissions` 与 workspace scope；
- 会话级 active tool allowlist；
- conflict policy（默认拒绝重名，不静默覆盖）；
- extension host RPC executor；
- per-tool timeout/concurrency/output limit；
- register/unregister 与 session snapshot；
- UI 可见的来源、风险、最近错误和授权状态。

这是 JanusX 相比 Pi 最应坚持自身优势的部分。

### Session 设计

建议引入 append-only event log + materialized snapshot：

- message、model selection、workspace attachments、tool call/result、approval、knowledge trace、extension set 和 config snapshot 都有稳定 entry type；
- entry 带 `schemaVersion`、timestamp、source、correlationId；
- SessionStore 支持 memory/file 两种 backend，便于测试；
- 恢复时校验 Provider/Extension 是否仍可用，并产生 diagnostic，而不是静默换模型；
- compaction 是 session policy，不再只是截断最近 24 条消息；
- 扩展私有状态使用 namespaced custom entry，但不能直接进入 LLM context。

### UI 扩展设计

分两阶段：

1. **声明式 UI**：扩展贡献 JSON schema settings、commands、status item、Right Tool metadata、Markdown/structured result renderer。宿主使用内置 React 组件渲染。
2. **隔离 UI**：只有确有需要时才支持 sandboxed webview/iframe，以 message contract 通信；不允许第三方模块 import JanusX Renderer 内部 store/component。

这样既学习 Pi 的 UI extensibility，又不把 React ABI、CSS 和 Electron 权限变成不稳定公共 API。

## Risks & Issues

| Risk Item | Impact | Evidence | Priority |
|---|---|---|---|
| Provider secret 明文 JSON | API Key、Private Key、Service Account JSON 落盘暴露 | `ConfigStore.ts::save`, `ProviderSettings` | High |
| Chat 会话仅内存态 | 重启丢失、无法恢复/迁移/审计上下文 | `useJanusChat.ts::useState/messages` | High |
| IPC handler 过度承担应用逻辑 | 难以 SDK 化、测试替身和扩展中间件化 | `llm-handlers.ts::registerLlmHandlers` | High |
| “ExtensionRegistry” 实际仅 Provider | 概念边界误导，未来易形成第二套同名平台 | `packages/llm-core/.../ExtensionRegistry.ts` | Medium |
| Tool 注册与 Chat tool 暴露硬编码 | 新工具需要改装配与 system prompt | `agent-runtime-handlers.ts`, `workspace-chat-tools.ts` | High |
| 配置版本无显式迁移 | schema 演进可能静默接受不兼容结构 | `ConfigStore.ts::load` 仅浅合并 | High |
| 系统 prompt 是编译期常量 | 无 workspace/persona/resource 组合 | `shared/janus/persona.ts` | Medium |
| UI registry 是闭合 union | 不能由 package 声明贡献 | `right-tools/types.ts`, `registry.ts` | Medium |
| 直接照搬 Pi in-process extension | 可绕过 JanusX policy 与 Electron 边界 | Pi `docs/extensions.md`, `docs/packages.md` 的 full system permissions 警告 | Critical |
| 一次开放过多 hooks | 公共 API 过早冻结，内部重构困难 | Pi `ExtensionAPI` 的巨大表面积仅适合作成熟体系参考 | High |

## Optimization Suggestions

### Phase 0：协议整理与安全止血（建议先做）

1. **建立 Chat Runtime Settings schema**
   - Expected Benefit：把散落常量和 UI state 变成可版本化领域配置。
   - Change Cost：中。
   - Applicable Scope：`shared/ipc/llm.ts`, `main/llm`, Janus Chat settings UI。
2. **引入 SecretStore 并迁移 Provider secrets**
   - Expected Benefit：消除明文凭证风险，为扩展权限打基础。
   - Change Cost：中到高，涉及 Windows/macOS/Linux credential backend 与迁移。
   - Applicable Scope：`ConfigStore.ts`, Provider settings IPC/UI。
3. **将 `ExtensionRegistry` 重命名为 `ProviderRegistry`**
   - Expected Benefit：厘清概念，为真正 Extension Host 让出命名。
   - Change Cost：低。
   - Applicable Scope：`packages/llm-core`。
4. **定义但暂不开放 `JanusExtensionManifestV1`**
   - Expected Benefit：先锁定身份、版本、权限和 contribution 模型，避免先写 loader 后补安全。
   - Change Cost：低。

### Phase 1：抽出可测试的 ChatSessionRuntime

1. 从 `llm-handlers.ts` 抽出 UI/IPC 无关的 Chat application service。
2. 引入 `SessionStore` memory backend 和 file backend，持久化 message/model/tool/knowledge/config snapshot。
3. 将 persona、knowledge、tool history 建成 ordered context contributors。
4. 将固定 tool list 改为 `ToolCatalog -> active allowlist -> AI SDK tools`。
5. 保留现有 IPC 作为 adapter，避免 UI 大改。

**收益**：这是后续扩展、SDK、会话恢复和测试的共同前置；也是最有价值的一阶段。  
**风险**：Context 顺序和 tool trace 重放语义不能在重构中改变，需要 golden tests。

### Phase 2：内部 Extension Host

1. 先只支持仓库内置 extension factories，不做第三方安装。
2. 开放最小事件：session start/end、before context、before tool、after tool、provider register。
3. 引入 contribution source、collision diagnostics、enablement 和 config scopes。
4. 把 Knowledge、built-in workspace tools、persona contributor 迁成内部扩展，验证 API 是否足够。
5. 增加 reload/teardown/stale context/timeout 测试，但生产 UI 可暂不提供热重载。

**收益**：用 JanusX 自己的模块检验扩展协议，避免用假想第三方需求设计超大 API。  
**风险**：如果内部模块享有隐式特权，API 会失真；应明确哪些是 host-only capability。

### Phase 3：受控第三方扩展平台

1. 独立 utility process/child process Extension Host。
2. Manifest 预检、workspace trust、权限授权、版本兼容与完整性记录。
3. 支持 local directory 与 pinned package；npm/git gallery 和自动更新最后做。
4. 首版仅声明式 UI contribution。
5. 提供 Extension SDK、模板、契约测试套件和诊断页。

**收益**：形成真正的生态能力。  
**风险**：安装、依赖、签名、跨平台 sandbox 和升级是独立产品，不应夹带在 Phase 1 中一次完成。

## Recommended Ownership

| Workstream | Suggested JanusX Ownership |
|---|---|
| ChatSessionRuntime / context pipeline | `src/main/llm`，成熟后考虑 `packages/chat-core` |
| Provider SPI / model runtime | `packages/llm-core` |
| Tool capability broker | `src/main/agent/runtime` |
| Extension manifest/contracts | `src/shared/extensions` 或独立 workspace package |
| Extension host process | `src/main/extensions` |
| Session store | `src/main/chat/session`，接口可放 shared package |
| Settings scopes/migrations | `src/main/config` + shared schemas |
| Declarative contribution renderer | `src/renderer/src/extensions` |
| Diagnostics/tests | `tests/unit/extensions`, `tests/e2e/desktop-*` |

## Decision Records / Open Questions

以下问题需要在实施 PRD 前确认：

1. JanusX 的目标扩展作者是“官方内部模块”“高级本地用户”，还是公开 Marketplace 开发者？三者决定隔离和兼容成本。
2. Workspace settings 是否写入项目目录并参与 Git，还是只在 JanusX userData 中按 workspaceId 保存？建议支持两种，但团队共享配置必须经过 trust。
3. Chat session 是否包含敏感源码片段并默认持久化？需要 retention、加密和用户可见的清理策略。
4. 第三方 Provider 的自定义网络实现是否允许在 Extension Host 中运行，还是只能声明 endpoint/compat 由 Main Process 统一发请求？建议首版后者。
5. 是否真的需要第三方 UI 代码？如果没有明确用例，长期保持声明式 UI 会显著降低维护成本。
6. 扩展安装是否属于近期产品目标？如果不是，Phase 1/2 仍然很有价值：它们能降低内部耦合并提升 Chat 专业度。

## Conclusion & Next Steps

- **Conclusion**：JanusX Chat 完全可以学习 Pi，而且当前 Provider SPI、Tool Runtime 和安全策略已构成很好的演进基础。真正需要补齐的是统一 Chat Session、Settings scopes、ResourceLoader、Extension lifecycle 和 SDK；不需要重写现有 Electron UI，也不应牺牲 JanusX 已有的工作区安全边界。
- **Recommended Priority Actions**：
  1. Phase 0：Chat Settings schema + SecretStore + manifest 草案；
  2. Phase 1：从 IPC/React 中抽出 `ChatSessionRuntime` 和 `SessionStore`；
  3. Phase 2：用 Knowledge、persona、workspace tools 三个内部模块验证 Extension API；
  4. Phase 3：确认生态目标后再做隔离宿主和 package 安装。

如果只选择一个最先落地的动作，应选择 **ChatSessionRuntime + SessionStore**。它同时解决会话专业度、配置归属、上下文组合、扩展挂载和可测试性，是所有后续设计的最短公共路径。

## Source References

### JanusX

- `packages/llm-core/src/core/types.ts`：`ProviderSettings`, `ProviderExtension`, `ModelInfo`
- `packages/llm-core/src/core/ExtensionRegistry.ts`：Provider 注册表
- `packages/llm-core/src/core/ProviderFactory.ts`：模型创建和缓存
- `src/main/llm/LlmService.ts`：built-in adapter 装配
- `src/main/llm/ConfigStore.ts`：Provider 全局 JSON 持久化
- `src/main/llm/ModelCatalogService.ts`：模型目录缓存与刷新
- `src/main/ipc/llm-handlers.ts`：Chat orchestration、knowledge、tools、stream
- `src/main/llm/workspace-chat-tools.ts`：Chat tools 和系统能力提示
- `src/main/agent/runtime/registry.ts`：`ToolRegistry`
- `src/main/agent/runtime/runtime.ts`：`WorkspaceAgentRuntime`
- `src/main/agent/runtime/policy-gate.ts`：风险、敏感路径与脱敏
- `src/main/ipc/agent-runtime-handlers.ts`：built-in tool 装配
- `src/renderer/src/components/janus/useJanusChat.ts`：Renderer Chat state/session
- `src/renderer/src/components/LlmConfigModal.tsx`：Provider 设置 UI
- `src/renderer/src/right-tools/registry.ts`：Renderer registry 雏形
- `src/shared/janus/persona.ts`：固定 persona

### Pi

- `packages/ai/src/index.ts`：side-effect-free core 和子路径分层说明
- `packages/agent/src/harness/agent-harness.ts`：UI 无关 Agent Harness hooks
- `packages/coding-agent/src/core/extensions/types.ts`：`ExtensionAPI` 和 typed events
- `packages/coding-agent/src/core/extensions/loader.ts`：extension discovery/factory/runtime state
- `packages/coding-agent/src/core/extensions/runner.ts`：运行时绑定和事件执行
- `packages/coding-agent/src/core/resource-loader.ts`：统一资源加载与 trust 流程
- `packages/coding-agent/src/core/settings-manager.ts`：scope、merge、migration、storage
- `packages/coding-agent/src/core/provider-composer.ts`：Provider composition
- `packages/coding-agent/src/core/model-registry.ts`：模型注册兼容 facade
- `packages/coding-agent/src/core/session-manager.ts`：会话格式和迁移
- `packages/coding-agent/src/core/sdk.ts`：`createAgentSession` 等 SDK 入口
- `packages/coding-agent/docs/extensions.md`：扩展协议和生命周期
- `packages/coding-agent/docs/settings.md`：global/project settings
- `packages/coding-agent/docs/packages.md`：package manifest、scope、安装和安全警告
- `packages/coding-agent/docs/custom-provider.md`：Provider/OAuth/custom stream
- `packages/coding-agent/test/resource-loader.test.ts`：trust、优先级、冲突和 reload 契约
- `packages/coding-agent/test/extensions-runner.test.ts`：event/provider/tool runtime 契约

