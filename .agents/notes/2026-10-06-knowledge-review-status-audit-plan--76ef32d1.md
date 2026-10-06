---
schema: harness-note/1
id: 76ef32d1-3661-43cd-870f-f5d1377e862f
kind: task
lifecycle: accepted
created: 2026-10-06
class: bug-fix
tags: [knowledge, memory, review, automation, audit, graph, ui]
relations:
  - type: parent
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
  - type: implements
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
    criteria: [AC-4, AC-5, AC-6, AC-7, AC-8, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19]
  - type: governed-by
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/908d675a-aec9-4791-8c8b-05f1e4c923ca
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [package.json, package-lock.json, playwright.desktop.config.ts, scripts/check-packaged-runtime.mjs, src/shared/wiki-relations.ts, src/main/knowledge/, src/main/ipc/knowledge-handlers.ts, src/main/ipc/register.ts, src/shared/knowledge.ts, src/shared/knowledge-card.ts, src/shared/knowledge-automation.ts, src/shared/ipc/knowledge.ts, src/shared/review-candidate-snapshot.ts, src/preload/index.ts, src/renderer/src/components/knowledge/, src/renderer/src/components/KnowledgeAutomationPanel.tsx, src/renderer/src/services/knowledge.ts, src/renderer/src/services/knowledge-automation.ts, src/renderer/src/stores/, src/renderer/src/lib/electron-api-fallback.ts, src/renderer/src/i18n/, tests/unit/, tests/e2e/knowledge-pipeline.spec.ts, .agents/notes/]
  acceptanceRefs:
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-4
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-5
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-6
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-7
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-8
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-10
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-11
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-12
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-13
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-14
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-15
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-16
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-17
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-18
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
      criterionId: AC-19
  verification:
    - id: V-1
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, 'check:notes']
    - id: V-2
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, 'test:unit', --, --run, tests/unit/knowledge, tests/unit/memory-review-ui.test.ts, tests/unit/knowledge-review-state-ui.test.ts, tests/unit/knowledge-note-sources.test.ts, tests/unit/knowledge-automation-ui.test.ts, tests/unit/knowledge-automation-summary-ui.test.ts, tests/unit/knowledge-audit-ui.test.ts, tests/unit/assistant-ui.test.ts, tests/unit/knowledge-ipc-contract.test.ts, tests/unit/knowledge-note-ui.test.ts, tests/unit/knowledge-graph-ui.test.ts, tests/unit/planche-theme.test.ts, --maxWorkers=2, --reporter=dot]
    - id: V-3
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, 'typecheck:strict-unused']
execution:
  mode: xdo
  state: done
  baseline:
    taskContractHash: 738fd533469dc1aa7491720de1452c43466a303f64d79703d8bed1759c27f171
    inputs:
      - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b
        contentHash: 5e138e09085b7401be8ee5c0356727441db83c13663b4b7a931eeb046c561fda
        criteria: [AC-4, AC-5, AC-6, AC-7, AC-8, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19]
      - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/908d675a-aec9-4791-8c8b-05f1e4c923ca
        contentHash: 2ce421a4c6ac3f34fbbd83d424ddb3792ec49a85e80384f2dcf072fc9f542445
  attempt: 1
  receipts: []
  closeout: commit-required
---

# 知识库审核、图谱、状态与审计优化实施计划

## Scope

本任务承接[噪声与界面需求](./2026-10-06-memory-noise-progress-audit--81b578b4.md)中的审核详情、Wiki 主图、自动化状态和审计体验。父需求的“工程知识沉淀流程”与“Wiki 主图与证据追溯契约”是用户于 2026-10-06 确认的方向；本任务维护交付顺序、边界和验证。审核规划基线为 `abea07a`，图谱缺陷分析基线为 `fee6423`。S1 的状态绑定、旧操作收口和独立图关系准入已实现，当前批次的真实噪声与图关系积压已按用户授权清理；具体证据见 Results。W1 的主题组织、页间关系与同版本发布，以及 G1 的 Wiki 主图和来源追溯、S2 的审核卡片与详情重整已实现；S3 的自动化紧凑摘要和记录入口、S4 的审计分页与专用详情已实现；G2 的图谱局部阅读、二维布局与侧栏 Tab 已实现；S5 的跨入口验收和独立便携包交付已完成，全部阶段的证据见 Results。

已完成基线包括 `bd5d48e` 的个人噪声过滤与 `abea07a` 的工程准入和存量清理，对应父需求 AC-1～3、AC-9。Jev 凭据保存反馈、四环节模型配置、领域开关及 Wiki 历史已有实现，不重复列为开发任务；保留回归。新修复随 S5 的独立便携包交付；正在运行的旧便携进程尚未切换，不能把源码提交或旧窗口刷新当成运行态升级。

### 顺序、优先级与交付边界

后续实施沿用 xdo，由主代理直接串行执行。阶段之间复用同一任务与需求，不另建计划目录。每个阶段完成代码、相关回归和 Note 同步后原子提交；提交写明 Note 路径，核心入口保留反向引用。S5 通过前不把整个任务标为完成。

| 阶段 | 优先级与前置 | 负责的交付范围 | 退出条件 |
| --- | --- | --- | --- |
| S1 当前审核状态与旧操作收口 | P0；已完成，S5 独立包已交付 | 对齐自动任务、当前候选版本、可用动作及原因；新流程拒绝旧 score/refine，保留历史读取。停止独立图关系提议增长，旧记录只读，两个界面使用同一状态来源。 | 宿主兼容请求、当前版本绑定、两入口与领域/失败边界测试通过；授权存量清理完成。 |
| W1 Wiki 主题与关系发布 | P0；已实现，验证见 Results | 按明确概念细分主题，复用已有页面身份；关系纳入 Wiki 草稿、审核及同版本发布，保留拒绝、目标版本和来源保护。 | 生成、拒绝重放、目标失效及并发发布有隔离回归；图谱默认投影和画布仍由 G1/G2 完成。 |
| G1 图谱连线与数据正确性 | P0；已实现，验证见 Results | 默认投影已发布 Wiki 页间关系；补齐 React Flow 端点、工作区隔离及缺失诊断，事实/实体/旧证据仅在追溯中按需读取。 | 父需求 G1/G2 通过；主图对象正确，真实浏览器有路径且无锚点报错，输入顺序不改变有效关系。 |
| S2 审核卡片与详情重整 | P0；已实现，验证见 Results | 工作台、审核侧栏共用状态与动作规则；区分条目、Wiki 草稿及其关系、旧图记录和只读审计，整理正文、证据、替代影响和操作区。 | R1～R5 及 Wiki 关系审核呈现通过，同候选两入口一致，不重建独立关系审核页。 |
| S3 自动化紧凑摘要 | P1；已实现，验证见 Results | 复用共享订阅，在右侧助手导航下与工程工作台呈现范围明确的阶段、对象、等待及异常摘要；保留处理记录入口。 | P1～P4 验证通过，订阅、轮询、隐藏/恢复和未知状态没有重复请求或假运行提示。 |
| S4 审计分页与专用详情 | P1；已实现，验证见 Results | 宿主按领域/工作区过滤后分页，列表与计数同范围；保留完整事件快照，实现审计选择、前后变化、关联对象与加载更多。 | A1～A4 通过；审计没有审核按钮，旧事件缺字段不伪造；个人事件不挤占工程分页。 |
| G2 图谱阅读与布局 | P1；已实现，验证见 Results | Wiki 局部关系阅读与概览切换、二维分量布局、页面标题/关系及方向；点击打开 Wiki，单独展开证据，统一计数与空态说明。 | 父需求 G3 通过；稀疏页面和长标题在双主题、窄窗口中可读，主图与追溯对象数量不混淆。 |
| S5 跨入口验收与构建交付 | P1；已完成，验证见 Results | 集成回归、双主题/窄窗口/键盘验证、隔离 Electron 联调及新构建验证；核验 Wiki 正文、检索与主图版本一致。 | 本任务所引用 AC 有具体证据；明确可运行构建及其版本，实际切换前保护活跃会话，不自动中断终端。 |

