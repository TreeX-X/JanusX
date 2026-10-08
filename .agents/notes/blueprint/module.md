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
  "updated": "2026-10-08T07:12:00Z",
  "moduleState": "partial"
}
---

# Note 与蓝图

## Responsibility

通过共享 Note 读取边界提供工程 wiki、文档关系与跨工作区蓝图。NoteReadSnapshot 保留原始身份、元数据、关系与诊断，视图在相同来源上组织信息。

## Design

当前文档采用 WorkflowX v2：每个模块有一个 module.md，普通文档通过 module 声明归属；moduleState 单独记录 planned、partial、implemented、retired。单根项目的蓝图首页即根模块页，沿用模块页的分行布局，面包屑从项目名开始；多根项目保留聚合入口。单击在左侧预览真实正文，双击进入模块页面；当前模块保留为画布父节点，下方显示直属文件与子模块入口，空模块也保留自身。返回恢复浏览范围、选中、预览和视口，重复进入当前根节点不增加层级。模块使用带页签的容器轮廓，文件按类型放在所属模块的灰色虚线分组中。wiki 与 Chat 读取同一共享快照，搜索与 Chat 定位从完整来源进入所属模块，写入经 agentX 事务完成。具体接入、历史迁移和验证见 [WorkflowX v2 接入](workflowx-v2-adoption.md)。

已实现行为与验证见 [模块浏览交互需求](requirements/module-browsing.md)。下一项是 [关注工具与模块浏览适配](requirements/module-focus-navigation.md)，统一右侧关注、预览/进入意图与当前模块上下文；随后按长期职责整理真实子模块与文档归属。现有一级模块接入不代表职责层级已经细分完成。

交付路线见 [Note、wiki 与蓝图交付专题](./requirements/blueprint-notev2-implementation-plan.md)，性能约束见 [蓝图性能专题](./requirements/blueprint-performance.md)。相关工作包括历史方案和当前实现；列表中的存在或关联不代表已采纳、已交付或拥有写入权限。

模块负责工程文档投影、导航、蓝图关注与界面呈现。agentX 的共享 harness 包拥有 Note 读取快照、创建编辑、缓存索引、事务、监听、共享与撤销；Janus 的 HarnessNoteService 叠加组合投影和本地画布状态。任务执行与回执由共享 Agent 执行入口负责，知识 wiki 的生成与审核属于记忆知识模块。边界依据见 [agentX 复用边界](./agentx-harness-inheritance.md)。

`WorkspaceBlueprintService` 提供工作区蓝图状态与绑定窗口的初始化预览入口，调用 agentX 共享初始化和撤销函数。界面以工作区 ID 选择投影或空态，起草入口复用项目会话；具体边界见[工作区切换与初始化生成](./requirements/blueprint-empty-init.md)。

[架构师工作区设计](./architect-workspace-model.md)说明跨仓组织的依据；[共同读取任务](./tasks/note-blueprint-r2-read.md)记录读取投影工作；[系统结构任务](./tasks/module-structure-view.md)记录模块视图的交付与验证。

## Acceptance criteria

- [x] AC-1: 工程内容由共同 Note 来源读取，视图不维护第二份文档身份或关系真源。
- [x] AC-2: 文档呈现与 Task 执行、回执职责分别拥有明确入口。
