---
{
  "schema": "harness-note/2",
  "id": "e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5",
  "kind": "requirement",
  "lifecycle": "accepted",
  "created": "2026-09-23",
  "class": "architecture",
  "tags": ["blueprint","wiki","note-index","migration"],
  "relations": [
    {"type":"governed-by","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/41e93b25-92ce-4547-9250-e28cf4b1907f"}
  ],
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-23-note-wiki--e7c03317.md",
      "sourceHash": "ac8e7cd932cf3dfab740c5ad0ae34f608dc8efe31d4f193ecfa1afeffef4506d",
      "originalBodyHash": "93728aad7fa0037d5d76b083fbefe17c38d9281d669688f4996f8a4cb8121885",
      "category": "formal",
      "reason": "Retains the source initiative in accepted lifecycle; body documents Note、wiki 与蓝图实施计划. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ../../2026-09-25-blueprint-r5--7be391fd.md -> ./2026-09-25-blueprint-r5--7be391fd.md",
        "Rebased Markdown destination: ./2026-09-23-architect-workspace-model.md -> ./2026-09-23-architect-workspace-model--41e93b25.md",
        "Rebased Markdown destination: ./2026-09-23-architect-workspace-model.md -> ./2026-09-23-architect-workspace-model--41e93b25.md"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/architecture/2026-09-23-blueprint-notev2-implementation-plan.md",
        "sourceHash": "4ff8ccfa61a0956153bc47068589ef5371a591dc7f40d0210c59b9b51f8138c1",
        "originalBodyHash": "d0281e777c0ce9c81192c308fb5bce10b679afc7022dba614a69bd4cbd340552"
      }
    }
  },
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---

# Note、wiki 与蓝图交付专题

## Expected behavior

本专题保留 R1–R5 阶段交付边界和验收来源；当前结构由 [Note 与蓝图模块](../module.md)描述。以下“实施前”“实施顺序”均属于该阶段的历史计划，不能直接作为新工作的派发授权或当前功能清单。

让同一份工程资产能够在 wiki 中浏览、检索和回溯，在蓝图中呈现层级、关系与跨仓项目全景。设计真源为[共同契约](../architect-workspace-model.md)（note://972afef3-2fc7-49de-a3ee-7e041225d28c/41e93b25-92ce-4547-9250-e28cf4b1907f），本文只记录基线、交付边界、依赖和验收。

用户已授权将本轮重构连续实施到完成。按 R1–R5 的依赖顺序建立 task，每段固定范围、AC 引用和验证命令；实现后接受独立 review，修复阻断项并验收通过后才能推进下一段。具体执行状态和验收证据写入对应 task。

## Scope

### 实施前基线

以下为实施前代码与文件检查的历史基线：WorkFlowX `fa91b4c`、janus-agentX `9e8ad2f`、JanusX `5f56e9f`。当前完成状态以本文 Closeout 和各 task 的实测验收记录为准。

| 部分 | 已有能力 | 当时未闭环部分 |
|---|---|---|
| WorkFlowX | xarch 双端指令；S1.2 initiative 接口字段候选；共享派生索引约定 | S1.2 仍为 candidate，正式版本与三仓共同接入未完成 |
| agentX | URI、正式关系、反链、过滤、正文搜索、短摘录；已有哈希、事务、锁与 watcher | profile 与解析器仍为 S1.1；接口字段和完整消费契约待接入 |
| JanusX 单仓投影 | adapterVersion、invalid 展示、DraftCard、只读限制、工作区切换、右列精简对话 | 元数据和关系有损转换；刷新订阅缺入口 |
| wiki | fact/observation 来源链与查询 | 工程 Note 阅读入口及知识 wiki 的 Note 来源桥接未接通 |
| 项目组合与维护 | V3 原型基线、changeset 选择/依赖闭包/审计/撤销后端 | 装配器、接口边与未接入展示、组级部分通过到事务的入口未闭环 |