阶段安排以逐环节细化结果和依赖推进，不编造工期。默认顺序为 S1 → W1 → G1 → S2 → S3 → S4 → G2 → S5；可提前单独修复锚点，但不能据此宣称 Wiki 主图已经实现。G1/G2 为阶段名，父需求 G1～G5 为测试用例编号，两者通过表中的退出条件对应。

### 后续逐项细化入口

S1/W1/G1/S2/S3/S4/G2/S5 的行为、契约和验证已记录；其余事项在对应环节落实时补入父需求的行为与验收、以及本任务的范围和证据，保留现有 UUID 与 AC 编号。

| 环节 | 待细化问题 | 对应实施位置 |
| --- | --- | --- |
| 知识提取 | 条目粒度、长期价值、重复/增量合并和证据完整性；沿用已交付噪声防线 | 父需求的提取基线及独立质量验证，按具体问题界定后续范围 |
| 条目审核 | 支持度、冲突/替代、异常原因、自动与人工分工、两入口动作 | S1/S2 |
| Wiki 生成 | 主题分组与身份规则见父需求 W1 契约；进一步的语义主题规划按真实样本评估 | W1 已实现 |
| Wiki 审核 | 正文覆盖与无依据扩写、引用目标/关系语义核验、失败重试 | W1/S2 |
| 发布与持续维护 | 正文和关系同版本发布、失效/撤回、历史隔离、人工接管兼容 | W1/S5 |
| 图谱与追溯 | Wiki 主图的局部/全局阅读、关系类型、页面跳转、证据展开、旧图记录兼容 | G1/G2，旧入口由 S1/S2 对齐 |
| 状态与审计 | 各阶段产物/异常可见性、范围和计数、可追溯操作 | S3/S4 |

### 修改位置与实施要点

**W1**：[主题分组](../../src/main/knowledge/wiki-topics.ts)及[页间关系校验](../../src/main/knowledge/wiki-relations.ts)落实父需求的“W1 页面与关系契约”。生成器只读取同工作区可用的已发布目标，优先复核已有草稿再生成下一主题。引用从真实 Markdown 链接解析，依赖与冲突由生成器提交来源条目并经过 Wiki 模型审核；宿主在事实/Wiki 锁内复核端点、版本和来源。relations 保存在候选与页面本身，正文、索引、关系、历史和候选状态复用现有可恢复发布事务。旧 graph-edge 不迁移为页面关系。

**G1/G2**：[KnowledgeGraphCanvas.tsx](../../src/renderer/src/components/knowledge/KnowledgeGraphCanvas.tsx) 为自定义节点提供不可编辑的 source/target Handle，[knowledgeGraph.ts](../../src/renderer/src/components/knowledge/knowledgeGraph.ts) 默认只投影已发布 Wiki 及宿主核验过的关系。主图和单页来源追溯分开；追溯先建立事实、文件/概念节点再解析替代和旧存储边，身份包含工作区。原始证据使用既有 observationRevocationContext 按工作区与 ID 读取，每批并发最多 4 项，刷新、离开或折叠时丢弃迟到结果。G2 的局部阅读以中心页面和两侧邻居布局，概览对连通分量作二维装箱；两行标题、关系标签和方向端点同时提供阅读信息，单击只打开详情。固定尺寸卡片声明端点几何，视图更新保留测量，避免 ResizeObserver 未重发时连线消失。

**S1**：[automation-service.ts](../../src/main/knowledge/automation-service.ts) 从当前 plans 投影任务、工作区和候选 hash，返回 `reviewStateVersion: 1` 及独立的工程审核开关。只有当前失败或待人工处理的任务可以重试；宿主复核任务、依赖和模型配置，拒绝过期任务。[共享状态源](../../src/renderer/src/services/knowledge-automation.ts)供侧栏、工作台与角标订阅，[候选状态判定](../../src/renderer/src/components/knowledge/candidateReviewState.ts)匹配当前快照，操作前再次读取宿主状态。未知或正在自动处理时不授权人工审核，个人候选保持人工确认，旧评分折叠为历史。新 automation 配置存在时，[candidate-actions.ts](../../src/main/knowledge/candidate-actions.ts)拒绝 score/refine，即使 automation 暂停也不进入旧队列；完全没有 automation 配置的旧宿主路径保持兼容。共享类型只扩展状态返回值，IPC 方法、preload 与 fallback 方法集合未变，合同回归通过。

S1 的确定性提取不生成共同文件关系；模型旧输出中的 graphEdges 不写入候选，派生候选入口也拒绝独立 graph-edge。旧存储可读、可通过既有维护 API 拒绝，界面显示只读记录；不自动接受或转为 Wiki 关系。2026-10-06 用户明确授权清理当前错误积累（含图谱审核），该批次按预览及快照核验处置，详见 Results；这项授权不构成产品自动删除历史的规则。W1 负责新语义关系的 Wiki 草稿及审核，S2 负责关系端点与依据的阅读布局。

**S2**：[MemoryReviewTool.tsx](../../src/renderer/src/components/knowledge/MemoryReviewTool.tsx) 与工作台 Inspector 复用审核内容、当前状态及动作。阅读区、来源、替代影响与底部操作分别组织；[CandidateEvidence.tsx](../../src/renderer/src/components/knowledge/CandidateEvidence.tsx) 按候选快照和来源工作区读取完整证据，失败、读取中或已撤回时阻止批准。[FactReviewControls.tsx](../../src/renderer/src/components/knowledge/FactReviewControls.tsx) 保留候选/目标 hash，来源变化、重新读取、忙碌或候选失效清除旧确认。Wiki 使用共享安全 Markdown，展开比较时读取同工作区的已发布版本及关系；来源 Note 缺失、hash 不匹配或非 fresh 状态不能通过界面批准。宿主仍在写入前校验版本及来源。旧评分折叠为历史，列表按条目、Wiki 草稿、已发布页面等分型，检索相关性与提取置信度分别命名。审计和旧图记录只读。

**S3**：调整 [AutomationStatus.tsx](../../src/renderer/src/components/knowledge/AutomationStatus.tsx)、[AssistantTool.tsx](../../src/renderer/src/components/knowledge/AssistantTool.tsx)、工作台及 S1 的共享订阅。首版采用全部工程范围并明确标识；个人功能单独开启时不读取或展示关闭的工程域。摘要复用宿主已加载对象生成可读标题，展示失败不回退为“空闲”。single-flight、最后一个订阅者离开停轮询、页面恢复刷新，按父需求给定的运行/空闲节奏测试；同一当前任务不在新旧队列摘要中重复计数。缺少真实开始时间时不显示虚构耗时。

