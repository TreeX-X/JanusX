---
{
  "schema": "harness-note/2",
  "id": "7359ef5b-8cbb-4e30-a727-9a4907ac5fa0",
  "kind": "note",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T05:26:35.881Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd",
  "codeRefs": [
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/main/harness/note-authoring.ts","role":"entry"},
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/features/blueprint/module-expansion.ts",
      "role": "implementation"
    },
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/main/ipc/harness-handlers.ts","role":"implementation"},
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"tests/unit/workflowx-v2.test.ts","role":"test"},
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"tests/e2e/blueprint-v2.spec.ts","role":"test"},
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"tests/e2e/desktop-harness-runtime.spec.ts","role":"test"}
  ]
}
---

# WorkflowX v2 在 JanusX 的接入

## 当前设计

JanusX 使用 agentX 的共享读取、写入、wiki、工程工具和 Task 执行契约，固定 WorkflowX 2.0.0。共享包来自 agentX `61d6e7fe2e943deb8da725c6e518c5ba0ed030c2`；规则源为 WorkflowX `a44cfb7c46219b215a6e6c0dc93221a3d39e6d65`。版本摘要为 `b76f1d5e98fce7a8fa56f5f60b023b457640e7036c32096e430a8481ef83c5e8`。主程序与 renderer 通过同一 Note 快照显示元数据、正文、诊断和更新时间。

蓝图首次展示模块，包括 planned、partial、implemented。当前实现中，单击模块展开其直接拥有的文档，按 note、idea、requirement、decision、task 在灰色虚线矩形内分组；不同模块的同类文档不合并。双击打开详情，返回保留展开状态和视口。用户后续确认的 [模块浏览交互](requirements/module-browsing.md)将移除双视图切换，并改为单击左侧预览、双击进入模块浏览；该调整尚未实施。布局属于视图，不生成第二份文档身份。wiki 按 module 归属组织目录，历史 parent 仍可作为关系阅读。模块状态、文档生命周期和 Task 执行结果分别显示。

Chat 的 Note 工具复用共享服务，并保留 workspace.read、workspace.edit、command.run 等工程能力。普通 xdo 不创建 Task。Task 绑定执行仅由 Main 更新 Task 全文，子执行上下文拒绝写入 `.agents`，返回 Change Summary 与 Note 草稿。每次交接前更新同一 Task 的 Handoff，保留作者进展与证据。xdel 只自审；既有独立评审义务保留为 pending，桌面接口返回草稿、回执和未完成原因。xdo 绑定独立评审 Task 时仍履行该义务；xflow 保留独立评估与固定 AC。

维护入口、圆桌产物和旧蓝图导入依据目标仓库的 profile 和所属 module 写入稳定路径。选择的目录必须与目标 repoId 一致。v2 通用创建入口不把简略行动项伪装成可执行 Task；Main 需补齐正式契约。旧 JSON 的功能描述和任务清单作为普通 Note 导入，保留历史类型、关系与报告；同名文档分配不同路径。缺失的决策后果明确记为待评估，不制造历史验收。

## 文档迁移

[独立迁移任务](tasks/migrate-notes-v2.md)覆盖 257 份原始文件：254 份转入模块目录，保留 UUID、created 和原始 Git 来源，刷新 updated；3 份用户正在修改的知识 Note 原样保留。九个模块均使用 module.md；已有验收编号继续可引用。旧执行证据保留在迁移报告和原始 Git 版本，不重新签发 v2 回执。

[迁移清单](../../../docs/migrations/note-v2.json)记录源哈希、目标、类型变更与保护例外。3 个保护文件中的 3 处旧相对链接暂未改写，检查器只对清单明确映射且目标存在的链接报告 deferred，其余错误仍使检查失败。后续维护这些用户文件时再完成迁移与链接修复。

## 模块层级现状与后续整理

接入提交 `9c49dba` 完成了运行时适配和一级模块归类，尚未完成 JanusX 子模块的职责设计。该版本有 1 个项目入口、8 个一级模块，没有二级模块；其中 Note 与蓝图直接拥有 53 份文档，会话与工作区拥有 39 份。一次性迁移沿用指定的八个粗粒度模块，将其 parent 统一指向项目入口，其余文档归入对应模块。因此，接入完成不等于模块层级已经梳理完整。

WorkflowX v2 允许递归嵌套模块，蓝图投影和布局也递归处理子模块。子模块在自己的目录内维护 module.md，parent 指向最近的上级模块；普通文档的 module 指向直接所属模块。同一目录可同时容纳主题文档与子模块。tasks、requirements 等分类目录本身不构成模块。当前没有更深层级，是文档结构尚未细化，不能归因于旧 Note 转换后不支持嵌套；已有一级模块测试也不能代替真实多层结构的验证。

后续按代码中的独立、长期职责识别必要的子模块。每个子模块应能说明职责、边界、主要入口和协作关系；文档数量只作为检查边界的线索，不按篇数、文件名或单次任务机械拆分，也不要求每个模块都有相同深度。父模块保留整体设计，子模块维护独立细节，通过引用避免重复正文。

以下仅为待核对代码边界的候选，不是已确认的目录或已实施结构：

```text
Note 与蓝图
├─ 工程 wiki 与文档浏览
├─ 模块图、布局与导航
└─ 工作区组合与初始化
```

下一步先对照真实代码和既有 Note 整理模块树，优先补齐必要的二、三级职责，并给出旧 Note 到目标模块的归属映射。已有文档能承担模块入口时原位整理，主题延续时保留 UUID 与 created；需要新模块身份时才新增。落实迁移时同步目录、parent/module、更新时间及引用，并验证深层模块、文档分组和详情返回。此次仅记录讨论，尚未执行这一轮拆分或目录迁移；三份用户正在编辑的知识 Note 继续保留原状。

## 验证与边界

验证命令、结果和仍待独立评审的项目见 [接入验证](../../../docs/migrations/workflowx-v2-verification.md)。桌面测试使用本地确定性 HTTP 模型驱动真实 Electron、IPC、工具与回执；它验证集成路径，不代表外部真实模型的质量或生产发布。独立评审与 README 演示仍由 [跨仓接入 Task](note://d2499d5b-4ceb-4d46-aa3b-18e5c9b86034/2ce416be-b118-40c4-bddc-87da25a8fe02)跟踪。