V2 的 P0、P1 及 B/C/D 已有落地记录保留在上述基线与 Git 历史。P0-1/2/3、P0-4a/b/c/d 覆盖版本回显、坏件展示、改名、只读守卫、plan 类型与 overlay 校验；plan 类型存在不代表维护写链已接通。关系线型、加载、终端 footer 与 composer 精简已有实现，wiki 单行入口和局部视觉在该基线中列为待办。

原 E0 编号保留，供现有代码反向注释定位：

| 编号 | 基线状态 | 对应交付 |
|---|---|---|
| E0-1 | 已按 checkout rootKey 生成图 ID | 保持同仓多 worktree 可区分 |
| E0-2 | repositories、codeRefs 未透出，interfaces 未接入 | R2 共同读模型 |
| E0-3 | 关系 target 截短，部分 type 转为 related-to | R2 完整身份及关系 |
| E0-4 | checkout 路径终端定位已补齐；模块目标仓绑定未完成 | R4 显式 repoId 到 checkout 映射 |
| E0-5 | harness:changed 订阅组件未挂载 | R2 失效通知与刷新 |

文档修订前的 JanusX 语料基线为 181 文件：23 个通过单文件校验、33 个有诊断、125 个旧格式被 foreign 分支跳过。该数量只用于说明迁移规模；这两篇 Note 原位规范化后及每批迁移前后，都须重新盘点。旧格式、外来格式和损坏文件必须明确归类，不能静默排除。

### 实施顺序

保持已裁决的总序：WorkFlowX → agentX → JanusX，按 R1 → R2 → R3 → R4 → R5 连续实施，每段 review 验收通过后推进。语料盘点可与版本收口同步；对应 UI 以用户指定的 `design/blueprint-note-graph-v11.html` 为视觉与交互基线，过时字段按正式 Note 契约更新。

| 交付 | 范围与归属 | 前置与完成出口 |
|---|---|---|
| R1 版本贯通 | WorkFlowX 正式标准、agentX 接口解析与校验、三仓 profile/digest、受管规则和发布矩阵 | 正式版本决策后实施；AC-1 |
| R2 共同读链与语料显式化 | agentX 复用已有索引补齐契约；JanusX note-provider/NoteDoc 接入完整元数据、关系、诊断及刷新；盘点全部语料并迁移有效试点集 | R1；AC-2、AC-3 |
| R3 wiki 索引与来源 | 工程 wiki 直读 Note；知识 wiki 增加最小来源引用；正文链接及反向引用；复用现有搜索与阅读入口 | R2、相关原型；AC-4、AC-5 |
| R4 架构师工作区与组合蓝图 | xarch 模板与注册对齐；显式 checkout 绑定；模块骨架、证据、接口匹配、未接入及过期展示 | R2/R3 的共同读契约、有效试点与组合原型；AC-6、AC-7 |
| R5 维护闭环与存量收口 | 组级全选/部分通过、模式及白名单切换、事务/审计/撤销；分批迁移剩余 Note，确认后归档旧蓝图资产 | R4；AC-8、AC-9 |

### 各段的最小工作量

R1 将 S1.2 接口正例和反例纳入消费者覆盖，保证接口字段仍不进入 taskContractHash。最终 version、digest 与三仓 checkout 写入已有 release-matrix；本计划不复制一份锁值。既有哈希、锁、恢复与 CLI 机制优先复用，只修真实的兼容缺口。

R2 由现有扫描链统一产生索引。JanusX 的 note-provider 输出共同读快照，独立的蓝图解析中间层将快照转换为视图模型，UI 不直接解释文件或 frontmatter。转换保留完整 URI、关系类型与附带信息，透传仓库、代码和接口声明，恢复变更刷新。盘点先覆盖所有文件；迁移先选能表达目录、依赖、决策和代码关联的有效试点。全量迁移可以分批，但交付不得隐藏尚未迁移的资产。

