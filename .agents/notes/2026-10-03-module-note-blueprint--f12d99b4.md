---
schema: harness-note/1
id: f12d99b4-c116-48dc-96d9-e3ac74ae41cd
kind: initiative
lifecycle: accepted
created: 2026-10-03
class: architecture
tags: [architecture:module, note, blueprint]
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a
codeRefs:
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/notes/note-provider.ts
    role: entry
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/blueprint/blueprint-composition.ts
    role: implementation
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/renderer/src/components/blueprint/BlueprintCanvas.tsx
    role: implementation
interfaces:
  - name: NoteReadSnapshot
    direction: provides
  - name: HarnessWorkspaceStatus
    direction: provides
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/46d65946-125b-56d0-b23e-05552f5b281e
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/6471d8f2-ee72-5a63-897c-0d8e44110eb6
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/cb026d42-c260-5e79-a66f-e455228d6eaf
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/66bf1be8-fad7-5c9c-8048-4bbe0b665950
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/1f21d390-171c-57ba-9b8b-cca02d74c39a
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/2b73dd7d-a2e0-50b4-aa75-31f0ed371ba2
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/553f17a8-e800-5e4a-ac55-ae454a51825b
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/11d8826d-52d7-58bb-99bd-49b6ba04dfaf
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/ee0e8ff1-8aba-560e-8585-498c71f1718c
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/134ce6f7-07c1-55be-b2c4-b37bc216c37f
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/5559a0b8-d437-5e79-8bb5-c593bf30e8fc
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/4ffa1606-df23-5880-a1a5-003ab5fac9e3
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/6b7c688e-278f-5878-b88f-2bbb9d766fae
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/2a6cd90c-60fa-5fdf-acc4-2989cdf5bdc2
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3b7d1e9b-8880-5052-93e9-68d26adbceb6
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/eece2e89-ae59-54cc-baf6-2d40bacc2c34
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/8688b5ab-1f7f-5ff9-ba1b-ef75b7fd5917
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/387ee6c3-8aa7-5bee-958c-b0f420249b10
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81fc137e-9c56-4d3a-88e4-10f175852c97
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/62e857d3-c7c8-45ab-b173-ef59c2342df4
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/9b7b1e15-6c2e-4d2c-9ed0-7a2d1c4e6f80
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/7be391fd-20f2-4a0f-b815-fcd3da220f06
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/5480ef6d-5a86-45fd-9719-948d4cc462e5
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/844bc2f1-3be4-4b47-83ca-0ef792bc5c1d
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/0d703ca1-d703-451f-9ac6-15792c08f45d
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/dda0c41e-4581-4de5-af98-8fbdc2e768f5
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/a1b2c3d4-2990-4ec4-b1d2-c825b30fa9da
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/350594c4-3e53-4645-aeab-57e4adeffc36
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/6083ec32-a6b4-4f31-826c-b2a05573b326
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/f013beaa-bff7-4656-b086-d4816608f905
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3efc89cf-3aa2-4e1e-829f-a0abc4319691
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/9c426f18-8b3e-49d7-96d1-36acbe174802
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/cb4d82c5-d02d-4c2e-a761-13f85e204e71
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/2baf7439-f3a2-4bcf-a451-b922db598ea7
  - type: governed-by
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/47c7be36-5a48-4a27-aa86-d4f9dffb641c
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/41e93b25-92ce-4547-9250-e28cf4b1907f
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/fa17e06b-5f62-4d42-9020-4fb77bcf54de
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/785a2a8e-79d5-4b8b-8ca1-efea8f682662
---

# Note 与蓝图

## Goal

通过共享 Note 读取边界提供工程 wiki、文档关系与跨工作区蓝图。NoteReadSnapshot 保留原始身份、元数据、关系与诊断，视图在相同来源上组织信息。

## Scope

交付路线见 [Note、wiki 与蓝图交付专题](./2026-09-23-blueprint-notev2-implementation-plan--e7c03317.md)，性能约束见 [蓝图性能专题](./2026-09-26-blueprint-performance--77fa3727.md)。相关工作包括历史方案和当前实现；列表中的存在或关联不代表已采纳、已交付或拥有写入权限。

模块负责工程文档投影、导航、蓝图关注与界面呈现。agentX 的共享 harness 包拥有 Note 读取快照、创建编辑、缓存索引、事务、监听、共享与撤销；Janus 的 HarnessNoteService 叠加组合投影和本地画布状态。任务执行与回执由共享 Agent 执行入口负责，知识 wiki 的生成与审核属于记忆知识模块。边界依据见 [agentX 复用边界](./2026-10-04-agentx-harness-inheritance--bd7fd0c6.md)。

`WorkspaceBlueprintService` 提供工作区蓝图状态与绑定窗口的初始化预览入口，调用 agentX 共享初始化和撤销函数。界面以工作区 ID 选择投影或空态，起草入口复用项目会话；具体边界见[工作区切换与初始化生成](./2026-10-04-blueprint-empty-init--4f49c9ba.md)。

[架构师工作区设计](./2026-09-23-architect-workspace-model--41e93b25.md)说明跨仓组织的依据；[共同读取任务](./2026-09-25-note-blueprint-r2-read--fa17e06b.md)记录读取投影工作；[系统结构任务](./2026-10-03-module-structure-view--785a2a8e.md)记录模块视图的交付与验证。

## Acceptance criteria

- [x] AC-1: 工程内容由共同 Note 来源读取，视图不维护第二份文档身份或关系真源。
- [x] AC-2: 文档呈现与 Task 执行、回执职责分别拥有明确入口。
