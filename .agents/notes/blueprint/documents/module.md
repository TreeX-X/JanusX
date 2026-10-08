---
{
  "schema": "harness-note/2",
  "id": "bd612cd8-0676-4c46-98ba-81d1dc008505",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T09:06:56.496Z",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd",
  "moduleState": "partial",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/notes/note-provider.ts",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/blueprint/NoteWikiPanel.tsx",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/shared/note-wiki.ts",
      "role": "implementation"
    }
  ]
}
---

# 工程文档读取与 wiki

## Responsibility

复用 agentX 的 NoteReadSnapshot，提供工程正文、元数据、引用、反链和 wiki 目录。共享包维护解析、索引与身份；本模块维护 Janus 的读取适配和文档阅读入口。

## Design

同一快照供 wiki 与蓝图投影消费，正文按需读取并保留原始来源哈希。文档命名空间、历史迁移和机械检查在此归档；共享编辑事务由 agentX 提供，蓝图交互见 [职责入口](../navigation/module.md)。知识 Wiki 的生成与审核仍由记忆与知识模块负责。