R3 的字段、链接分类和来源更新规则只在[共同契约](../architect-workspace-model.md)中维护。先实现目录、阅读、正式关系与反链，再接正文引用及知识 wiki 来源；不建设第二套工程正文库。已有 wiki 写入与审核路径同步支持来源引用，旧页面继续可读并明确来源未记录。

R4 使用一个架构仓、两个开发仓及一个未接入模块组成最小可见样例。覆盖同仓多个 checkout、模块跨库及一库多模块。界面沿用 `design/blueprint-note-graph-v11.html`，完成目录/反链、搜索过滤、选择定位、来源状态、悬空需求及未接入展示；旧 module 过滤项改用 initiative。Note 详情适配正式版本全部有用字段。部分内容尚未接入时仍显示完整声明骨架。

R5 接通右侧维护对话：传递当前蓝图及选中节点上下文，流式对话、停止与错误恢复可用，支持节点调整提案。复用 changeset 的选择、依赖闭包和撤销能力，接通提案到事务及刷新后的节点详情，保留删除逐项确认。旧蓝图先列清单与迁移预览，用户确认后再归档；每个仓库独立提交并说明结果。

### 简洁约束

全量旧 Note 迁移是 R5 的必交付项，范围为当前 JanusX 仓库。R2 建立全量清单和可重复预览，R5 完成所有旧 Note 的结构转换、链接修复、原文哈希与身份核对及独立 review；未知历史状态保留为事实说明，不转换为虚构的任务执行证据。

- 设计只维护在共同契约中，本文只维护交付与验收，执行状态随后只写入 task。
- 保留五 kind 与既有状态机；新增工程信息优先使用 URI、relations、codeRefs 和已裁决的接口字段。
- 反链、短摘录和普通链接均由源文档派生；不要求人工维护重复字段或第二份索引。
- 首版沿用内存索引与现有宿主缓存，按实际成本决定持久缓存；不引入数据库、通用图框架或后台索引服务。
- 正文双括号链接、代码推断接口、多任务调度、共享视角与跨仓原子提交均不进入本轮交付。

### 已裁决范围

保留已确认的 12 项裁决，作为范围边界；实现进展由对应 task 的验收证据证明。

| 项 | 裁决 |
|---|---|
| 能力注册表 | 砍，不新增 |
| 接口一等字段 | 采用最小字段，不进 contract hash；对应 S1.2 正式接入 |
| 机制行为栏 | 砍，不新增 |
| 边界栏 role 三档 | 后议，现有枚举不动 |
| 反链 | 实现层派生，已有基础复用 |
| 摘要字段 | 不加字段；索引提取并绑定源哈希 |
| 接口表进索引 | 消费接口声明，正文解释不另作机器真源 |
| 多任务调度 | S9 另立项 |
| AC 编号错配 | 工具层展示 Note URI、标题与 AC 编号 |
| hash 雪崩放宽 | 不改现行哈希语义 |
| lifecycle/execution 双轨 | 保留，文档和展示明确分工 |
| 接口载体结构化 | 约定与消费层接入，标准内容以 S1.2 为准 |

原先未开启的验收/验证/仓库/relation/文件名/class-tags/状态/版本单钉八项继续关闭，只有用户点名才重开。S1.2 仅在 R1 的消费者兼容性、三仓同步及独立 review 全部通过后激活；尚未实现的能力不得记为完成。

## Acceptance criteria

以下条目由对应 task 的实现和验收证据证明；未通过条目保持未完成。