S3 纳入用户确认的顶部布局：摘要不展开配置与记录，四环节说明移入设置，原“审计”入口承载“记录 → 处理记录 / 操作审计”。顶部普通入口打开处理记录，异常入口按当前有效任务筛选；200 条上限只在历史列表内说明。原 KnowledgeStatusBar 的采集/提取信息和手动动作移入记录内按需查看，不与新自动化的队列数量相加。宿主复用当前计划快照返回脱敏对象名及真实最近成功时间；客户端复用 single-flight 订阅，运行 2 秒、空闲及失败 10 秒，隐藏停止并在恢复时刷新。验证覆盖父需求 P1～P4，完成 AC-4/5；AC-8 的状态栏部分随 S3 验证，完整审计布局仍归 S4。

**S4**：调整 [audit-service.ts](../../src/main/knowledge/audit-service.ts)、[knowledge-handlers.ts](../../src/main/ipc/knowledge-handlers.ts)、[shared/ipc/knowledge.ts](../../src/shared/ipc/knowledge.ts)、[services/knowledge.ts](../../src/renderer/src/services/knowledge.ts) 及工作台。采用新增分页接口并保留现有数组读取方法。排序以事件真实时间和 ID 稳定续页，游标绑定领域、工作区与筛选。前端保留选中的完整 AuditEvent，详情读事件自身的 before/after；当前对象仅用于关联导航。批次、count-only、已撤回和未知动作有明确显示，历史审计不清空。

S4 采用新增 `knowledge:audit:page`，旧 `listAudit` 保持数组返回，查询和统计兼容扩展领域/工作区过滤。分页按真实时间与事件 ID 倒序，在同一读取快照中返回事件及计数。游标绑定过滤条件、日志前缀长度和 SHA-256；继续页固定该前缀，新增和补写事件在刷新后可见，历史被重写时明确要求刷新。个人域仅取 workspaceId=user，工程域排除 user、global 和缺失/空白归属；全域旧接口保留无明确归属记录。不增加持久索引，读取成本仍随日志长度增长。

操作审计使用独立分页列表和完整选中事件，工作台自动状态刷新不重置已加载的审计页。变更前后按事件字段比较，未变字段、长值和原始结构按需展开；批次或缺失快照明确说明。当前对象仅按明确类型、工作区及目标身份调用既有只读接口，已应用候选只有明确 appliedId 才能关联正式对象。读取当前值与历史快照分别呈现，失败或撤回不影响事件阅读。来源撤回历史保留在折叠入口，避免再次挤压列表。

记录区“处理记录 / 操作审计”参考 ProjectSettings 横向页签的透明底、文字选中态与强调色下划线，复用 ui/TabStrip.module.css，页签条高 34px，正文从下方独立起行。tablist、tab 和 tabpanel 使用组件实例 ID 关联，选中页签进入 Tab 顺序；左右方向键循环切换，Home/End 定位首尾。切换清除旧详情并挂载对应视图，任务筛选、审计分页和来源撤回入口沿用原有行为。
**S5**：用同一组合夹具贯通 W1、G1/G2 及 S1～S4；在已存在的 [knowledge-pipeline.spec.ts](../../tests/e2e/knowledge-pipeline.spec.ts) 基础上运行隔离 Electron，核验真实 preload/IPC 与宿主动作，以及从条目入库到 Wiki/图谱同版本更新的闭环。构建写入 artifacts/build-check，不覆盖正在运行的开发输出；将便携包写入独立交付目录，并验证包内构建身份、仓库外运行和便携启动器。若需要实际切换运行版本，先检查并保存会话状态；不能把“重启旧便携版”描述为装入新代码。

**S5 运行验收与交付**：使用独立 `playwright.desktop.config.ts` 执行真实 Electron、preload、IPC、自动任务和存储链路，不启动岛屿网页服务器。现有采集/人工审核/领域隔离用例保留，完整沉淀用例用回环 HTTP 模型夹具覆盖提取、两轮审核门禁、Wiki 同版本关系发布、后续来源更新、历史版本、撤回后的检索与主图隔离；可信来源归因在隔离存储夹具中预置，公共 observe IPC 不允许凭 actor 自行提升归因。测试结果必须区分流程验证和真实模型质量。构建输出和便携包保存在独立 artifacts 目录，运行检查接受明确的 `--release-dir`，在仓库外启动副本并隔离知识根目录；当前用户会话与便携目录不自动替换。工作台全局 Escape 优先关闭已打开的详情，即使焦点仍在图谱或领域导航；没有详情时才关闭工作台。Inspector 内的已处理按键不重复执行全局动作。

### 另列的未完成验证与优化

以下项不混入 W1、G1/G2 及 S1～S5 的功能验收，也不因历史 Note 曾勾选软件实现而视为完成。它们已有各自的事实来源，后续按触发条件确定独立任务；本轮不复制旧 AC 或重开已经完成的功能。

| 后续项 | 当前证据与未完成部分 | 进入实施的条件 |
| --- | --- | --- |
| P2 自动审核质量及覆盖率 | [统一内核 AC-8/20/21](./2026-09-28-unified-memory-laya-primary--736081fc.md)仍未完成；已有合成样本测试出现错误放行。旧 Laya 指标只作历史参考，质量目标应覆盖当前选用提供方。 | 固定独立样本、来源隔离和模型/模板版本，确定错误接受率、覆盖率与不确定候选的门槛；不能用零次接受或同模型复核代替。 |
| P2 外部与混合提供方实机闭环 | 同一内核 AC-23/24 的路由已有替身测试，纯外部和混合提供方真实服务验收仍缺。 | 明确测试提供方、可用凭据、费用与允许发送的合成/脱敏资料，分别验证成功、断网、限流和不可用时不擅自切换。 |
| P2 首次完整公网安装 | [分域控制验证](./2026-10-04-memory-domain-controls--908d675a.md)记录运行程序下载成功、权重完整公网下载失败；本地权重复用通过不等于首次下载通过。 | 隔离缓存完整下载并核对长度/哈希，验证取消和失败恢复；不改用户已启用状态。 |
| P2 硬件容量与长期 Wiki 质量 | 上述分域验证已覆盖本机 32K/64K 和八主题合成手册；128K/256K、其他 GPU、独立长资料及长期维护没有完成验收。内核 AC-22 保持开放。 | 固定硬件、资料版本与目标容量，复核数值/例外、修改后失效和撤回链路；每种硬件单独报告，不外推。 |
| P3 增量个人证据合并 | 父需求已解决相同历史重放；新增来源改变候选身份时的跨候选合并仍未实现。 | 收集重复提议的独立事件样例，设计保留来源与拒绝意图的合并规则；不得放宽已交付的偏好准入。 |
## Alternatives considered

把所有改动直接追加到需求正文最省文件，但会把问题、验收和执行状态混在一起；保留需求作为行为依据，以本任务维护唯一实施计划。一次重写整个知识工作台能统一样式，却扩大到已有可用的模型设置、个人画像和 Wiki 历史；本任务按 W1、G1/G2 及 S1～S5 复用现有模块。只修复混合图的连线无法满足 Wiki 主图定位，先明确 Wiki 关系与发布契约再完成主图，锚点故障可独立修复。

S1 继续复用旧评分和仅按候选 ID 分类最省改动，但旧任务不能证明新版本的审核状态；采用当前计划与候选 hash 绑定，并共享读取。代价是旧宿主没有版本字段时界面只能显示未知状态，活动订阅仍须周期性读取计划。共享订阅运行时每 2 秒读取，空闲或失败时每 10 秒读取；隐藏或最后一个订阅离开时停止。完全删除旧评分、关系格式与 API 可缩小兼容面，却会损失审计和存量处置入口；保留历史读取与维护能力，新提议统一关闭。W1 提供同版本 Wiki 关系后，再评估旧图格式的迁移范围。

