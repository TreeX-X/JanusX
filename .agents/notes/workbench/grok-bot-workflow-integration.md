---
{
  "schema": "harness-note/2",
  "id": "a0aff1c6-1959-4053-945b-e4e46b7d1488",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-11",
  "updated": "2026-10-11T05:46:37.000Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Grok Bot 与 JanusX 工作流衔接

## Intent

用户希望接入的 Grok Bot 是具有持久云端电脑、可定时执行任务的常驻 Agent，不是 Grok 聊天网页或 Grok 模型 API。JanusX 作为本地项目、worktree、终端和审查工作台，应优先让 Bot 获取受控的工作上下文与交付入口，而非假设能把官方 Bot 界面嵌进应用。低开发量路径是先使用 Grok Bot 官方 Windows 客户端及现成连接器（例如 GitHub），再验证是否需要 JanusX 专用 MCP 或服务。

Bot 的云端电脑与本机分离：本机命令执行需要单独授权，电脑关闭后不能依赖它访问本机 JanusX。JanusX 现有本机 stdio MCP 也不能直接假定云端 Bot 可连接；真正全天候可用的上下文入口需要云端可达且限定权限。xAI 模型 API 不等于 Grok Bot 会话或任务控制 API。2026-10-11 查阅的官方文档未给出可直接嵌入完整 Bot 界面或由 JanusX 管理 Bot 会话的公开接口，后续需复查产品能力。

参考：[Grok Bot 概览](https://docs.x.ai/grok-bot/overview)、[应用与云端电脑](https://docs.x.ai/grok-bot/computer-and-apps)、[本机执行权限](https://docs.x.ai/grok-bot/approvals-security-and-privacy)。

## Open questions

- Bot 首先要读取哪些 JanusX 上下文：当前项目、Notes、任务状态或其他内容？哪些动作允许写入？
- GitHub 等现成连接器能否覆盖第一批工作流，何时才需要专用远程 MCP？
- 官方是否提供稳定的 Bot 会话 API、深链或网页客户端，足以支持更直接的 JanusX 入口？
