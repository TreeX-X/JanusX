---
{
  "schema": "harness-note/2",
  "id": "24617149-0dfb-498e-96a6-c0fe23ea90b3",
  "kind": "requirement",
  "lifecycle": "proposed",
  "created": "2026-10-04",
  "class": "feature",
  "tags": ["harness","agentX","janus","blueprint","onboarding"],
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/bd7fd0c6-48d1-4d1c-8c6b-b675d7e489bd"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/b69b7ec5-cbf6-4242-bd29-3b48703979c5"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/4f49c9ba-45cf-4fee-9f5b-343852512fc7"}
  ],
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---

# Janus 生态 Note 链路整体优化：共享能力、工作区蓝图与项目配置

## Expected behavior

agentX 拥有通用工程能力和默认执行的 WorkflowX，Janus 复用并叠加产品扩展。蓝图按 Janus 工作区完整展示，让空工作区可以初始化、已有项目可以起草 Note、失败有明确原因。外部工具的 WorkflowX 导入状态在 Island 监控中展示，不阻塞项目蓝图使用。

## Scope

范围包含共享能力、工作区切换与初始化生成，以及外部工具配置检测。Janus 扩展不分叉底层实现与 frontmatter 契约。打开工作区不自动初始化，不包含任意格式解析、无确认批量生成或一工作区多蓝图选择。

交付顺序：

1. [agentX 共享底座](../agentx-harness-inheritance.md)：已落地通用工具、MCP、脚本、Note 与 WorkflowX 复用，Janus 保留独立产品扩展。
2. [工作区切换与初始化生成](../workspaces/requirements/blueprint-empty-init.md)：工作区完整列表、逐工作区状态、初始化预览撤销及 Janus 起草入口。只依赖共享底座。
3. [Island 中的 WorkflowX 导入检测](../workspaces/requirements/workflowx-onboarding.md)：通用界面自动合并全局与工作区 Claude/Codex 配置状态，监控页低调展示并提供来源、重新检测和仓库跳转，不作为蓝图切换和初始化的前置。

纪律面收紧与自动安装不在当前范围；导入检测只识别外部开发工具的配置，不证明实际执行或 Note 维护成功。

## Acceptance criteria

- [x] AC-1: 共享能力提供初始化接口，蓝图切换与初始化生成独立于启动和设置流程交付。
- [ ] AC-2: 空工作区 7 日内首 Note 率与起草提案采纳率可度量且 rising。
- [ ] AC-3: 三篇子 Note 的 AC 全部关闭，本 initiative 方可验收。