S2 复用两入口的审核组件和现有 Markdown/只读来源接口，避免两套详情分别维护状态及写保护。维持原通用详情最省改动，但会继续混用历史评分、对象动作及原始 Markdown；重建独立审核服务会扩大 IPC 与事务边界，本阶段不采用。完整来源和已发布页面比较按需读取，代价是展开后才得到该次读取的可用性；已知失败保持阻止批准，最终写保护仍由宿主执行。来源缓存随候选快照失效，不新增持久副本。

S3 保留顶部的当前状态与入口，把配置和历史放入各自的阅读区域。继续在顶部折叠所有内容便于就地展开，但展开后仍会挤压知识正文；另建仪表盘会增加重复导航和状态来源。因此复用设置页及原审计导航，处理记录和操作审计分别承载任务与事件。代价是详细配置和历史需要一次跳转；摘要保留异常直达、等待数与最近完成时间。只从当前计划生成标题，旧历史没有对应对象时显示阶段名称，避免额外扫描来源或把新版本内容误认为旧任务标题。若实际记录检索需求超过最近 200 条，再单独扩展任务历史查询，S4 的事件分页不改变此上限。

S4 保留原列表接口并增加分页读取，避免将数组调用者一起改成页对象。继续前端截取最省改动，但无法恢复已被全域上限排除的工程事件；直接读取完整 JSON 能保留证据，却不能提供清楚的变更阅读。分页在已有日志上固定只读前缀，不新增索引或会话存储，代价是每页仍读取并解析该前缀；若真实大日志出现翻页延迟，再评估索引。标题仅从历史快照脱敏提取，缺失时显示对象类型；当前内容单独读取，不能拿今天的正文补写过去的快照。


G2 继续使用原圆点和横向分量排列的维护成本最低，但局部标题与稀疏集合不可读；通用力导向布局可表达密集结构，却需要碰撞与稳定性调参。确定性网格与分量装箱优先保证标题不重叠、稀疏集合紧凑，代价是密集关系可能交叉；局部邻居上限与独立概览承接该边界。如果真实高密度页面需要顺着大量跨层依赖阅读，再评估层次布局。局部视图保留 0.85 的最小自动适配缩放并允许平移；全部概览可缩小适配全图。选择不持久恢复，避免打开图谱时自动跳转右侧详情；拖动位置按视图保留。
**G2 与侧栏页签**：2026-10-06 用户授权将右侧“工程知识 / 个人画像 / 待审核”改为会话管理的文字与底部细线 Tab，并实施 G2。图谱采用 208×84 标题卡、带类型标签及箭头的关系线；默认选择连接最多的正式页面及最多 12 个邻居，页面选择器与“全部页面”提供明确切换，超限另行提示。单击只选详情，聚焦操作独立；筛选实际改变可见节点，页面与来源对象分别计数。局部页面居中、邻居分列两侧；概览分量内按确定性广度遍历排列网格，分量间二维装箱，旧圆点布局以 v3 存储键隔离，局部/概览/来源位置分别保存。页签沿用会话管理的 11.5px 文字、16px 间隔及 1px 底线，并支持方向键、Home/End、tab/tabpanel 语义。G3 验证覆盖 20 个孤立页面、多个分量、长标题、聚焦恢复、双主题与 640px。

记录区继续复用领域按钮组最省改动，但会把内容切换呈现为操作按钮；复制整个设置导航则会引入额外布局维护。本任务只采用设置横向页签的轻量视觉，复用共享 TabStrip 样式并保留知识库自身内容布局。共享样式的后续修改需要同时核对记录区与其他消费者的主题表现。

## Acceptance criteria

以下为父需求的引用，不另造或重编号行为条款。S1 完成 AC-11/12，W1 完成 AC-18，G1 完成 AC-15/16；S2 完成 AC-10/13/14 的内容分层、分数语义、有效动作和阅读布局。S3 完成 AC-4/5 及 AC-8 的状态摘要部分，S4 完成 AC-6/7 及 AC-8 的审计布局部分；G2 完成 AC-17 并落实右侧会话样式 Tab；S5 完成 AC-19 和独立便携包运行验收。本任务引用的验收条款均有证据。

- [x] [状态摘要 AC-4](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-4)、[共享订阅 AC-5](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-5)。
- [x] [审计详情 AC-6](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-6)、[审计分页 AC-7](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-7)、[布局 AC-8](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-8)。
- [x] [当前审核信息 AC-10](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-10)。
- [x] [旧操作收口 AC-11](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-11)、[两入口一致性 AC-12](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-12)。
- [x] [对象与动作 AC-13](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-13)、[审核阅读与操作布局 AC-14](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-14)。
- [x] [Wiki 主图与追溯 AC-15](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-15)、[图谱连线与数据 AC-16](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-16)。
- [x] [图谱阅读与计数 AC-17](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-17)。
- [x] [关系去重与端点保护 AC-18](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-18)。
- [x] [沉淀与持续更新 AC-19](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-19)。

## Verification

图谱扩展既有 [knowledge-graph.test.ts](../../tests/unit/knowledge/knowledge-graph.test.ts)，并增加真实画布浏览器回归，覆盖父需求 G1～G5；断言 SVG 路径生成和可见线段，同时监听 React Flow error 008。水平路径可能具有零高度包围盒，不能只依赖 Playwright 的元素 visible 判定，应结合路径、样式与截图。W1 扩展 automation-service 与 Wiki 审核/历史/恢复相关测试，覆盖正文和关系同版本发布、失败草稿隔离、拒绝后重放及目标页面失效。写入使用隔离存储，不操作在线库。

阶段验证优先扩展现有用例：S1 使用 candidate-actions、automation-service、memory-domain-controls 与 knowledge-ipc-contract；S2 使用 memory-review-tool、memory-review-ui、workbench-selection 与 knowledge-note-ui，补工作台右侧真实组件的状态矩阵，不能只验证侧栏；S3 使用 knowledge-automation-ui、knowledge-automation-summary-ui 和 assistant-ui，覆盖共享订阅计时、迟到响应和跨入口导航；S4 使用 audit-service、workbench-service、knowledge-ipc-contract 和 knowledge-audit-ui 的浏览器审计夹具。父需求 R/P/A 用例规定输入和断言。新增独立测试文件仅用于现有入口无法覆盖的行为，不为样式细节逐条造实现镜像测试。

公共检查入口如下；各阶段的实际结果见 Results：

```text
npm run test:unit -- --run tests/unit/knowledge tests/unit/memory-review-ui.test.ts tests/unit/knowledge-review-state-ui.test.ts tests/unit/knowledge-note-sources.test.ts tests/unit/knowledge-automation-ui.test.ts tests/unit/knowledge-automation-summary-ui.test.ts tests/unit/knowledge-audit-ui.test.ts tests/unit/assistant-ui.test.ts tests/unit/knowledge-ipc-contract.test.ts tests/unit/knowledge-note-ui.test.ts tests/unit/knowledge-graph-ui.test.ts tests/unit/planche-theme.test.ts --maxWorkers=2 --reporter=dot
npm run typecheck:strict-unused
npm run i18n:types
npm run i18n:check
npm run build:check
npm run check:package-boundary
npm run check:notes
git diff --check
```

