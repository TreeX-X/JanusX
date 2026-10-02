---
schema: harness-note/1
id: cb4d82c5-d02d-4c2e-a761-13f85e204e71
kind: task
lifecycle: accepted
created: 2026-10-02
class: feature
tags: [blueprint, janus-chat, approval, testing]
relations:
  - type: implements
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/9c426f18-8b3e-49d7-96d1-36acbe174802
    criteria: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7]
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [src/main/janus/maintenance/service.ts, src/main/llm/chat-orchestrator.ts, src/renderer/src/components/blueprint/, src/renderer/src/components/janus/, src/renderer/src/i18n/, tests/e2e/, tests/unit/blueprint-maintenance-harness-routing.test.ts, .agents/notes/]
  acceptanceRefs:
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/9c426f18-8b3e-49d7-96d1-36acbe174802
      criterionId: AC-1
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/9c426f18-8b3e-49d7-96d1-36acbe174802
      criterionId: AC-2
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/9c426f18-8b3e-49d7-96d1-36acbe174802
      criterionId: AC-3
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/9c426f18-8b3e-49d7-96d1-36acbe174802
      criterionId: AC-4
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/9c426f18-8b3e-49d7-96d1-36acbe174802
      criterionId: AC-5
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/9c426f18-8b3e-49d7-96d1-36acbe174802
      criterionId: AC-6
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/9c426f18-8b3e-49d7-96d1-36acbe174802
      criterionId: AC-7
  verification:
    - id: V-1
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, typecheck:strict-unused]
---

# 蓝图文档审核循环实施

## Goal

落实[持续讨论需求](./2026-10-02-blueprint-review-conversation-loop--9c426f18.md)的 AC-1 至 AC-7，并通过浏览器和真实临时 Note 事务验证闭环。

## Scope

实现采用[主动作栏](./2026-09-30-blueprint-action-bar--8b40c7d2.md)的同栏审核视图与[文件审批](./2026-09-29-blueprint-maintenance-approval-gap--a1b2c3d4.md)的宿主预览事务。范围包括控制器整理请求、原文上下文传递、审核呈现与测试；手工编辑草稿和真实供应商质量评估不在本任务范围。

## Acceptance criteria

验收引用为 work.acceptanceRefs 中的 AC-1 至 AC-7；实现时冻结的需求文件原始字节 SHA-256 为 d657cd997c47f0b6241566c2da4e66f07d6f089faa358876269122f1e989ae2d，条款编号及含义保持不变。

## Alternatives considered

直接保留聊天结果能减少修改，但不能交付突出的审核文档。独立聊天引擎会复制流式、模型和错误处理；实现复用控制器传输，并将审核显示状态与讨论历史分开。具体交互取舍由上述两篇决策持有。

## Verification

2026-10-02：相关单元测试累计 72 个不同用例通过。六文件首轮 71 项通过；新增原文竞态和预算用例后，maintenance-harness-routing 与 chat-turn-guard 共 39 项复验通过。真实临时 Note 测试覆盖旧预览失效、再次生成、连续两轮预览与批准、写入字节一致、第二轮原文和哈希更新，以及上下文读取后源漂移与预算失败零写入。

```text
npx vitest run tests/unit/blueprint-maintenance-harness-routing.test.ts tests/unit/maintenance-harness-apply.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/janus-chat-conversations.test.ts tests/unit/blueprint-bulk-approval.test.ts tests/unit/blueprint-maintenance-service.test.ts
```

38 项浏览器用例全套通过，覆盖两条讨论整理审批循环、纯浏览保留预览、整理不增加问答历史、失败重试、取消与无变更、部分批准、过期源、工作区切换，以及 1440×900 和 1280×720 下长文滚动后输入框与切换入口可达。浏览器运行生产 React 和控制器，模型及 IPC 使用测试替身。

```powershell
$env:NO_PROXY='127.0.0.1,localhost'
$env:JANUS_E2E_PORT='41908'
npx playwright test tests/e2e/blueprint-maintenance.spec.ts tests/e2e/blueprint-workbench.spec.ts tests/e2e/project-conversation.spec.ts --workers=2
```

## Results

2026-10-02：实现与自动化闭环完成。typecheck、typecheck:strict-unused、build 与 i18n:check 通过；变更源码 ESLint 无错误，JanusChat 既有圆桌文案有 4 项中文硬编码警告，测试文件按仓库配置不参与 ESLint。git diff --check 无空白错误。全库 Note 检查仍受 dsh-integration.md 的 6 项既有格式错误阻断，本任务的四篇 Note 单独无结构或链接错误。

1280×720 的审核截图已人工检查，完整正文、差异与批准操作可读，输入框保持可见；两种尺寸的长文滚动和顶部切换由浏览器断言验证。真实模型供应商未调用，不能据测试替身推断生成质量。审核展示完整待写入 Markdown，用户通过继续对话修订草稿。
