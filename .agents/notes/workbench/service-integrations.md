---
{
  "schema": "harness-note/2",
  "id": "bd06538e-063f-4de8-a3da-11b0dccd41d5",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-14",
  "updated": "2026-10-14T02:01:00Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c",
  "relations": [
    { "type": "related-to", "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/96a2f5cd-166e-4982-a444-7640858f0a5f" },
    { "type": "related-to", "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/80e8b427-d263-42f4-b7cd-8313548c9e2a" }
  ]
}
---

# 服务集成与 CPA 账号管理复用

## Intent

探索在 JanusX 接入账号服务、CLIProxyAPI（CPA）和 Figma。用户当前只要求记录，不启动实现。方向是增强工具连接、配置和工作台入口，保留原 CLI 的会话管理、交互和执行逻辑；不以统一聊天界面覆盖各 Harness 的原生能力。

优先考虑复用 CPA 的账号管理、OAuth 登录、路由与其管理界面提供的查询能力，暂缓自建完整账号面板。JanusX 第一批候选职责为配置 CPA 实例地址与访问凭据、检查连接状态、连接兼容模型 API，以及打开既有管理页。若后续需要额度摘要，优先从已连接 CPA 的可用管理接口读取，不重新维护同一批账号及刷新令牌。模型调用凭据和管理凭据分别保存、分别使用。

CPA 只覆盖接入该实例的账号与调用。CLI 直接使用自己的登录时，不能假定 CPA 已观察到其身份、请求或额度。只有出现不经 CPA 的账号需求，或工作台确实需要跨实例、跨服务摘要时，再评估只读账号视图。

Figma 作为独立服务集成候选：工作台承担连接状态、设计文件关联和打开入口；Agent 读取设计或执行操作需另行核对所选 API/MCP 能力及各 CLI 的接入方式。CPA 的模型网关与账号管理不替代 Figma 授权。

先以内部集成接口验证实际需求，再评估第三方插件开放。不同集成按实际能力声明配置、状态查询、操作入口及工具接入，不要求全部实现 Harness 会话协议。此探索关联既有 [插件架构提案](./requirements/plugin-architecture-forms.md) 与 [插件导入和调试提案](./requirements/plugin-import-debug.md)，不改写其未完成验收或授权边界。

## Reference and limits

参考 CodexHost 提交 `1aa9f65d6abf8f15b3a390f10de0b97ad85ae847` 的 [账号设计](https://github.com/BytePioneer-AI/codex-host/blob/1aa9f65d6abf8f15b3a390f10de0b97ad85ae847/docs/product/codex-accounts.md)：当前原生 Codex 登录仍由官方管理，账号页展示身份与额度，并允许将兼容本地授权一次性复制到 Pi 的独立 Provider。凭据复制不是持续同步，共用 refresh token 的多个客户端可能互相影响登录；此实现不作为 JanusX 必须复制凭据的需求。

只读查看 CPA 提交 `0d18d3b365be000eeaee7de4615f9da596b2059d` 的 [项目说明](https://github.com/router-for-me/CLIProxyAPI/blob/0d18d3b365be000eeaee7de4615f9da596b2059d/README_CN.md)，其中提供 [管理 API 文档入口](https://help.router-for.me/cn/management/api)，并列出多个用量或额度管理前端。尚未部署 CPA 或核对具体管理接口；调用用量统计不等同于供应商剩余订阅额度，额度查询的供应商覆盖与所选前端/版本需在实施前确认。

## Open questions

- 首先连接用户已有 CPA，还是由 JanusX 托管本地实例？进程和升级由谁管理？
- 复用哪个 CPA 管理前端？哪些查询是核心能力，哪些属于前端或第三方扩展？
- 第一批仅打开管理页，还是需要工作台内的只读状态与额度摘要？
- Figma 第一批工作流是什么，所选 API/MCP 如何与用户的 CLI 配置配合？

