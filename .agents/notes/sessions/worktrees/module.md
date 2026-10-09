---
{
  "schema": "harness-note/2",
  "id": "35d88be6-50e5-466b-9514-9ecd7ac8ba7e",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T09:06:56.496Z",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662",
  "moduleState": "partial",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/git/worktrees.ts",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/ipc/worktree-handlers.ts",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/features/workspace/actions.ts",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/stores/worktree.ts",
      "role": "implementation"
    }
  ]
}
---

# 工作树隔离与切换

## Responsibility

管理 Git worktree 的发现、创建、删除、Ship 合并，以及活动工作树对终端、文件树和界面状态的作用范围。工作区保留工程注册身份。

## Design

工作树从本地 Git 事实读取，路径归一后再作为选择和缓存键；切换只改变有效目录及对应视图。创建、删除、合并和推送保持各自明确操作。会话与快照通过作用目录和 sessionId 协作，不复制它们的持久化职责。