对变更生产文件运行 ESLint。Electron 验证设置 `JANUSX_DESKTOP_ENTRY=artifacts/build-check/main/index.js`，再运行 `npx playwright test --config playwright.desktop.config.ts tests/e2e/knowledge-pipeline.spec.ts`；测试存储必须隔离。浏览器分别覆盖 320/390px 侧栏、640×720 窗口、1280×900 桌面与 dark/planche，实际点击审核卡片、展开长证据、检查 Wiki 阅读和操作位置、切换领域、翻页、用键盘关闭详情。保存合成数据截图和几何断言，并人工核对；截图不进入用户知识存储。

关键防回归包括：旧通知/工具包装不再提议；候选和替代目标 hash 失效拒绝写入；状态变化后不保留旧勾选；自动任务与人工审核并发不重复提交；关闭工程域不影响个人入口；审计 40 条较新个人事件与 35 条较旧工程事件按 30 条分页完整读取；错误读取不显示假空列表。S5 应记录各阶段实际命令、通过/失败/跳过数及未运行项，真实模型质量与发布包运行验证单独列出。

## Results

2026-10-06：S1 完成，主代理按 xdo 直接实施并自检，未委派代理。原任务契约固定于 `8c995628f10649840b7e6382b3bba28b1c9de0c6`，由 harness-core `taskContractHash` 得到 `63b9f9a215bfb03f3d04c1320223fdb9ac752de29f23a7f1bdddac3384432cf2`；验收来源为该提交的父需求，原始文件 SHA-256 为 `a4d895fb212f7e947fcd088f072917a16a007330b2e3a02f9bec0b42d237a52e`。本次补充共享 service 路径及真实组件测试入口，需求 AC 编号与行为约束保持稳定。

S1 机器验证：上述完整知识回归为 78 个文件通过、4 个按条件跳过，777 项通过、5 项跳过。真实 Chromium 同时挂载侧栏与工作台 Inspector，覆盖 pending/running/needs-review/failed、版本变化、状态读取失败、正确任务重试、共享请求及关闭后迟到响应；修正等待回调在关闭后发起请求的边界后，三个界面测试文件再次运行，25 项通过。`typecheck:strict-unused`、14 个变更生产文件 ESLint、`i18n:types`、`i18n:check`、`check:package-boundary` 和隔离 `build:check` 均通过；`check:notes` 为 247 篇、0 errors、27 项既有外部链接诊断，`git diff --check` 通过。模型使用替身，测试写入使用隔离存储。

用户授权的真实存量清理使用当前便携版的官方 renderer bridge/API。实际 userData 为 `release/0.9.0/data`，不能将早前 Roaming 存储快照冒充当前库。预览并拒绝 10 条工程错误候选及 27 条独立图关系候选，逐条核对后归档 4 条错误正式事实；图候选是三组错误事实共同文件关系的重复提议。14 条关联原始 observation 可读、未撤回，清理前后 SHA-256 一致。个人待审和确认事实本来均为 0；清理后工程待审、图关系待审、活动事实、Wiki 与已存图边也均为 0。

当前便携版工程开关原为关闭，自动化配置保存为开启。首次拒绝请求被领域门禁挡住；维护期间仅临时开启工程域并暂停自动化，完成后在 finally 恢复完整设置，复核相等。处理使用候选 hash 和既有拒绝/撤回审计，没有重写在线 JSONL、删除来源或重启应用/终端，临时调试监听已关闭。本地忽略产物 `artifacts/knowledge-s1-cleanup-plan.json`、`knowledge-s1-cleanup-result.json` 和 `knowledge-s1-cleanup-verified.json` 保留预览、审计及复核证据，不将完整私人数据提交入库。

截至 S1 结果记录时，任务仍为 proposed，G2、S5 未完成。图谱阅读与布局、真实模型质量、隔离 Electron 全流程及发布包切换仍待对应阶段。当前旧便携进程未装入新代码，源码能力需更新后的运行构建；原工程开关已恢复关闭，存量清理不等于运行版升级。

2026-10-06：W1 按 xdo 直接实施。验收固定于 `7c7b4ec021528e041f8cf956a3b94b05bcfd7fbb` 的本任务和父需求；任务契约 hash 为 `fbe5dff05516b214a39621bd4ee218882f098ddfcb83603b43e7402c39e9bb63`，父需求原始文件 SHA-256 为 `dba71f07733d49e1f1f263df91fff405c014b0b96152d158ae5bf72e9b9b7674`。新增纯分组/关系模块，扩展 shared 类型与知识合同，IPC 方法集合保持兼容。Markdown AST 解析器沿用已安装的 mdast-util-from-markdown 2.0.3，仅将声明从开发依赖移到运行依赖。

W1 不自动拆迁既有页面，也不因目标版本更新反复重写相互引用的页面：目标变化产生 relationIssues，正文保留；新的来源版本在下一次生成时重新选择有效目标。目录最多提供 20 页、12,000 字符，单页超过 6,000 字符时不作为自动生成关系的目标，并向模型标明目录截断；关系复核超出预算进入人工处理。新目标发布不会触发全库重写，较早页面的新增关联随来源更新或显式全文提议处理。引用编辑使用 canonical wiki URI；完整审核布局与关系依据阅读见 S2 结果。

依赖调整曾使 npm 将本机已安装的六个 @janus-agent 包替换成指向不完整相邻 checkout 的链接，并移除 yaml。依赖已恢复到本工作区 node_modules；从相邻 workflowx 构建恢复的 108 个运行 JS 文件与当前便携包逐字节一致，类型也恢复。没有修改相邻仓库、应用数据或打断正在运行的会话，package-lock 只保留 Markdown 解析器的依赖分类变更。

W1 机器验证：Verification 中的完整知识回归为 79 个文件通过、4 个按条件跳过，792 项通过、5 项跳过，日志为本地忽略产物 `artifacts/knowledge-w1-acceptance.log`。隔离存储覆盖关系同版本发布、历史与回滚、关系独立修改、并发请求、目标变化/来源撤回、跨工作区及无绑定引用；自动化测试覆盖拒绝后更换模型仍不重放、新来源生成新版本，以及两个新主题先发布再引用。真实 Chromium 组件测试覆盖已发布关系与目标版本变化提示；模型输出使用替身，未执行真实模型质量评估或完整 Electron 端到端验收。

W1 的 `npm run typecheck:strict-unused`、12 个变更生产文件 ESLint、`npm run i18n:types`、`npm run i18n:check`、`npm run check:package-boundary` 和 `npm run build:check` 均通过。构建输出为 `artifacts/build-check`，当前旧便携进程未切换；图谱投影与连线的 G1 实现及验证见下文。

W1 收尾检查：`npm run check:notes` 为 247 篇、0 errors、27 项既有外部链接诊断；`git diff --check` 通过。

2026-10-06：G1 按 xdo 直接实施并自检。验收基线为 `e91f6d76eebf2d5454d82192c38c382091caf401`；该提交任务的 taskContractHash 为 `3b45212254949e1c3c3b01bf752c425f319a941887490c3b94f2549210b9e340`，父需求原始 SHA-256 为 `8a7c326c623001aae1759f37c360597e59ba6f362794de984ced5877408cf623`。主图直接读取 snapshot.wikiPages，不从卡片、旧图边或关键词补造关系；目标身份、版本与宿主 relationIssues 决定连线可用性。缺少宿主核验字段时明确诊断，不当作已核验关系。

