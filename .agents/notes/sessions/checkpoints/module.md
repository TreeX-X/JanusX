---
{
  "schema": "harness-note/2",
  "id": "984f67da-38f0-455e-8903-2b0083c5b533",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-14T14:19:33.199Z",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662",
  "moduleState": "partial",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/ipc/checkpoint-handlers.ts",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/stores/checkpoint.ts",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/shared/ipc/checkpoint.ts",
      "role": "implementation"
    }
  ]
}
---

# 会话检查点

## Responsibility

维护底层会话检查点创建、读取、差异、保留期及恢复 IPC。快照引擎复用 agentX，Janus 负责会话绑定与服务接口；会话管理界面已移除还原点呈现及操作，既有数据与终端、知识模块调用保留。

## Design

记录只观察，不静默修改工作树；恢复要求用户明确操作。计数、列表和回合关联共享 sessionId，数量与时间双上限约束存储。会话界面只查阅对话与续接，不调用检查点服务，交互见 [职责入口](../records/module.md)；工作树创建、合并与删除见 [职责入口](../worktrees/module.md)。

## Related documents

[Session checkpoint expand panel](session-checkpoint-expand.md) 维护展开面板的订阅与状态呈现；[session-checkpoint-migration](session-checkpoint-migration.md) 记录检查点归属迁移；[count-truth](session-checkpoint-count-truth.md)、[retention](checkpoint-retention.md)、[safety](checkpoint-safety.md) 分别维护计数真值、保留上限与快照安全。