- [x] AC-1: 三仓使用同一个正式 profile/version/digest；新版接口合法与非法样例在标准和消费者中判定一致，接口修改不改变原任务契约哈希；发布矩阵记录实际组合。
- [x] AC-2: 每个 Note 文件都有明确分类；有效条目、旧格式、外来格式、损坏、重复身份及未解析引用均可查。迁移保持已存在身份和可解析链接，不伪造执行证据；可用资产与剩余清单能够对账。
- [x] AC-3: 共同读模型完整保留身份、关系类型及附带信息、仓库/代码/接口声明、哈希和诊断。重建结果确定；外部编辑和分支切换使对应视图刷新，两个 checkout 不混用。
- [x] AC-4: 同一 Note 可从工程 wiki 与蓝图双向定位，目录、原文、一跳关系、反链与代码入口一致；正文链接归入引用层，不自动变成工程依赖。
- [x] AC-5: 知识 wiki 可引用多篇 Note，并能反查相关页面；来源哈希变化、目标缺失和仓库未接入分别展示；未复核内容不自动更新来源哈希，旧页面不被伪装为最新。
- [x] AC-6: xarch 建立合法架构师仓库并完成注册与投影；仅打开架构仓也可呈现全部模块声明；模块绑定明确区分 repoId 与本机 checkout，多候选不随机选中。
- [x] AC-7: 组合图支持跨仓解析、接口匹配与悬空需求，保留未接入及过期证据；同名接口不产生未经声明的连线，模块与任务状态不互相冒充。
- [x] AC-8: 维护提案支持全选及部分选择，依赖闭包、删除逐项确认、模式/白名单、expectedHash、审计和撤销连成可达流程；提案内容变化后重新确认，跨仓结果逐库可见。
- [x] AC-9: JanusX 仓库内全部旧 Note 迁移至正式新版本格式，迁移前后逐文件对账并通过解析校验；保留原始正文、既有 UUID、代码引用及可解析链接，不伪造执行回执。分类为 legacy/foreign 或登记保留理由不能代替旧 Note 迁移完成。真正非 Note 的辅助文件单独列清单；无法自动迁移的 Note 必须补齐并验收。旧蓝图内容经盘点、预览、确认后处理，原始事实没有静默丢失。
- [x] AC-10: 蓝图界面以 v11 为基线具备完整可达的操作；解析中间层、正式 Note 详情和右侧对话节点调整链均有针对性检查与可复现的交互验收。各阶段有独立 review 结论和修复记录。

## Verification

正式实施时，R1 使用标准校验、消费者 fixtures 与哈希锁；R2 核对全量清单、索引及投影样例；R3/R4 核对目录、引用、新鲜度、跨仓和 checkout 场景；R5 核对选择、冲突、删除及撤销链路。每段 task 再固定具体命令和人工演示步骤，未执行项保持未完成。

## Closeout

2026-09-25：本次重构计划完成。R1–R5 的交付与独立验收已落地；用户反馈的旧 Note 组织、完整工作台布局、右侧聊天和节点横排问题由 R6 补充修复并再次独立验收。AC-1 至 AC-10 的对应证据如下。

| 验收 | 交付记录 | 结果 |
|---|---|---|
| AC-1 | [R1 正式版本与配置](../tasks/note-blueprint-r1-version.md) | S1.2、三仓 profile 与受管规则通过 |
| AC-2、AC-3 | [R2 共同读取和解析中间层](../tasks/note-blueprint-r2-read.md) | 身份、元数据、关系和刷新通过 |
| AC-4、AC-5 | [R3 wiki 与来源审核](../tasks/note-wiki-r3.md) | 目录、关系、反链、来源与审核通过 |
| AC-6、AC-7 | [R4 架构师组合蓝图](../tasks/blueprint-r4.md) | 显式 checkout、接口和未接入状态通过 |
| AC-8 | [R5 维护闭环](../tasks/blueprint-r5.md) | 提案、选择、确认、事务、冲突和撤销通过 |
| AC-9、AC-10 | [R6 文档与工作台收口](../tasks/blueprint-note-workbench-repair.md) | 全量 187 篇 Note、两条顶部栏、三列主体、聊天与紧凑森林通过 |

R6 记录逐文件分类、原文追溯、链接对账、三个独立审查和实际测试边界。四篇迁移样例保留原 kind/draft 并明确标记为历史材料；历史原始蓝图 JSON 作为迁移备份保留。唯一既有内部链接诊断为当前不存在的 pelican-bicycle.html，不影响 Note 结构与迁移验收。完整工作台验收使用当前源码 Chromium fixture；真实供应商与 live Electron 联调未执行。