G1 的事实/实体/原始证据留在以所选 Wiki 为根的独立追溯视图。旧关系只在已加载端点之间读取，缺失端点、重复身份、来源失效、目标变化、证据未加载及读取失败分别说明；节点超过 500 时显示截断，先保留 Wiki 和事实，并去掉悬空边。证据上下文读取覆盖完整来源存储，当前按 ID 复用既有接口，因此大量证据会重复扫描来源；若实测展开延迟过高，再扩展同工作区批量只读查询。失败可重试，原始记录不可用时不拼造正文。

G1 浏览器验证使用真实 Canvas、React Flow 和 Inspector，宿主读操作为替身；已核对 dark/planche 的实际 SVG 路径、线宽、颜色和截图，没有缺失锚点 error 008。单击页面打开完整正文，独立追溯显示 Wiki → 条目 → 原始证据及文件，返回主图丢弃迟到的证据结果。只读证据、实体及关系详情不显示无效审核/归档按钮；审核详情设计与验证见 S2 结果。截图保存在本地忽略目录 `artifacts/knowledge-g1-browser/`，没有写入用户知识库或切换当前便携版。稀疏图的二维布局、长标题及完整窄窗口阅读仍归 G2，完整 Electron 端到端闭环仍归 S5。


G1 完整机器回归使用 Verification 中的知识库命令，81 个文件通过、4 个按条件跳过，816 项通过、5 项跳过；日志为本地忽略产物 `artifacts/knowledge-g1-acceptance.log`。测试包含 4 项真实 Chromium 画布交互及两主题路径验证；隔离宿主测试确认旧证据不在最近 40 条时，仍可按同工作区 ID 读取，错误工作区拒绝且读取前后存储一致。`npm run typecheck:strict-unused`、3 个变更生产 TS/TSX 文件 ESLint、`npm run i18n:types`、`npm run i18n:check`、`npm run check:package-boundary` 及 `npm run build:check` 均通过；隔离构建输出为 `artifacts/build-check`。

G1 文档与提交检查：`npm run check:notes` 为 247 篇、0 errors、27 项既有外部链接诊断；`git diff --check` 通过。

2026-10-06：S2 按 xdo 直接实施并自检，未委派代理。验收固定于基线 `9bc9b4685d8ae957aac6e0ca8a593ce1eb53c804`；taskContractHash 为 `dd35d4b201685f653edd2c718c800809d2f5aee191767908c314cf65e373b11c`，父需求原始 SHA-256 为 `f83654e9434f45cb0c4f15b1efb95121300e7ff948f42ab07d2f947dbacf4093`。本阶段补充 shared/knowledge-card.ts 到范围，保留正式条目状态及搜索正文，避免详情截断或归档状态被误判。接口方法与存储格式未变。

S2 完整知识回归使用 Verification 中的命令，81 个文件通过、4 个按条件跳过，828 项通过、5 项跳过，日志为 `artifacts/knowledge-s2-acceptance.log`。真实 Chromium 两入口测试扩展到 15 项，覆盖当前任务状态、候选变化、来源失败/撤回/迟到、替代确认失效、Wiki 版本和关系来源比较、只读对象、快速重复点击及键盘关闭后焦点恢复；宿主并发、hash、领域门禁及拒绝重放保护随完整套件回归。

浏览器覆盖 320/390px 侧栏、640×720 窗口和 1280×900 桌面，分别使用 dark/planche；长正文、证据、ID、表格及代码不造成横向溢出，操作保留在阅读区外。机器检查元素几何、滚动和焦点，人工核对窄侧栏、窄工作台与桌面截图；合成截图位于 `artifacts/knowledge-s2-browser/`。Markdown 不执行 HTML，原始证据按文本显示，源图片不自动加载。模型与宿主 IPC 使用替身，完整 Electron 验收和便携包更新仍归 S5。

S2 的 `npm run typecheck:strict-unused`、7 个变更生产 TS/TSX 文件 ESLint、`npm run i18n:types`、`npm run i18n:check`、`npm run check:package-boundary` 和 `npm run build:check` 均通过。隔离构建输出为 `artifacts/build-check`，未切换或重启当前便携版，也未再次修改在线知识存储。`npm run check:notes` 检查 247 篇 Note，0 errors、27 项既有外部链接诊断；`git diff --check` 通过。本任务保持 proposed，当前阶段状态见 Scope；S5 完成运行交付验收后再关闭整篇任务。

2026-10-06：S3 按 xdo 直接实施并自检，未委派代理。验收基线为 `7a0cc2c0d6015b4b6685863d19fcd8eac7ca583b`；taskContractHash 为 `2bb6f201a2a97fdb08cc696624205851d4802af6f4b3121c61249ffbb03b2845`，父需求原始 SHA-256 为 `39a05e9b2b437f5e4dd0cbdd345be01dc5bcf821a183c1b4c84d63eec5ef39ee`。本阶段纳入用户确认的顶部布局，范围补充 KnowledgeAutomationPanel，验证入口补充摘要及助手浏览器测试；AC 编号保持稳定。

摘要以“全部工程”标识范围，顶部只呈现两行状态及记录、设置入口。“处理范围与环节”在设置中读取，手动运行与历史补扫继续先保存设置；处理记录与操作审计共用“记录”导航下的两个视图。当前队列与历史分开显示，历史失败不获得当前任务的重试能力，当前异常入口不混入旧失败数量。宿主复用计划快照返回最多 96 字符的脱敏标题，不额外读取原文；已完成任务缺少当前计划时只显示阶段，不查找其他版本标题。工程历史、计数及最近成功时间排除个人域，真实最近成功时间不受最近 200 条窗口限制。接口扩展为可选返回字段，IPC 方法和存储格式不变，模块声明同步接口含义。

S3 知识回归使用 Verification 中的知识库命令（该次不含独立 assistant-ui 文件），82 个文件通过、4 个按条件跳过，844 项通过、5 项跳过，日志为 `artifacts/knowledge-s3-acceptance.log`。其中新增摘要浏览器测试 13 项，覆盖真实组件、运行 2 秒/空闲 10 秒、共享请求、慢响应、错误刷新、隐藏/恢复、最后订阅卸载及迟到结果隔离。宿主测试覆盖只读标题、工作区隔离、脱敏，以及 201 条较新失败与个人成功记录不改变工程最近成功时间。另行运行 `npm run test:unit -- --run tests/unit/assistant-ui.test.ts --maxWorkers=2 --reporter=dot`，6 项全部通过；测试移除与 S2 单层详情不一致的旧卡片边框比较，保留领域隔离、布局、真实加载反馈及快捷入口验证。

真实 Chromium 验证 dark/planche、320/390/640/1280px；摘要高度不超过 64px，工程顶部不超过 72px，长中文标题与技术 ID 不产生横向溢出。键盘可聚焦并打开当前异常，处理记录与操作审计切换、设置跳转和工程开关关闭均有交互断言。人工核对窄侧栏、窄工作台及中文运行态截图，产物位于忽略目录 `artifacts/knowledge-s3-browser/`。模型和宿主接口使用替身，未执行真实模型质量或完整 Electron 端到端验收。

`npm run typecheck:strict-unused`、10 个变更生产 TS/TSX 文件 ESLint、`npm run i18n:types`、`npm run i18n:check`、`npm run check:package-boundary` 及 `npm run build:check` 均通过。隔离构建输出为 `artifacts/build-check`。`npm run check:notes` 为 247 篇、0 errors、27 项既有外部链接诊断，`git diff --check` 通过。当前便携版与在线知识存储未改动。AC-4/5 完成；AC-8 仅摘要部分完成，审计完整详情/分页归 S4，图谱阅读归 G2，运行交付归 S5，任务整体保持 proposed。

