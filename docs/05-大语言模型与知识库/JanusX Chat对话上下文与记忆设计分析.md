# JanusX Chat 对话上下文与记忆设计分析

> 分析日期：2026-07-31  
> 分析范围：全局 JanusX Chat、工作区 Chat 面板、运行配置窗口内置 Janus、工具轨迹与知识召回  
> 文档性质：当前代码现状分析与后续演进参考，不代表已完成的目标架构

## Overview

- **项目目标**：确认 JanusX Chat 是否具有对话上下文设计，区分短期历史、跨界面共享、工具上下文与长期知识记忆。
- **技术栈**：React Context、Electron IPC、AI SDK、Workspace Agent Runtime、JanusX Knowledge Engine。
- **核心结论**：
  - 全局 JanusX Chat 已具备真实的多层上下文能力。
  - 运行配置窗口内置 Janus 具有窗口生命周期内的短期上下文，但不与全局 Chat 共享消息历史。
  - 当前长期能力属于“受治理的知识召回”，不是完整聊天记录持久化与恢复。

## Engineering Structure & Module Responsibilities

| 模块 | 主要职责 | 关键文件 |
|---|---|---|
| 全局 Chat 状态 | 保存消息、流式状态、模型选择、工具轨迹和工作区资源 | src/renderer/src/components/janus/useJanusChat.ts |
| Chat 状态共享 | 让灵动岛、标题栏和中部工作区 Chat 使用同一个控制器 | src/renderer/src/components/janus/JanusChatProvider.tsx |
| Chat UI | 展示消息、输入历史、清空、重试和审批状态 | src/renderer/src/components/janus/JanusChat.tsx |
| 主进程 Chat 管线 | 拼装知识召回、工具说明、工具轨迹并调用模型 | src/main/ipc/llm-handlers.ts |
| 工作区工具集 | 文件、项目配置和项目进程工具 | src/main/llm/workspace-chat-tools.ts |
| 知识上下文 | 从正式事实、Wiki 和知识图谱中检索上下文 | src/main/knowledge/context-service.ts |
| 对话证据存储 | 保存用户和助手回合为 observation | src/main/knowledge/observation-service.ts |
| 运行配置内置 Janus | 保存窗口内消息，拼装工程分析、配置和进程上下文 | src/renderer/src/services/workspace-launch-assistant.ts |

## Core Implementation & Workflow

### 1. 全局 JanusX Chat 的上下文拼装

每次发送消息时，上下文大致按以下顺序组成：

~~~text
Janus 人格 System Prompt
+ 工作区工具能力与限制
+ 最近的工具调用轨迹
+ 工作区正式知识召回结果
+ 最近 24 条用户/助手消息
+ 当前用户消息
~~~

当前容量限制：

| 上下文类型 | 限制 | 代码位置 |
|---|---:|---|
| 前端保留消息 | 200 条 | useJanusChat.ts / MAX_CHAT_MESSAGES |
| 发送给模型的消息历史 | 24 条 | useJanusChat.ts / HISTORY_MESSAGE_LIMIT |
| 前端工具轨迹 | 48 条 | useJanusChat.ts / MAX_TOOL_TRACES |
| 主进程注入工具轨迹 | 24 条 | llm-handlers.ts / TOOL_TRACE_MAX_ENTRIES |
| 知识召回结果 | 5 项 | llm-handlers.ts / JANUS_CHAT_MAX_ITEMS |
| 知识召回字符预算 | 3000 字符 | llm-handlers.ts / JANUS_CHAT_MAX_CHARS |
| 单轮工具调用步数 | 12 步 | llm-handlers.ts / CHAT_MAX_STEPS |

### 2. 跨界面共享

JanusChatProvider 包裹主应用，内部只创建一个 useJanusChat controller。

因此以下界面共享同一组消息与流式状态：

- 顶部灵动岛 Janus Chat。
- 展开态 Janus Chat。
- 中部工作区 Janus Chat Pane。

