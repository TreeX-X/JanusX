---
schema: harness-note/1
id: 76ef32d1-3661-43cd-870f-f5d1377e862f
kind: task
lifecycle: proposed
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
      paths: [package.json, package-lock.json, src/shared/wiki-relations.ts, src/main/knowledge/, src/main/ipc/knowledge-handlers.ts, src/main/ipc/register.ts, src/shared/knowledge.ts, src/shared/knowledge-card.ts, src/shared/knowledge-automation.ts, src/shared/ipc/knowledge.ts, src/shared/review-candidate-snapshot.ts, src/preload/index.ts, src/renderer/src/components/knowledge/, src/renderer/src/services/knowledge.ts, src/renderer/src/services/knowledge-automation.ts, src/renderer/src/stores/, src/renderer/src/lib/electron-api-fallback.ts, src/renderer/src/i18n/, tests/unit/, tests/e2e/knowledge-pipeline.spec.ts, .agents/notes/]
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
      args: [run, 'test:unit', --, --run, tests/unit/knowledge, tests/unit/memory-review-ui.test.ts, tests/unit/knowledge-review-state-ui.test.ts, tests/unit/knowledge-note-sources.test.ts, tests/unit/knowledge-automation-ui.test.ts, tests/unit/knowledge-ipc-contract.test.ts, tests/unit/knowledge-note-ui.test.ts, tests/unit/knowledge-graph-ui.test.ts, tests/unit/planche-theme.test.ts, --maxWorkers=2, --reporter=dot]
    - id: V-3
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, 'typecheck:strict-unused']
---

# 知识库审核、图谱、状态与审计优化实施计划

## Scope

本任务承接[噪声与界面需求](./2026-10-06-memory-noise-progress-audit--81b578b4.md)中的审核详情、Wiki 主图、自动化状态和审计体验。父需求的“工程知识沉淀流程”与“Wiki 主图与证据追溯契约”是用户于 2026-10-06 确认的方向；本任务维护交付顺序、边界和验证。审核规划基线为 `abea07a`，图谱缺陷分析基线为 `fee6423`。S1 的状态绑定、旧操作收口和独立图关系准入已实现，当前批次的真实噪声与图关系积压已按用户授权清理；具体证据见 Results。W1 的主题组织、页间关系与同版本发布，以及 G1 的 Wiki 主图和来源追溯、S2 的审核卡片与详情重整已实现；下一阶段为 S3 自动化紧凑摘要。

已完成基线包括 `bd5d48e` 的个人噪声过滤与 `abea07a` 的工程准入和存量清理，对应父需求 AC-1～3、AC-9。Jev 凭据保存反馈、四环节模型配置、领域开关及 Wiki 历史已有实现，不重复列为开发任务；保留回归。当前便携版未装入新修复属于交付缺口，不能把源码提交或旧窗口刷新当成运行态升级。

### 顺序、优先级与交付边界

后续实施沿用 xdo，由主代理直接串行执行。阶段之间复用同一任务与需求，不另建计划目录。每个阶段完成代码、相关回归和 Note 同步后原子提交；提交写明 Note 路径，核心入口保留反向引用。S5 通过前不把整个任务标为完成。