2026-10-06：S4 按 xdo 直接实施并自检，未委派代理。验收基线为 `d4d12a7d99c389b52850b752900d6038ff2b9630`；taskContractHash 为 `67d12a74db4ca894139e00889ac6d725a9c6d42b3f894508fc1e207d746b1ec3`，父需求原始 SHA-256 为 `b6e91357052d92000f91b8b0469e772a8419d9d20d02a79b1b3f5bfb1264e556`。本阶段增加 auditPage 到 shared/preload/宿主/fallback，旧列表和无参数统计保留兼容，模块声明同步审计读取契约。验证入口增加 knowledge-audit-ui。

审计分页在宿主过滤后返回事件、总数及操作计数，游标固定日志前缀与过滤条件；同时间戳以事件 ID 稳定排序，确定性恢复事件按 ID 去重，缺少可靠时间时排到有效时间之后。未分类的全局/缺失归属事件保留在全域读取，不进入工程或个人分页。历史标题由快照脱敏生成并限制 120 字符；缺少标题只显示对象类型，不查询其他版本补造历史。列表选中使用 event.id，右侧保留完整事件，显示前后值、执行者、领域、时间和来源，长值与未变字段按需展开。旧 AuditList 样式已移除，审计使用现有语义颜色。当前对象的独立只读查询不改变历史快照，加载失败、缺失与工作区不匹配明确显示不可用。

S4 完整知识回归使用 Verification 中的命令，84 个文件通过、4 个按条件跳过，870 项通过、5 项跳过，日志为 `artifacts/knowledge-s4-acceptance.log`。宿主夹具覆盖 40 条较新个人事件与 35 条工程事件按 30 条分页、同时间戳、新增及补写事件、过滤切换、游标无效/历史重写、未知归属和标题脱敏；IPC 验证完整 63 方法集合、分页查询转发及原始快照返回。测试读写使用隔离存储。

13 项真实 Chromium 审计测试覆盖加载更多、筛选重置、同一对象多事件选中、前后变更、批次与未知动作、当前对象隔离、重复点击、读取失败、迟到响应及工作台背景刷新。640/1280px 工作台和 320/390px 独立详情在 dark/planche 下均无横向溢出，关闭按钮在长内容滚动后仍可达；Enter 打开详情，Escape 关闭并返回原记录焦点。源 HTML 只作为文本展示，未创建图片元素或执行事件。人工核对窄详情、640px 浮层和中文桌面截图，产物位于忽略目录 `artifacts/knowledge-s4-browser/`。订阅清理的静态检查告警修正后，13 项浏览器测试再次全部通过。

`npm run typecheck:strict-unused`、10 个变更生产 TS/TSX 文件 ESLint、`npm run i18n:types`、`npm run i18n:check`、`npm run check:package-boundary` 和最终 `npm run build:check` 均通过。隔离构建位于 `artifacts/build-check`。`npm run check:notes` 为 247 篇、0 errors、27 项既有外部链接诊断，`git diff --check` 通过。AC-6/7 完成，AC-8 的摘要与审计部分均已有证据。完整 Electron 联调、真实模型质量及便携版切换未运行；当前便携版和在线知识存储未改动。本任务保持 proposed，当前阶段状态见 Scope；S5 完成运行交付验收后再关闭整篇任务。
2026-10-06：G2 按 xdo 直接实施并自检，未委派代理。验收固定于基线 `1fa44d4905cc11b5eb123301e5bc02362b40843f` 的 AC-17；taskContractHash 为 `8b70b0c27a7a6d7a0f9898b17298848311cb6df2c6f7d53097d60cf989663372`，该基线父需求原始 SHA-256 为 `0d95d108f0128421b9e40e1ac26b9be7fc3850e1370812a1e635b77b292b1c3b`。本阶段同时纳入用户明确要求的右侧会话样式 Tab，行为在本 Note 与父需求同步；范围、AC 编号及宿主接口保持稳定。

G2 完整知识回归使用 Verification 中的命令，84 个文件通过、4 个按条件跳过，878 项通过、5 项跳过，日志为 `artifacts/knowledge-g2-regression.log`。图谱适配器 19 项覆盖 20/500 个孤立页面的二维范围与不重叠、多连通分量重排一致、局部邻居上限、布局作用域、既有 Wiki 投影及来源隔离。真实 Chromium 图谱 8 项和助手 8 项覆盖长标题、局部/概览切换、单击详情、聚焦、拖动后位置保持、过滤计数、带标签箭头、12/19 邻居提示、按工作区读取旧证据以及迟到请求隔离。固定卡片几何提供四个 source/target 端点，视图更新后的连线不依赖尺寸观察器再次触发。

浏览器覆盖 640×800 图谱、1280×800 桌面以及 320×720 侧栏，使用 dark/planche 与中英文；窄窗口无页面横向溢出，局部图保持阅读缩放并可平移，全部概览按图规模缩小。页签使用方向键和 Home/End 切换，活动页签与内容区域正确关联。人工核对局部阅读、20 页概览、多分量、完整 Wiki 详情和下划线页签截图，产物位于忽略目录 `artifacts/knowledge-g2-browser/`，沿用的 Wiki/追溯截图位于 `artifacts/knowledge-g1-browser/`。密集概览的交叉线和长标题省略通过显式局部阅读、悬停全文与详情查看处理。

`npm run typecheck:strict-unused`、3 个变更生产 TS/TSX 文件 ESLint、`npm run i18n:types`、`npm run i18n:check`、`npm run check:package-boundary` 与 `npm run build:check` 均通过，隔离构建位于 `artifacts/build-check`，构建日志为 `artifacts/knowledge-g2-build.log`。`npm run check:notes` 为 247 篇、0 errors、27 项既有外部链接诊断；`git diff --check` 通过。AC-17 完成，下一阶段为 S5 跨入口验收与构建交付，整篇任务及父需求仍为 proposed。完整 Electron 联调、真实模型质量及便携版切换本阶段未运行，当前在线知识存储未改动。

2026-10-06：S5 按 xdo 直接实施并自检。输入基线为 `532e45e6dc0ead98e1d738fb515d79a9fe6698b5`，开始实施时 taskContractHash 为 `6b0894b3e71c7db35375e298608c1e61f27b7610463722957ef81828260c294b`，父需求原始 SHA-256 为 `a27ea88540d2492ea1cc4de454bdd7280af7b78cd96a5ed115a9b526d8423399`。S5 补充独立桌面配置及运行检查入口，验收条款内容与编号保持稳定；当前收尾合同及输入固定于 execution.baseline。真实 Electron 验收定位并修复焦点在详情外时 Escape 直接退出工作台的问题，assistant-ui 的既有跨领域用例覆盖该回归。

完整知识回归使用 Verification 中的命令，84 个文件通过、4 个按条件跳过，878 项通过、5 项跳过；日志为 `artifacts/knowledge-s5-regression.log`。最终 `npm run typecheck:strict-unused`、生产 KnowledgeWorkbench 与桌面配置的 ESLint、运行检查脚本的 `node --check`、`npm run i18n:types`、`npm run i18n:check`、`npm run check:package-boundary` 和 `npm run build:check` 通过。测试文件与脚本处于仓库 ESLint 忽略范围，不将忽略提示记为检查通过；TypeScript 与实际运行分别验证它们。