切换展示形态不会创建新会话，也不会因为某个 Chat 视图卸载而清空消息。当前语义更接近“整个 JanusX 应用一条全局对话”，而不是“每个工作区一条独立对话”。

### 3. 普通消息历史

全局 Chat 将用户和助手消息保存在 React 内存状态中。

发送新消息时，取最近 24 条历史，再显式追加当前用户消息。由此支持代词指代、连续追问和基于前文约束继续执行。

示例：

~~~text
用户：这个项目虽然检测为 CMake，但实际通过 scripts/start.cmd 启动。
用户：那帮我生成开发配置。
~~~

第二轮能够通过普通消息上下文理解“那”指向上一轮描述的启动方式。

### 4. 工具调用上下文

工作区文件读取、配置生成、配置应用和进程操作等工具结果，会被压缩成 ChatToolTraceEntry。

下一轮主进程将最近工具轨迹转换为 System Message，使模型能保留：

- 调用了哪个工具。
- 工具属于哪个工作区。
- 操作是否成功。
- 读取或修改了哪些路径。
- 检查点、文件哈希或运行状态摘要。

工具轨迹只保存摘要，不保存完整工具输出。文件哈希可能过期，因此提示词要求编辑前重新读取文件。

### 5. 工作区知识召回

每轮全局 JanusX Chat 都会用最新用户消息查询知识上下文。

召回范围是 truth 层：

- 已接受的 Memory Fact。
- 已发布的 Wiki 页面。
- 已接受的知识图谱边。

召回结果作为不可信参考材料插入 System Message，文件内容或知识内容不能反向充当系统指令。

### 6. 对话观察记录与长期知识

当 Chat 绑定了有效工作区资源时，主进程会把用户消息和助手回复写入 observation：

- source: janus-chat
- type: conversation-turn
- retentionClass: evidence

但是 Chat 召回只查询 truth 层，原始 observation 不会直接进入下一次对话。

完整长期链路是：

~~~text
对话回合
  -> observation 证据
  -> 知识提取候选
  -> 人工或治理流程审核
  -> 正式 Fact / Wiki / Graph
  -> 后续 Chat 召回
~~~

因此当前实现是“受治理的长期知识”，不是“保存全部聊天记录并在下次启动时恢复原会话”。

### 7. 运行配置窗口内置 Janus

运行配置助手是一条独立会话路径：

- 消息保存在 ProjectLaunchAssistant 组件本地状态。
- 每轮只发送最近 8 条对话历史。
- 同时传入工程检测、文件摘要、当前配置和运行进程。
- 支持 none、save、test、run、stop 动作。
- 关闭运行配置窗口后，本地消息状态丢失。
- 不与全局 JanusChatProvider 共享消息数组或工具轨迹。

该助手以 sourceTag: janus-chat 和 workspaceId 请求模型，因此可以查询工作区正式知识。但请求未提供 workspacePath 或可信 Workspace Resource，当前回合不会进入主进程的 observation 捕获目标。

## Key Code Interpretation

- **useJanusChat.ts / messages**：全局 Chat 的内存消息源。
- **useJanusChat.ts / messagesRef.current.slice(-24)**：实际进入模型的普通历史。
- **useJanusChat.ts / toolTracesRef**：跨轮次工作区工具摘要。
- **JanusChatProvider.tsx**：全局 Chat 跨视图共享的根节点。
- **llm-handlers.ts / prepareJanusChatRecall**：按最新用户问题查询知识。
- **llm-handlers.ts / toolTraceHistoryMessage**：将历史工具调用转换为模型上下文。
- **llm-handlers.ts / knowledgeObservationService.capture**：将对话回合记录为证据。
- **context-service.ts / layer: truth**：限制 Chat 只召回已治理的正式知识。
- **workspace-launch-assistant.ts / history.slice(-8)**：运行配置助手的短期历史窗口。

## Risks & Issues

