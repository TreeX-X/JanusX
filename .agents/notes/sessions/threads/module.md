---
{
  "schema": "harness-note/2",
  "id": "0fc34aee-911c-44f3-b873-a1272d93631a",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T09:06:56.496Z",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662",
  "moduleState": "partial",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/harness/task-thread.ts",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/janus/janusChatConversations.ts",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/janus/useJanusChat.ts",
      "role": "implementation"
    }
  ]
}
---

# 项目对话与任务线程

## Responsibility

维护项目对话的身份与激活，以及 Task run 关联线程的持久化和恢复上下文。线程保存交互连续性，Task、run 与回执仍是正式执行事实。

## Design

项目会话按工作区及 viewRef 绑定，普通节点选择不重新创建对话；蓝图专用生命周期见 [行为与验收](../../blueprint/maintenance/tasks/blueprint-workspace-dialog.md)。Task 线程从本地 run 与 thread.json 派生列表，不建立第二份执行索引。执行与评估入口由 Agent 对话与执行模块负责，只有 Main 维护 Task 文档。
