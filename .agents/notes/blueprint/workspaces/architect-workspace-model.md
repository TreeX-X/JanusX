---
{
  "schema": "harness-note/2",
  "id": "41e93b25-92ce-4547-9250-e28cf4b1907f",
  "kind": "decision",
  "lifecycle": "accepted",
  "created": "2026-09-23",
  "class": "architecture",
  "tags": ["blueprint","wiki","note-index"],
  "relations": [
    {"type":"related-to","target":"note://d2499d5b-4ceb-4d46-aa3b-18e5c9b86034/c61d7a4e-6f8b-4a2e-9d31-5c7e8b0f2a14"}
  ],
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-23-note-wiki--41e93b25.md",
      "sourceHash": "119c7e78c9c4e92a5edccb06386c90f107c24851c9afbb880d593c446afa4c13",
      "originalBodyHash": "6a436b3aa7786a12126d1375233fbb580202cb2be1152625e3565a8a74e500ff",
      "category": "formal",
      "reason": "Retains the source decision in accepted lifecycle; body documents 架构师工作区：Note、wiki 与蓝图的共同契约. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ./2026-09-23-blueprint-composition-v3.md -> ./2026-09-23-blueprint-composition-v3--8c8ee0b6.md",
        "Rebased Markdown destination: ./2026-09-23-blueprint-workspace-graph-v2.md -> ./2026-09-23-blueprint-workspace-graph-v2--8ebc6a9a.md",
        "Rebased Markdown destination: ./2026-09-23-blueprint-notev2-implementation-plan.md -> ./2026-09-23-blueprint-notev2-implementation-plan--e7c03317.md"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/architecture/2026-09-23-architect-workspace-model.md",
        "sourceHash": "396aad5a97c1fdb989e8ed5cc13461db67cbd19fe59a41ac6e4611e8729c987c",
        "originalBodyHash": "621e5981e5449bcf2fd1a3b0a4a02c266043c024612a74b6a2b4dd59d9dd623c"
      }
    }
  },
  "updated": "2026-10-08T13:04:40Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bc9c2ca8-e036-48ec-a35e-667d694460ca"
}
---

# 架构师工作区：Note、wiki 与蓝图的共同契约

本文记录架构师工作区的设计边界，accepted 表示设计已采纳，不代表每项功能已验收。早期实施依据保留在[历史计划](../requirements/blueprint-notev2-implementation-plan.md)；当前 v2 适配顺序和未完成项见[接入计划](../workflowx-v2-adoption.md)。

WorkflowX xarch 使用跨模块 Note 约定，agentX 初始化生成 v2 项目模块。JanusX 通过共同读取与投影解析同仓及跨仓模块，不要求专用架构师 schema。当前适配保留唯一文档归属，将验收引用、正式关系和正文引用从参与模块连接到同一原文；模块依赖及多条关联原因分别保留类型、方向与来源。独立验收状态由接入计划维护。

