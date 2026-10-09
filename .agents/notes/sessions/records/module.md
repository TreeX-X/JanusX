---
{
  "schema": "harness-note/2",
  "id": "0cb931e1-e33c-4e38-a9d9-9d652796d935",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T09:06:56.496Z",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662",
  "moduleState": "partial",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/sessions/session-registry.ts",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/sessions/external-session-scanner.ts",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/sessions/transcript-reader.ts",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/SessionPanel.tsx",
      "role": "implementation"
    }
  ]
}
---

# 会话记录与续接

## Responsibility

维护稳定的会话身份、终端绑定、回合记录、外部转录发现与有界读取，以及会话时间线和续接。提供 AgentSessionRegistry 给终端、检查点及其他调用方。

## Design

注册表先加载后写入并在退出前刷盘，外部扫描批量合并通知；各引擎的转录与续接能力显式判断。时间线读取会话回合和检查点关联，快照创建与恢复规则见 [职责入口](../checkpoints/module.md)。Hook 能力表属于终端事件协作边界，知识证据提取由知识模块维护。
