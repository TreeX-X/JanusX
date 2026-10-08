---
{
  "schema": "harness-note/2",
  "id": "f12d99b4-c116-48dc-96d9-e3ac74ae41cd",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-03",
  "class": "architecture",
  "tags": ["note","blueprint"],
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a",
  "codeRefs": [
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/main/notes/note-provider.ts","role":"entry"},
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/blueprint/blueprint-composition.ts",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/blueprint/BlueprintCanvas.tsx",
      "role": "implementation"
    }
  ],
  "interfaces": [
    {"name":"NoteReadSnapshot","direction":"provides"},
    {"name":"HarnessWorkspaceStatus","direction":"provides"}
  ],
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/46d65946-125b-56d0-b23e-05552f5b281e"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/6471d8f2-ee72-5a63-897c-0d8e44110eb6"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/cb026d42-c260-5e79-a66f-e455228d6eaf"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/66bf1be8-fad7-5c9c-8048-4bbe0b665950"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/1f21d390-171c-57ba-9b8b-cca02d74c39a"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/2b73dd7d-a2e0-50b4-aa75-31f0ed371ba2"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/553f17a8-e800-5e4a-ac55-ae454a51825b"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/11d8826d-52d7-58bb-99bd-49b6ba04dfaf"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/4ffa1606-df23-5880-a1a5-003ab5fac9e3"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/6b7c688e-278f-5878-b88f-2bbb9d766fae"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/2a6cd90c-60fa-5fdf-acc4-2989cdf5bdc2"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/8688b5ab-1f7f-5ff9-ba1b-ef75b7fd5917"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/0d703ca1-d703-451f-9ac6-15792c08f45d"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/dda0c41e-4581-4de5-af98-8fbdc2e768f5"},
    {"type":"governed-by","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/47c7be36-5a48-4a27-aa86-d4f9dffb641c"}
  ],
  "updated": "2026-10-08T09:10:33.782Z",
  "moduleState": "partial"
}
---

# Note 与蓝图

## Responsibility

通过共享 Note 读取边界提供工程 wiki、文档关系与跨工作区蓝图。NoteReadSnapshot 保留原始身份、元数据、关系与诊断，视图在相同来源上组织信息。

## Design

本模块由四项长期职责协作：[工程文档读取与 wiki](documents/module.md)提供同源正文和目录；[模块投影与导航](navigation/module.md)将来源组织为可逐层浏览的模块页；[蓝图维护对话](maintenance/module.md)承接讨论、文件变更与审批；[工作区组合与初始化](workspaces/module.md)处理明确 checkout 的装配和接入。

单根首页采用根模块页，单击预览真实正文，双击进入并保留当前模块为本页父节点，返回恢复范围、预览和视口。具体交互与工具行为由导航子模块的[浏览需求](navigation/requirements/module-browsing.md)和[关注需求](navigation/requirements/module-focus-navigation.md)维护。

Janus 负责产品投影和交互；agentX 的共享 harness 包拥有解析、身份、读取缓存、创建编辑、事务、监听、共享与撤销。任务执行和回执由 Agent 对话与执行模块承接，知识 Wiki 生成与审核由记忆与知识模块承接。[共享边界](agentx-harness-inheritance.md)记录取舍。

[接入计划](workflowx-v2-adoption.md)与跨子模块的交付、性能专题保留在本层。它们引用各职责的实现和验收，不复制子模块正文。目录与旧文档的归属依据见[职责目录整理](module-responsibilities.md)。

## Acceptance criteria

- [x] AC-1: 工程内容由共同 Note 来源读取，视图不维护第二份文档身份或关系真源。
- [x] AC-2: 文档呈现与 Task 执行、回执职责分别拥有明确入口。
