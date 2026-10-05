---
schema: harness-note/1
id: 24617149-0dfb-498e-96a6-c0fe23ea90b3
kind: initiative
lifecycle: proposed
created: 2026-10-04
class: feature
tags: [harness, agentX, janus, blueprint, onboarding]
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/bd7fd0c6-48d1-4d1c-8c6b-b675d7e489bd
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b69b7ec5-cbf6-4242-bd29-3b48703979c5
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/4f49c9ba-45cf-4fee-9f5b-343852512fc7
---

# Janus 生态 Note 链路整体优化：共享能力、工作区蓝图与项目配置

## Goal

agentX 拥有通用工程能力和默认执行的 WorkflowX，Janus 复用并叠加产品扩展。蓝图按 Janus 工作区完整展示，让空工作区可以初始化、已有项目可以起草 Note、失败有明确原因。外部工具配置管理作为后续工作，不阻塞项目蓝图使用。

## Scope

范围包含共享能力、工作区切换与初始化生成，以及后续项目配置管理。Janus 扩展不分叉底层实现与 frontmatter 契约。打开工作区不自动初始化，不包含任意格式解析、无确认批量生成或一工作区多蓝图选择。

交付顺序：

1. [agentX 共享底座](./2026-10-04-agentx-harness-inheritance--bd7fd0c6.md)：已落地通用工具、MCP、脚本、Note 与 WorkflowX 复用，Janus 保留独立产品扩展。
2. [工作区切换与初始化生成](./2026-10-04-blueprint-empty-init--4f49c9ba.md)：工作区完整列表、逐工作区状态、初始化预览撤销及 Janus 起草入口。只依赖共享底座。
3. [启动与设置中的项目配置管理](./2026-10-04-workflowx-onboarding--b69b7ec5.md)：后续提案。旧维护者档位与提醒设计需依据内置 WorkflowX 重新明确，不作为蓝图切换和初始化的前置。

纪律面收紧与接入提醒需另行明确范围；当前不将提醒安装或开启 WorkflowX 作为产品要求。

## Acceptance criteria

- [x] AC-1: 共享能力提供初始化接口，蓝图切换与初始化生成独立于启动和设置流程交付。
- [ ] AC-2: 空工作区 7 日内首 Note 率与起草提案采纳率可度量且 rising。
- [ ] AC-3: 三篇子 Note 的 AC 全部关闭，本 initiative 方可验收。