| 风险项 | 影响 | 证据 | 优先级 |
|---|---|---|---|
| 全局消息不持久化 | 重启 JanusX 后当前对话消失 | messages 仅为 React state | High |
| 两套 Chat 历史分离 | 运行配置助手无法继承全局 Chat 已确认的用户意图 | 两套独立 state/controller | High |
| 单一全局会话绑定多个工作区 | 项目 A 与项目 B 的普通消息上下文可能混合 | App 级单例 Provider | High |
| 多工作区知识召回降级 | 无法确定唯一工作区时可能返回 missing-workspace | Recall 要求 workspace scope | Medium |
| 按消息条数而非 token 裁剪 | 少量超长消息仍可能超出模型上下文 | 固定 24 条历史 | Medium |
| 清空 UI 不等于遗忘 | clear 清空消息和工具轨迹，但不删除 observation | UI 状态与知识存储分离 | Medium |
| 工具轨迹只有摘要 | 复杂工具结果在下一轮可能缺少关键细节 | ChatToolTraceEntry.summary | Medium |
| 运行配置 Chat 关闭即丢失 | 用户再次打开配置窗口无法继续原对话 | 组件本地 state | Medium |
| 对话证据不会自动召回 | 未提取和审核的信息不能成为长期记忆 | Recall 仅查询 truth | Low，属于治理设计 |

## Optimization Suggestions

### 1. 建立统一 ConversationStore

- **建议**：按 conversationId 持久化消息、模型、工具轨迹、工作区绑定和领域状态。
- **预期收益**：支持跨重启恢复，并让全局 Chat 与运行配置 Chat 选择共享同一会话。
- **改造成本**：中高。
- **适用范围**：全局 Chat、工作区 Pane、运行配置助手。

建议数据至少包含：

- 会话 ID、标题和领域类型。
- 绑定的 workspaceIds。
- 持久化消息。
- 工具轨迹。
- 当前模型。
- 创建时间和更新时间。

### 2. 按工作区隔离会话

- **建议**：默认一个工作区一条活动会话，多工作区对话必须显式创建。
- **预期收益**：减少不同项目约束和文件上下文互相污染。
- **改造成本**：中。
- **适用范围**：工作区切换、资源绑定、知识召回。

### 3. 引入 token 预算与历史压缩

- **建议**：不要只按 24 条裁剪；按模型上下文预算保留最近消息，并将较早内容总结为结构化会话状态。
- **预期收益**：长对话更稳定，用户约束不容易因窗口裁剪丢失。
- **改造成本**：中。

建议结构化摘要至少包含：

- 用户已确认约束。
- 项目和运行方式。
- 已完成动作。
- 当前运行进程。
- 待解决事项。
- 不允许再次尝试的审批拒绝。

### 4. 统一运行配置助手

- **建议**：将运行配置 Janus 作为统一 ConversationStore 的领域视图，而不是独立消息容器。
- **预期收益**：用户可以先在全局 Chat 说明项目启动方式，再进入配置窗口继续操作。
- **改造成本**：中。

### 5. 区分“清空”和“遗忘”

建议拆分为三个明确动作：

1. 清空当前视图消息。
2. 删除持久化 Conversation。
3. 删除或撤销由该 Conversation 产生的知识证据。

避免用户点击“清空对话”后误以为系统已经删除长期知识记录。

## Conclusion & Next Steps

- **结论**：全局 JanusX Chat 已有短期消息、跨界面共享、工具轨迹和正式知识召回，是实际存在的多层上下文设计。
- **限制**：当前没有持久化会话，运行配置助手与全局 Chat 历史分离，工作区级会话隔离也未完成。
- **推荐优先级**：
  1. 实现按工作区持久化的统一 ConversationStore。
  2. 将运行配置助手接入统一会话。
  3. 用 token 预算和结构化摘要替代单纯的消息条数裁剪。
  4. 明确清空会话与删除知识证据的产品语义。