| 阶段 | 优先级与前置 | 负责的交付范围 | 退出条件 |
| --- | --- | --- | --- |
| S1 当前审核状态与旧操作收口 | P0；已完成，运行版更新待交付 | 对齐自动任务、当前候选版本、可用动作及原因；新流程拒绝旧 score/refine，保留历史读取。停止独立图关系提议增长，旧记录只读，两个界面使用同一状态来源。 | 宿主兼容请求、当前版本绑定、两入口与领域/失败边界测试通过；授权存量清理完成。 |
| W1 Wiki 主题与关系发布 | P0；已实现，验证见 Results | 按明确概念细分主题，复用已有页面身份；关系纳入 Wiki 草稿、审核及同版本发布，保留拒绝、目标版本和来源保护。 | 生成、拒绝重放、目标失效及并发发布有隔离回归；图谱默认投影和画布仍由 G1/G2 完成。 |
| G1 图谱连线与数据正确性 | P0；已实现，验证见 Results | 默认投影已发布 Wiki 页间关系；补齐 React Flow 端点、工作区隔离及缺失诊断，事实/实体/旧证据仅在追溯中按需读取。 | 父需求 G1/G2 通过；主图对象正确，真实浏览器有路径且无锚点报错，输入顺序不改变有效关系。 |
| S2 审核卡片与详情重整 | P0；已实现，验证见 Results | 工作台、审核侧栏共用状态与动作规则；区分条目、Wiki 草稿及其关系、旧图记录和只读审计，整理正文、证据、替代影响和操作区。 | R1～R5 及 Wiki 关系审核呈现通过，同候选两入口一致，不重建独立关系审核页。 |
| S3 自动化紧凑摘要 | P1；依赖 S1，并在 S2 接入稳定后实施 | 复用共享订阅，在右侧助手导航下与工程工作台呈现范围明确的阶段、对象、等待及异常摘要；保留处理记录入口。 | P1～P4 验证通过，订阅、轮询、隐藏/恢复和未知状态没有重复请求或假运行提示。 |
| S4 审计分页与专用详情 | P1；依赖 S2 的对象分型 | 宿主按领域/工作区过滤后分页，列表与计数同范围；保留完整事件快照，实现审计选择、前后变化、关联对象与加载更多。 | A1～A4 通过；审计没有审核按钮，旧事件缺字段不伪造；个人事件不挤占工程分页。 |
| G2 图谱阅读与布局 | P1；依赖 G1、S1/S2 | Wiki 局部关系阅读与概览切换、二维分量布局、页面标题/关系及方向；点击打开 Wiki，单独展开证据，统一计数与空态说明。 | 父需求 G3 通过；稀疏页面和长标题在双主题、窄窗口中可读，主图与追溯对象数量不混淆。 |
| S5 跨入口验收与构建交付 | P1；依赖 W1、G1/G2 及 S1～S4 | 集成回归、双主题/窄窗口/键盘验证、隔离 Electron 联调及新构建验证；核验 Wiki 正文、检索与主图版本一致。 | 本任务所引用 AC 有具体证据；明确可运行构建及其版本，实际切换前保护活跃会话，不自动中断终端。 |

阶段安排以逐环节细化结果和依赖推进，不编造工期。默认顺序为 S1 → W1 → G1 → S2 → S3 → S4 → G2 → S5；可提前单独修复锚点，但不能据此宣称 Wiki 主图已经实现。G1/G2 为阶段名，父需求 G1～G5 为测试用例编号，两者通过表中的退出条件对应。

### 后续逐项细化入口

S1/W1/G1/S2 的行为、契约和验证已记录；其余事项在对应环节落实时补入父需求的行为与验收、以及本任务的范围和证据，保留现有 UUID 与 AC 编号。

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

**G1/G2**：[KnowledgeGraphCanvas.tsx](../../src/renderer/src/components/knowledge/KnowledgeGraphCanvas.tsx) 为自定义节点提供不可编辑的 source/target Handle，[knowledgeGraph.ts](../../src/renderer/src/components/knowledge/knowledgeGraph.ts) 默认只投影已发布 Wiki 及宿主核验过的关系。主图和单页来源追溯分开；追溯先建立事实、文件/概念节点再解析替代和旧存储边，身份包含工作区。原始证据使用既有 observationRevocationContext 按工作区与 ID 读取，每批并发最多 4 项，刷新、离开或折叠时丢弃迟到结果。G1 已对齐 Wiki 页数、当前可见边及页面详情；二维布局、长标题和局部阅读设计仍由 G2 完成。

**S1**：[automation-service.ts](../../src/main/knowledge/automation-service.ts) 从当前 plans 投影任务、工作区和候选 hash，返回 `reviewStateVersion: 1` 及独立的工程审核开关。只有当前失败或待人工处理的任务可以重试；宿主复核任务、依赖和模型配置，拒绝过期任务。[共享状态源](../../src/renderer/src/services/knowledge-automation.ts)供侧栏、工作台与角标订阅，[候选状态判定](../../src/renderer/src/components/knowledge/candidateReviewState.ts)匹配当前快照，操作前再次读取宿主状态。未知或正在自动处理时不授权人工审核，个人候选保持人工确认，旧评分折叠为历史。新 automation 配置存在时，[candidate-actions.ts](../../src/main/knowledge/candidate-actions.ts)拒绝 score/refine，即使 automation 暂停也不进入旧队列；完全没有 automation 配置的旧宿主路径保持兼容。共享类型只扩展状态返回值，IPC 方法、preload 与 fallback 方法集合未变，合同回归通过。

