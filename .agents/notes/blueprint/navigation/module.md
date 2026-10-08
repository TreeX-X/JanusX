---
{
  "schema": "harness-note/2",
  "id": "17bbe20e-f05c-470c-aee1-3f92a86369ab",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T09:06:56.496Z",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd",
  "moduleState": "partial",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/notes/note-to-blueprint.ts",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/features/blueprint/architecture-view.ts",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/features/blueprint/module-browsing.ts",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/blueprint/BlueprintCanvas.tsx",
      "role": "implementation"
    }
  ]
}
---

# 模块投影与导航

## Responsibility

将共同 Note 来源投影为模块页，维护模块与文件布局、单击预览、双击进入、搜索定位和返回历史。布局与选择属于本机视图，不成为文档关系真源。

## Design

单根首页使用根模块页，当前模块保留为父节点，直属子模块和按类型分组的文件构成下层内容；更多层级继续进入。note_focus 的展示动作复用导航与视口，note_scope 和普通访问保持被动。交互与关注分别由 [行为与验收](requirements/module-browsing.md)、[行为与验收](requirements/module-focus-navigation.md) 维护；对话写入与审批见 [职责入口](../maintenance/module.md)。
