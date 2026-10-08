---
{
  "schema": "harness-note/2",
  "id": "a09981f4-1a94-42ce-9255-2e1127cfa37b",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T09:06:56.496Z",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd",
  "moduleState": "partial",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/blueprint/BlueprintMaintenancePanel.tsx",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/harness/note-chat.ts",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/harness/maintenance-apply.ts",
      "role": "implementation"
    }
  ]
}
---

# 蓝图维护对话

## Responsibility

承接蓝图讨论、Note 工具调用、修改预览与批准、撤销和实施简报。范围、展示意图和写入权限分别维护，普通访问和关注变化不授权写入。

## Design

复用 JanusChat 的会话和流式能力，以及 agentX 的 Note 编辑与事务。维护任务绑定来源、工作区和提案版本，审批展示真实文件改动；继续讨论可以使旧稿失效。对话线程生命周期见 [职责入口](../../sessions/threads/module.md)，画布关注与定位见 [职责入口](../navigation/module.md)。执行 Task 和独立评估仍由 Agent 对话与执行模块负责。