S1 的确定性提取不生成共同文件关系；模型旧输出中的 graphEdges 不写入候选，派生候选入口也拒绝独立 graph-edge。旧存储可读、可通过既有维护 API 拒绝，界面显示只读记录；不自动接受或转为 Wiki 关系。2026-10-06 用户明确授权清理当前错误积累（含图谱审核），该批次按预览及快照核验处置，详见 Results；这项授权不构成产品自动删除历史的规则。W1 负责新语义关系的 Wiki 草稿及审核，S2 负责关系端点与依据的阅读布局。

**S2**：[MemoryReviewTool.tsx](../../src/renderer/src/components/knowledge/MemoryReviewTool.tsx) 与工作台 Inspector 复用审核内容、当前状态及动作。阅读区、来源、替代影响与底部操作分别组织；[CandidateEvidence.tsx](../../src/renderer/src/components/knowledge/CandidateEvidence.tsx) 按候选快照和来源工作区读取完整证据，失败、读取中或已撤回时阻止批准。[FactReviewControls.tsx](../../src/renderer/src/components/knowledge/FactReviewControls.tsx) 保留候选/目标 hash，来源变化、重新读取、忙碌或候选失效清除旧确认。Wiki 使用共享安全 Markdown，展开比较时读取同工作区的已发布版本及关系；来源 Note 缺失、hash 不匹配或非 fresh 状态不能通过界面批准。宿主仍在写入前校验版本及来源。旧评分折叠为历史，列表按条目、Wiki 草稿、已发布页面等分型，检索相关性与提取置信度分别命名。审计和旧图记录只读。

**S3**：调整 [AutomationStatus.tsx](../../src/renderer/src/components/knowledge/AutomationStatus.tsx)、[AssistantTool.tsx](../../src/renderer/src/components/knowledge/AssistantTool.tsx)、工作台及 S1 的共享订阅。首版采用全部工程范围并明确标识；个人功能单独开启时不读取或展示关闭的工程域。摘要复用宿主已加载对象生成可读标题，展示失败不回退为“空闲”。single-flight、最后一个订阅者离开停轮询、页面恢复刷新，按父需求给定的运行/空闲节奏测试；同一当前任务不在新旧队列摘要中重复计数。缺少真实开始时间时不显示虚构耗时。

**S4**：调整 [audit-service.ts](../../src/main/knowledge/audit-service.ts)、[knowledge-handlers.ts](../../src/main/ipc/knowledge-handlers.ts)、[shared/ipc/knowledge.ts](../../src/shared/ipc/knowledge.ts)、[services/knowledge.ts](../../src/renderer/src/services/knowledge.ts) 及工作台。先清点 listAudit/auditStats 的调用者，再确定兼容扩展或新增分页接口；不要无差别替换所有数组调用者。排序以事件真实时间和 ID 稳定续页，游标绑定领域、工作区与筛选。前端保留选中的完整 AuditEvent，详情读事件自身的 before/after；当前对象仅用于关联导航。批次、count-only、已撤回和未知动作有明确显示，历史审计不清空。

**S5**：用同一组合夹具贯通 W1、G1/G2 及 S1～S4；在已存在的 [knowledge-pipeline.spec.ts](../../tests/e2e/knowledge-pipeline.spec.ts) 基础上运行隔离 Electron，核验真实 preload/IPC 与宿主动作，以及从条目入库到 Wiki/图谱同版本更新的闭环。构建写入 artifacts/build-check，不覆盖正在运行的开发输出；记录便携版交付是否仍待完成。若需要实际切换运行版本，先检查并保存会话状态；不能把“重启旧便携版”描述为装入新代码。

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

S1 继续复用旧评分和仅按候选 ID 分类最省改动，但旧任务不能证明新版本的审核状态；采用当前计划与候选 hash 绑定，并共享读取。代价是旧宿主没有版本字段时界面只能显示未知状态，以及可见订阅期间仍每 5 秒读取计划。当前只解决正确性，2/10 秒刷新和紧凑摘要留给 S3。完全删除旧评分、关系格式与 API 可缩小兼容面，却会损失审计和存量处置入口；保留历史读取与维护能力，新提议统一关闭。W1 提供同版本 Wiki 关系后，再评估旧图格式的迁移范围。