架构师功能以跨模块管理的 Note 机制为核心，表达整体目标、职责边界、共同需求、约束与协作。它适用于同仓多模块和跨仓项目；独立架构师仓库是承载方式之一。设计沿用 [V2 单工作区投影](../navigation/blueprint-workspace-graph-v2.md)和 [V3 组合视图](./blueprint-composition-v3.md)的分层与证据概念，标准 Note 是唯一工程声明来源。共享索引的上游依据为 [WorkFlowX 派生索引约定](note://d2499d5b-4ceb-4d46-aa3b-18e5c9b86034/c61d7a4e-6f8b-4a2e-9d31-5c7e8b0f2a14)。

## Problem

一个项目可能包含认证、配置、界面等多个模块，分布在同一个或多个仓库。架构师需要通过 Note 建立共同目标、模块职责与接口，各模块维护局部机制和任务。蓝图必须识别并解析这些跨模块管理关系；项目全景在尚无代码或部分仓库未接入时仍可阅读，维护顶层规划也不能要求拥有所有开发仓库的写权限。

Note 已有稳定身份和工程关系，轻索引已有反链与查询，但蓝图转换仍丢失部分元数据和关系语义。现有知识 wiki 关联 fact 与 observation，尚无明确的 Note 来源契约。若两种视图各自重建关系、复制正文和维护状态，同一工程事实就会产生多个版本。

## Decision

### 1. 资产与职责

| 层次 | 内容与归属 | 维护方式 |
|---|---|---|
| L0 开发证据 | 各开发仓库的 Note、代码引用、任务回执 | 各库自己的事务与提交 |
| L1 跨模块管理 | 上层模块的整体设计、共同需求、决策、接口与必要的仓库绑定 | 所属 Git 仓库维护；可独立为架构师仓库 |
| 读视图 | 工程 wiki、单工作区投影、项目组合蓝图 | 从同一 Note 索引派生，布局与过滤保存在本机 |

独立架构师工作区是普通 Git 仓库，具有自己的 repoId 和 `.agents/harness.json`；同仓管理直接复用项目的上层模块。项目与模块使用 `kind: module` 的 module.md，项目入口声明 `role: project`；递归子模块用 parent 表达模块层级，普通文档用 module 声明归属。跨模块需求与决策归属于能够承担它们的共同上层模块，相关模块引用同一份原文。局部机制与任务留在所属模块，不强制建立总 Task，也不重复维护下游进度。项目声明不能随本机已打开的工作区集合改变；跨仓读取保留开发仓库的 Task 和证据来源。

Note 是工程声明的唯一真源。工程 wiki 直接展示 Note 的目录、正文、引用和反链；既有知识 wiki 继续解释其 fact/observation 来源，并可引用 Note。知识摘要、搜索结果和画布都不拥有 Note 的生命周期、执行状态或审批权。

### 2. 身份、索引与查询

共享身份使用完整 `note://<repoId>/<noteId>`。改名或移动文件不改身份，代码落点由 `codeRefs` 表达。模块与仓库允许多对多绑定：`repositories.primary` 指向主要开发仓库，related 和 codeRefs 表达其它归属。repoId 与本机 workspaceId 必须分别处理。

同一仓库的多个 checkout 可以包含不同版本的同一 Note。查询必须携带 checkout 范围；跨仓组装由本机显式选择 repoId 对应的 checkout，存在多个候选时要求选择，不能取首个匹配。画布节点可用“checkout 标识 + 完整 Note URI”区分实例，持久引用仍使用 Note URI。

复用 harness-node 的扫描和索引，只补齐以下读契约：

| 数据 | 最少保留的内容 |
|---|---|
| Note 条目 | URI、标题、kind、lifecycle、moduleState、tags、module、parent、仓库绑定、codeRefs、接口声明、路径、内容哈希、短摘录 |
| 正式关系 | 完整起止 URI、原始 type，以及已声明的 criteria、scope、reason |
| 派生引用 | 正文链接或 wiki 来源的起止身份、来源类别；与正式关系分开返回 |
| 诊断 | 源文件、原因、目标 URI（存在时）、解析状态；保留未解析目标 |
| 快照 | 所选 checkout 与各仓 revision，条目的哈希必须来自该次读取 |

反链从上述边反向计算，不手写第二份关系。parent 与 relations 中重复声明的同一边只展示一次。摘要从正文按确定规则提取并绑定内容哈希，不新增 Note summary 字段。正文按需读取；默认上下文为选中条目、一跳邻居及祖先链，遍历去重、有界，并标记截断。

查询沿用 URI、元数据、关系类型、代码引用和有界正文搜索。首版复用内存索引及宿主缓存；只有实际扫描成本需要时才增加可重建的 `.agents/.local` 缓存。启动、回焦点、切分支或 watcher 失效时重扫；正常变更使所属 checkout 的派生视图失效。

### 3. 关系含义与解析状态

正式关系保留 `parent / depends-on / implements / governed-by / derived-from / supersedes / related-to` 的原始含义及方向。显示层可以共用线型，但不能把几种关系改写为普通 related-to。parent 环、重复 ID、未知类型必须进入诊断，不能任意选中一个目标。

正文引用首版只提取标准 Markdown 链接，包括引用式链接，并忽略代码片段。Note URI 直接解析；相对 Markdown 路径只在当前 checkout 已扫描条目中解析到稳定 URI。外部网址保持普通链接，`[[标题]]`、标题猜测和代码自动推断留待真实需求。正文提及只产生派生引用，不自动成为模块依赖；章节锚点只用于定位，不能替代 Note 身份。

| 状态 | 判定与展示 |
|---|---|
| 已解析 | 所选 checkout 中唯一目标可读；有来源哈希时必须匹配 |
| 未接入 | 目标仓库没有绑定或不可读取；保留声明与引用，不断言目标已删除 |
| 目标缺失或不明确 | 仓库已读但目标不存在、ID 冲突或绑定歧义；展示诊断，不猜测连线 |
| 内容已变化 | wiki/证据保存的来源哈希与当前 Note 不同；显示过期并允许查看当前原文 |

moduleState、lifecycle、task.execution 和来源新鲜度各自展示。planned 模块与尚未绑定仓库的模块仍保留入口；模块获准不代表下游任务完成，内容变化也不自动撤销已有回执。正式验收仍由现有契约与回执规则决定。

### 3.1 蓝图识别与跨模块解析

projectArchitecture 依据 v2 module 追溯归属，旧 parent 仅用于历史兼容；跨模块关联不改变 moduleOwners 的唯一归属。projectModuleBrowse 展示直属内容，关联区保留跨范围入口和同一目标的多种关系。普通项目初始化同样使用 role: project，因此该字段只说明项目根角色；是否具有架构师用途不作为内容解析门槛。

| 能力 | 必须保留的语义 |
|---|---|
| 工作区与结构识别 | 使用显式项目身份、module/parent 和已声明的关系解析；纯 Note、无代码、未绑定开发仓库的规划仍可读取。不以目录名、仓库名或有无源码猜测用途。 |
| 文档归属与关联 | module 表达唯一主要归属；共同需求、决策及其引用表达关联。同一文档可从多个相关模块到达，仍保持同一 Note 身份和来源，不成为每个模块的直属文件。 |
| 关系解析 | 保留依赖、实现、决策约束、验收引用和接口的具体类型、方向与来源。正文提及保持引用含义，不自动推导依赖；无需为展示增加重复字段或手写反向关系。 |
| 范围切换 | 模块页保留当前父节点与直属内容，跨范围关联提供可追溯入口。预览读取原文，进入/返回与关注定位使用同一所属模块和 checkout 上下文。 |
| 来源与状态 | 同仓与跨仓使用共同解析规则；跨仓再解析显式 checkout。planned、未接入、歧义、缺失和过期分别表达，不把未解析关系静默丢弃或推断成任务完成。 |

实施保持普通开发工作区和纯 Note 规划共用解析，不增加用途标记。若未来需要按角色筛选工作区，再为筛选需求评估显式标记；标准文档读取不依赖它。四项真实 v2 临时工作区测试覆盖递归结构、共享需求/决策、验收与正文引用、模块依赖，以及未绑定和多 checkout。嵌入式与工作台浏览器场景验证关联访问、返回与关注定位，并各重复三次通过。上述均为 Main 自检。

独立评审发现首次双击的第二次点击落到空白画布时没有进入模块，固定样式下两个界面均可复现。双击现在在画布捕获阶段保留第一次点击的目标，覆盖相邻节点和空白处；超过一秒、距离达到八像素或用户拖动后不再使用旧目标，程序重排不清除目标。Main 新增的六项浏览器回归验证两种落点、单层返回以及无关空白双击，修复后的独立复验由[接入 Task](note://d2499d5b-4ceb-4d46-aa3b-18e5c9b86034/2ce416be-b118-40c4-bddc-87da25a8fe02)跟踪。

### 4. 接口声明与组合装配

接口使用当前固定 harness-note/2 profile 的模块 `interfaces[]`：name、direction（provides/needs）及可选 provider Note URI。复用现有字段与解析，不增设架构师专用 schema；正文解释不再承担另一份可执行接口表。旧 S1.2 initiative 表述仅属历史版本背景。

组装时，有 provider 的 needs 必须解析到该模块的同名 provides，才能形成接口匹配边。无 provider 的 needs 显示悬空需求，可列出候选但不凭同名自动连线。仓库不可达时显示未接入，不能判定接口不存在。未被当前范围需求引用的 provides 标为“当前范围未引用”，避免推断其它仓库也无人使用。

装配器读取架构师骨架与已接入仓库的共同读数据，不另读 Note 文件。一个仓库承载多个模块时，证据归属依据显式关系和代码范围；无法判定的条目提供仓库级入口，不能复制成每个模块的证据。骨架与各库保留各自 revision，界面显示当前范围，不能拼成一个全局版本号。

### 5. wiki 的最小适配

工程 wiki 复用 Note 的身份、正文与索引，不为每篇 Note 新建一个 WikiPage。目录、依赖、决策依据、代码落点及被引用列表都从共同读契约生成。蓝图选中节点与工程 wiki 打开条目应定位到同一 checkout 中的同一 Note。

既有知识 wiki 仅增加宿主侧可选 `sourceNoteRefs: [{ uri, sourceHash }]`。引用来自生成或审核该 wiki 内容时实际读取的 Note，哈希由读取层提供；不能让模型猜测。原有 sourceFactIds 保留。一篇 wiki 可引用多篇 Note，Note 到 wiki 的反向列表由此派生，不回写 Note，也不另存双向关系表。

普通正文链接只表示提及；sourceNoteRefs 表示内容生成所依据的快照。同一 URI 的引用合并；出现不同来源哈希时保留旧引用并标记待复核，不能覆盖后宣称最新。只有基于新原文重写或复核该 Note 对应的全部页面内容，并通过现有 wiki 审核后，才能更新来源引用。只读内容页同时标明来源工作区，不能跨工作区按 slug 猜测页面。

### 6. 读取边界、脚手架与展示

harness-core 负责解析、校验和哈希，harness-node 负责文件、索引和事务。JanusX 的 Note 读取边界由 note-provider 封装，工程 wiki 与蓝图复用其输出；装配器不成为第二个扫描器。此纪律限定工程内容读路径，执行、回执和事务继续使用已有入口。

有效、旧格式、外来格式、损坏、重复身份及未解析引用都必须可查。旧格式不能通过 silently skip 从项目中消失；无法安全迁移时保留原文与分类。迁移保持既有 UUID、可解析链接及原始事实，不能由旧 Status 伪造 task 回执。

`xarch` 由 Main Agent 直接建立或检查 Git 仓库、复用或创建身份、生成项目与已确认或 planned 子模块的 module.md，并按范围写 README 与可选 CODEOWNERS。创建时使用宿主支持的当前 profile、真实 UUID 和已知绑定，未知仓库不写伪占位值。检查已有改动并保护重叠文件；本机注册与投影验证分别报告，缺失宿主能力时不能由文件创建推断接入成功。xarch 不创建 Task，也不派发子 Agent。

目录按模块职责组织：`.agents/notes/module.md` 为项目入口，每个子模块目录有自己的 module.md，相关普通 Note 与下级模块共存。使用稳定主题文件名，移动不改变 Note URI；文件目录与 module/parent 关系保持一致，不再规定平铺 notes 或单独 planning 树。

架构师视图复用现有模块浏览：单击左侧预览，双击进入范围，保留当前模块自身与直属文档、子模块入口，返回恢复上下文。单根首页采用根模块布局，关注工具与手动导航使用同一范围和 checkout 身份。组合视图保留接口与未接入诊断；上述行为在跨仓组合中的一致性属于本轮待验证范围。布局、过滤和默认架构仓 pin 只属本机；不同架构仓分别呈现，不隐式合并。默认只展示正式工程关系，正文引用和知识解释按需展开。

### 7. 治理与审批

架构师仓库成员共同维护模块声明，各开发仓库自治。计划性变更走各库 Git 评审，应用内变更走原有 maintenance 事务、expectedHash 和审计。跨库意图拆为独立事务，逐库报告结果；不引入跨库原子提交。

维护入口沿用当前宿主的授权、工具权限、expectedHash 与事务边界；本文不再要求每次修改都另走固定 plan → changeset → 全选流程。跨仓修改绑定明确目标，分别报告结果。Task 全文始终只由 Main Agent 修改；子 Agent 返回结果与草稿，由 Main 整合，不增设架构师专用交接文档。交互与事务是否完整接通须以当前实现验证为准。

并发冲突由 Agent 重读并说明。若合并改变已确认的提案，必须重新确认；重试须有界，未解决时明确报告。wiki 摘要和画布交互均不能绕过该写路径。

### 8. 简洁边界

复用当前六种 Note kind：module、note、idea、requirement、decision、task。此次适配不新增架构师专用元数据、能力注册表、共享 views、中央 INDEX.md、搜索数据库或通用资源图框架。接口沿用现有最小字段；实际任务执行继续走 xdo/xdel/xflow，xarch 只负责工作区与规划入口。任务验收引用、哈希和 lifecycle/execution 双轨保持现行语义。

接口边与引用边都是读取时的派生结果，不回写为 Note 正式关系。每项派生数据都必须能由来源重建；正文、状态和反链均不得要求人工维护两份。

## Alternatives considered

- 为 Note、wiki、蓝图分别建立索引和关系表：各视图可独立优化，但同一引用会产生多份身份、状态与失效逻辑。采用共同读契约，视图只负责组织和显示。
- 把每篇 Note 复制成 WikiPage，或新增 wiki Note kind：可快速复用旧页面 CRUD，但引入正文、版本和审批的双重维护。采用直读工程 wiki，知识 wiki 仅保存实际来源引用。
- 用标题、文件路径或接口同名推断关系：写作负担较小，但改名、多仓同名及多个 checkout 会产生错误关联。采用稳定 URI、显式 provider 和可见的未解析状态。
- 骨架放 GLOBAL JSON、共享云目录或聚合已打开工作区：启动成本较低，但项目声明无法随仓库可靠评审、共享和恢复。采用所属 Git 仓库中的标准 Note，独立架构师仓库按需建立；局部实现继续由各模块维护。
- Do nothing / reuse：保留当前分离模型的改动最少，但跨库身份丢失、wiki 无 Note 来源及旧文件静默排除会继续影响蓝图完整性。复用已有解析、索引、事务和审批，仅补上述连接。

## Consequences

接口声明仍需维护，结构合法不证明代码实现符合契约；首次只服务模块级声明。规模增大后，依据实际扫描耗时决定缓存和分页，不能以未测量的性能理由增加数据库。

持久 wiki 来源引用需要在 schema、读写和审核路径中一起支持；旧页面没有来源哈希时只能标记来源未记录，不能推断为最新。分支切换必须使读取范围与缓存同步，未接入仓库的反链列表应标记覆盖范围。

存量蓝图的 description、todos、issues 和 techSolution 必须先盘点、预览再迁移归档，不能因切换入口而静默丢弃。legacy 诊断数量增加可能只是首次显露旧资产，迁移应核对完整清单与身份链接，不能只比较 invalid 数量。

## Open questions

具体目录、反链和来源标记的视觉样式由原型确定。该交互选择不改变本契约的身份、关系、来源和审批语义。