独立构建和仓库外便携包副本分别运行 `npx playwright test --config playwright.desktop.config.ts tests/e2e/knowledge-pipeline.spec.ts`，各 2 项通过、0 跳过。源码构建设置 `JANUSX_DESKTOP_ENTRY=artifacts/build-check/main/index.js`；便携包验证设置 `JANUSX_DESKTOP_EXECUTABLE` 为临时目录内的 JanusX.exe，测试期间隔离用户配置和知识存储。真实 preload、IPC、任务、HTTP 模型传输和持久化贯通采集、条目审核、Wiki 草稿、失败审核、重试发布、第二页面引用、版本 2 更新、版本 1 历史、检索和来源撤回。撤回后页面保留 stale 状态供追溯，其正文不进入默认上下文，主图移除相应关系。独立图谱审核队列为空。模型回复及可信来源归因使用明确的夹具，不代表真实模型正确率。替代、并发发布及目标失效仍由完整知识回归中的宿主用例覆盖。

真实界面从助手入口打开工作台，在 dark/planche、1280×800 和 640×720 下验证 Wiki 正文、连线、关闭详情以及窗口无横向溢出；窄图使用现有适应画布控件后，全部节点位于画布内。截图等待详情退场并关闭动画，人工核对正文、关系标签、箭头与窄图，产物为 `artifacts/knowledge-s5-desktop/`。阶段日志为 `artifacts/knowledge-s5-final-e2e.log` 和 `artifacts/knowledge-s5-packaged-e2e.log`。

交付包为 `artifacts/knowledge-s5-release/JanusX-0.9.0-x64-portable.exe`，版本 0.9.0，112076661 字节，SHA-256 为 `034d8b32b7fc3e2e092c5013c0249628ef81d338cc754a4bc33275267a1b1cc4`。`npx electron-builder --config artifacts/knowledge-s5-builder.cjs --win portable --x64 --publish never` 使用当前 builder 配置，将输出改为独立目录、排除旧 out，并将 artifacts/build-check 映射为包内 out。包内 209 个构建文件逐一核对 SHA-256 一致，身份清单为 `artifacts/knowledge-s5-build-identity.json`。构建输入包括实施基线、本次代码变更，以及构建前已有的 blueprint.css 和 electron-builder.yml 工作区修改；这些原有修改未混入本次提交，具体输入哈希见本地交付清单 `artifacts/knowledge-s5-delivery.json`。

`node scripts/check-packaged-runtime.mjs --release-dir artifacts/knowledge-s5-release --portable` 的进程退出码为 0，验证仓库外 unpacked、副本解包后的便携载荷和启动器。LLM 适配器加载及模块图检查通过；ASAR 有效载荷 171.0 MiB、解包依赖 11.1 MiB、便携包 106.9 MiB，均在既有预算内，未携入工作区缓存目录。日志为 `artifacts/knowledge-s5-runtime.log`。当前运行的用户便携进程、终端和在线知识存储未切换；独立包已可使用，切换时仍需用户自行选择无活跃任务的时机。本任务 execution.state 为 done；父需求 AC-1～19 均已交付，真实提供方质量、首次下载、硬件容量及增量个人证据合并仍按 Scope 中的独立事项保留。

S5 文档检查使用 npm run check:notes，247 篇 Note、0 errors、27 项既有外部链接诊断；git diff --check 通过。用户已确认的实施任务与父需求转为 accepted，执行完成状态仅保存在本任务，后续质量验证不阻塞本轮功能交付。

验收完成后的临时副本清理被自动审批拒绝，仅返回 blocked by policy。仓库外临时目录仍保留，其路径记录在 artifacts/knowledge-s5-package-stage.txt；交付包、代码提交与通过结果不受影响。

2026-10-06：记录页签细化按 xdo 实施，输入基线为 `905c04e67b76a558fccfbfe02134bea056a0f84e`，原 taskContractHash 为 `88f27e112c5494fbfa95d4e53d5eec0f6d363c405ecf2181cdb8b04276563476`，父需求 SHA-256 为 `5e138e09085b7401be8ee5c0356727441db83c13663b4b7a931eeb046c561fda`。用户要求落实在 AC-8 的记录布局内，不新增审核或记录状态。KnowledgeWorkbench 使用共享文字页签样式与可访问的键盘切换；宿主接口、数据及领域开关无变更。

`npm run test:unit -- --run tests/unit/knowledge-audit-ui.test.ts tests/unit/knowledge-automation-summary-ui.test.ts tests/unit/assistant-ui.test.ts --maxWorkers=2 --reporter=dot` 为 3 个文件、34 项通过，0 跳过。既有浏览器用例覆盖方向键循环、Home/End、焦点、页签与面板关联、鼠标切换，以及处理筛选和审计分页。`npm run typecheck:strict-unused`、KnowledgeWorkbench.tsx 的 ESLint 及 `npx electron-vite build --outDir artifacts/knowledge-record-tabs-build` 通过；构建使用现有 llm-core 产物。人工核对 dark/planche、640px 窄窗口与 1280px 桌面截图，产物在 `artifacts/knowledge-record-tabs/`，日志前缀为 `artifacts/knowledge-record-tabs-`。本次只交付代码与隔离构建，S5 便携包保留原哈希，尚未纳入此次样式细化；当前用户进程没有重启。

本次 check:notes 检查 247 篇 Note，0 errors、27 项既有外部链接诊断；git diff --check 通过。

2026-10-06：用户授权日期免安装预览包，交付 `release/preview-2026-10-06/JanusX-0.9.0-preview-2026-10-06-x64-portable.exe`。功能代码固定于 `5f4a2110cefc8d924602e05e7dcfd338e47d1c76`，包含本任务全部阶段与记录 Tab 细化；程序基础版本仍为 0.9.0，日期和 preview 标记用于识别产物。可执行文件 112083504 字节，SHA-256 为 `70c2c9afc8500b8120f67d9070c33376c554c21783a94a7c190d330199d6f504`；同目录 README-preview.txt、SHA256SUMS.txt 和 preview-manifest.json 保存使用说明、校验值及构建来源。

打包使用 `npx electron-builder --config artifacts/knowledge-preview-2026-10-06-builder.cjs --win portable --x64 --publish never`，将已验证的 artifacts/knowledge-record-tabs-build 映射到包内 out；209 个构建文件逐一校验一致。包内不含工作区缓存目录，构建前已有的 builder 配置及 blueprint 样式等四项工作区差异保持原样，哈希记录在 manifest。`npm run check:package-boundary` 通过；`node scripts/check-packaged-runtime.mjs --release-dir artifacts/knowledge-preview-2026-10-06 --portable` 退出码 0，覆盖仓库外运行、便携载荷及启动器。ASAR 有效载荷 171.0 MiB、解包依赖 11.1 MiB、便携文件 106.9 MiB，均在现有预算内。以 JANUSX_DESKTOP_EXECUTABLE 指向新包的 win-unpacked/JanusX.exe 运行 knowledge-pipeline.spec.ts，2 项通过、0 跳过，存储与用户配置隔离。带日期的交付副本与已验收的便携文件 SHA-256 相同。打包日志前缀为 artifacts/knowledge-preview-2026-10-06-；当前用户运行进程和在线知识数据未切换，Scope 中独立模型质量等后续事项仍保留。