S2 复用两入口的审核组件和现有 Markdown/只读来源接口，避免两套详情分别维护状态及写保护。维持原通用详情最省改动，但会继续混用历史评分、对象动作及原始 Markdown；重建独立审核服务会扩大 IPC 与事务边界，本阶段不采用。完整来源和已发布页面比较按需读取，代价是展开后才得到该次读取的可用性；已知失败保持阻止批准，最终写保护仍由宿主执行。来源缓存随候选快照失效，不新增持久副本。

## Acceptance criteria

以下为父需求的引用，不另造或重编号行为条款。S1 完成 AC-11/12，W1 完成 AC-18，G1 完成 AC-15/16；S2 完成 AC-10/13/14 的内容分层、分数语义、有效动作和阅读布局。其他部分交付不等于整条验收完成。

- [ ] [状态摘要 AC-4](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-4)、[共享订阅 AC-5](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-5)。
- [ ] [审计详情 AC-6](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-6)、[审计分页 AC-7](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-7)、[布局 AC-8](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-8)。
- [x] [当前审核信息 AC-10](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-10)。
- [x] [旧操作收口 AC-11](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-11)、[两入口一致性 AC-12](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-12)。
- [x] [对象与动作 AC-13](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-13)、[审核阅读与操作布局 AC-14](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-14)。
- [x] [Wiki 主图与追溯 AC-15](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-15)、[图谱连线与数据 AC-16](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-16)。
- [ ] [图谱阅读与计数 AC-17](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-17)。
- [x] [关系去重与端点保护 AC-18](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-18)。
- [ ] [沉淀与持续更新 AC-19](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-19)。

## Verification

图谱扩展既有 [knowledge-graph.test.ts](../../tests/unit/knowledge/knowledge-graph.test.ts)，并增加真实画布浏览器回归，覆盖父需求 G1～G5；断言 SVG 路径生成和可见线段，同时监听 React Flow error 008。水平路径可能具有零高度包围盒，不能只依赖 Playwright 的元素 visible 判定，应结合路径、样式与截图。W1 扩展 automation-service 与 Wiki 审核/历史/恢复相关测试，覆盖正文和关系同版本发布、失败草稿隔离、拒绝后重放及目标页面失效。写入使用隔离存储，不操作在线库。

阶段验证优先扩展现有用例：S1 使用 candidate-actions、automation-service、memory-domain-controls 与 knowledge-ipc-contract；S2 使用 memory-review-tool、memory-review-ui、workbench-selection 与 knowledge-note-ui，补工作台右侧真实组件的状态矩阵，不能只验证侧栏；S3 使用 knowledge-automation-ui，补共享订阅计时和迟到响应；S4 使用 audit-service、workbench-service 和浏览器审计夹具。父需求 R/P/A 用例规定输入和断言。新增独立测试文件仅用于现有入口无法覆盖的行为，不为样式细节逐条造实现镜像测试。

公共检查入口如下；S1/W1/G1/S2 的已运行结果见 Results，后续阶段仍须按变更补齐对应检查：

```text
npm run test:unit -- --run tests/unit/knowledge tests/unit/memory-review-ui.test.ts tests/unit/knowledge-review-state-ui.test.ts tests/unit/knowledge-note-sources.test.ts tests/unit/knowledge-automation-ui.test.ts tests/unit/knowledge-ipc-contract.test.ts tests/unit/knowledge-note-ui.test.ts tests/unit/knowledge-graph-ui.test.ts tests/unit/planche-theme.test.ts --maxWorkers=2 --reporter=dot
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

任务仍为 proposed：S3/S4、G2、S5 未完成。图谱阅读与布局、完整审计阅读界面、2/10 秒状态摘要、真实模型质量、隔离 Electron 全流程及发布包切换仍待对应阶段。当前旧便携进程未装入新代码，源码能力需更新后的运行构建；原工程开关已恢复关闭，存量清理不等于运行版升级。

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

S2 的 `npm run typecheck:strict-unused`、7 个变更生产 TS/TSX 文件 ESLint、`npm run i18n:types`、`npm run i18n:check`、`npm run check:package-boundary` 和 `npm run build:check` 均通过。隔离构建输出为 `artifacts/build-check`，未切换或重启当前便携版，也未再次修改在线知识存储。`npm run check:notes` 检查 247 篇 Note，0 errors、27 项既有外部链接诊断；`git diff --check` 通过。本任务保持 proposed，后续顺序为 S3 → S4 → G2 → S5。
