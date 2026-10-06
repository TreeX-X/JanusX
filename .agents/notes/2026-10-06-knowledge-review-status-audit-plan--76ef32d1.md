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
    criteria: [AC-4, AC-5, AC-6, AC-7, AC-8, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18]
  - type: governed-by
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/908d675a-aec9-4791-8c8b-05f1e4c923ca
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [src/main/knowledge/, src/main/ipc/knowledge-handlers.ts, src/main/ipc/register.ts, src/shared/knowledge.ts, src/shared/knowledge-automation.ts, src/shared/ipc/knowledge.ts, src/shared/review-candidate-snapshot.ts, src/preload/index.ts, src/renderer/src/components/knowledge/, src/renderer/src/services/knowledge.ts, src/renderer/src/stores/, src/renderer/src/lib/electron-api-fallback.ts, src/renderer/src/i18n/, tests/unit/, tests/e2e/knowledge-pipeline.spec.ts, .agents/notes/]
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
      args: [run, 'test:unit', --, --run, tests/unit/knowledge, tests/unit/memory-review-ui.test.ts, tests/unit/knowledge-automation-ui.test.ts, tests/unit/knowledge-ipc-contract.test.ts, tests/unit/knowledge-note-ui.test.ts, --maxWorkers=2, --reporter=dot]
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

本任务承接[噪声与界面需求](./2026-10-06-memory-noise-progress-audit--81b578b4.md)中尚未实现的审核详情、图谱、自动化状态和审计体验。需求保留触发条件、源码与合成诊断证据，并定义目标行为；本任务只维护交付顺序、边界和验证。审核规划基线为 `abea07a`，图谱补充分析基线为 `fee6423`。2026-10-06 当前只有分析、隔离诊断和计划，未开始生产界面或后端实施，也未启动新的自动审核或更改用户设置。

已完成基线包括 `bd5d48e` 的个人噪声过滤与 `abea07a` 的工程准入和存量清理，对应父需求 AC-1～3、AC-9。Jev 凭据保存反馈、四环节模型配置、领域开关及 Wiki 历史已有实现，不重复列为开发任务；保留回归。当前便携版未装入新修复属于交付缺口，不能把源码提交或旧窗口刷新当成运行态升级。

### 顺序、优先级与交付边界

后续实施沿用 xdo，由主代理直接串行执行。阶段之间复用同一任务与需求，不另建计划目录。每个阶段完成代码、相关回归和 Note 同步后原子提交；提交写明 Note 路径，核心入口保留反向引用。S5 通过前不把整个任务标为完成。

| 阶段 | 优先级与前置 | 负责的交付范围 | 退出条件 |
| --- | --- | --- | --- |
| G1 图谱连线与数据正确性 | P0；独立于审核改造，优先修复 | 补齐 React Flow 端点；统一建点后连边，修复实体、替代与 Wiki 来源映射、旧证据按需读取和工作区隔离。 | 父需求 G2 通过；真实浏览器有路径且无锚点报错，输入顺序不改变有效关系。 |
| S1 当前审核状态与旧操作收口 | P0；已有噪声防线为基线 | 对齐自动任务、当前候选版本、可用动作及原因；新流程拒绝旧 score/refine，保留历史注解读取。结构关系退出新增人工提议，语义关系保留确认，补去重与端点校验；为两个界面提供同一状态来源。 | 合成旧窗口请求不产生旧精炼任务；旧结果不能覆盖新候选；领域、失败边界及父需求 G1/G4 测试通过。 |
| S2 审核卡片与详情重整 | P0；依赖 S1 | 工作台、审核侧栏共用状态与动作规则；按事实/Wiki/图关系/只读记录组织详情，整理正文、证据、替代影响和操作区。 | R1～R5 对应组件和浏览器验证通过，同候选两入口状态与操作一致。 |
| S3 自动化紧凑摘要 | P1；依赖 S1，并在 S2 接入稳定后实施 | 复用共享订阅，在右侧助手导航下与工程工作台呈现范围明确的阶段、对象、等待及异常摘要；保留处理记录入口。 | P1～P4 验证通过，订阅、轮询、隐藏/恢复和未知状态没有重复请求或假运行提示。 |
| S4 审计分页与专用详情 | P1；依赖 S2 的对象分型 | 宿主按领域/工作区过滤后分页，列表与计数同范围；保留完整事件快照，实现审计选择、前后变化、关联对象与加载更多。 | A1～A4 通过；审计没有审核按钮，旧事件缺字段不伪造；个人事件不挤占工程分页。 |
| G2 图谱阅读与布局 | P1；依赖 G1、S1/S2 | 局部关系阅读与概览切换、二维分量布局、可读标题/关系及方向；分离查看、聚焦和展开，统一计数与空态说明。 | 父需求 G3 通过；稀疏图和长标题在双主题、窄窗口中可读，图谱与审核的对象数量不混淆。 |
| S5 跨入口验收与构建交付 | P1；依赖 G1/G2 及 S1～S4 | 集成回归、双主题/窄窗口/键盘验证、隔离 Electron 联调及新构建验证；同步剩余风险。 | 本任务所引用 AC 有具体证据；明确可运行构建及其版本，实际切换前保护活跃会话，不自动中断终端。 |

阶段安排以依赖与验收结果推进，不编造工期。先实施独立且可复现的 G1，再按 S1～S4、G2、S5 推进；审核规则和关系含义先于对应视觉改造。G1/G2 为阶段名，父需求 G1～G4 为测试用例编号，两者通过表中的退出条件对应。

### 修改位置与实施要点

**G1/G2**：复用 [KnowledgeGraphCanvas.tsx](../../src/renderer/src/components/knowledge/KnowledgeGraphCanvas.tsx)、[knowledgeGraph.ts](../../src/renderer/src/components/knowledge/knowledgeGraph.ts) 及工作台样式。G1 先固定两节点一条边的浏览器回归，再处理端点解析顺序、Wiki 来源和按需证据读取；图关系的来源语义以父需求为准，不能为补线猜测关系。G2 调整布局、文本、方向及选择行为，清理无数据依据的 proposal 筛选和待审计数；适配器测试通过不能代替画布测试。

**S1**：读取 [automation-service.ts](../../src/main/knowledge/automation-service.ts) 的 status/plans 与 [knowledge-automation.ts](../../src/shared/knowledge-automation.ts)，复用任务账本匹配当前候选及输入版本。当前、历史、无法读取分别投影；新记录按实际存储显示原因，缺失字段不能补造。共享只读订阅沿用 renderer services/store 约定，避免两个入口分别扫描所有来源。修改 [candidate-actions.ts](../../src/main/knowledge/candidate-actions.ts) 及相关 IPC 门禁，使新 automation 配置下旧动作明确失败且不入旧队列；清点旧精炼积压，只报告状态，不顺便删除用户历史。类型如有扩展，同步 shared IPC、preload、fallback 和合同测试。

S1 同时检查确定性与模型两个图关系提议入口；共同文件关联改为可重建投影，不能只在 UI 藏起继续增长的候选。复用 review-service 的锁、快照与审计，补关系稳定身份和有效端点检查。旧候选保留来源及拒绝记录，以明确分类兼容展示；不静默自动接受或批量清理。S2 对语义关系显示两端可读标题和证据，并将历史结构建议与可执行审核动作区分。

**S2**：调整 [MemoryReviewTool.tsx](../../src/renderer/src/components/knowledge/MemoryReviewTool.tsx)、[KnowledgeWorkbench.tsx](../../src/renderer/src/components/knowledge/KnowledgeWorkbench.tsx)、[FactReviewControls.tsx](../../src/renderer/src/components/knowledge/FactReviewControls.tsx)、[inboxScope.ts](../../src/renderer/src/components/knowledge/inboxScope.ts) 与对应样式。先落实父需求的对象/状态动作表，再处理详情层次；自动态与人工态的来源不能只依赖卡片 status=proposed。保留 reviewCandidateInput、替代目标确认及域门禁，当前来源/候选失效时清除旧确认。Wiki 复用现有安全 Markdown 与来源能力，旧评分只放历史诊断。更新中英文文案及现有测试中的旧 Laya 期望，不以删测试代替兼容性验证。

**S3**：调整 [AutomationStatus.tsx](../../src/renderer/src/components/knowledge/AutomationStatus.tsx)、[AssistantTool.tsx](../../src/renderer/src/components/knowledge/AssistantTool.tsx)、工作台及 S1 的共享订阅。首版采用全部工程范围并明确标识；个人功能单独开启时不读取或展示关闭的工程域。摘要复用宿主已加载对象生成可读标题，展示失败不回退为“空闲”。single-flight、最后一个订阅者离开停轮询、页面恢复刷新，按父需求给定的运行/空闲节奏测试；同一当前任务不在新旧队列摘要中重复计数。缺少真实开始时间时不显示虚构耗时。

**S4**：调整 [audit-service.ts](../../src/main/knowledge/audit-service.ts)、[knowledge-handlers.ts](../../src/main/ipc/knowledge-handlers.ts)、[shared/ipc/knowledge.ts](../../src/shared/ipc/knowledge.ts)、[services/knowledge.ts](../../src/renderer/src/services/knowledge.ts) 及工作台。先清点 listAudit/auditStats 的调用者，再确定兼容扩展或新增分页接口；不要无差别替换所有数组调用者。排序以事件真实时间和 ID 稳定续页，游标绑定领域、工作区与筛选。前端保留选中的完整 AuditEvent，详情读事件自身的 before/after；当前对象仅用于关联导航。批次、count-only、已撤回和未知动作有明确显示，历史审计不清空。

**S5**：用同一组合夹具贯通 G1/G2 及 S1～S4；在已存在的 [knowledge-pipeline.spec.ts](../../tests/e2e/knowledge-pipeline.spec.ts) 基础上运行隔离 Electron，核验真实 preload/IPC 与宿主动作。构建写入 artifacts/build-check，不覆盖正在运行的开发输出；记录便携版交付是否仍待完成。若需要实际切换运行版本，先检查并保存会话状态；不能把“重启旧便携版”描述为装入新代码。

### 另列的未完成验证与优化

以下项不混入 G1/G2 及 S1～S5 的界面验收，也不因历史 Note 曾勾选软件实现而视为完成。它们已有各自的事实来源，后续按触发条件确定独立任务；本轮不复制旧 AC 或重开已经完成的功能。

| 后续项 | 当前证据与未完成部分 | 进入实施的条件 |
| --- | --- | --- |
| P2 自动审核质量及覆盖率 | [统一内核 AC-8/20/21](./2026-09-28-unified-memory-laya-primary--736081fc.md)仍未完成；已有合成样本测试出现错误放行。旧 Laya 指标只作历史参考，质量目标应覆盖当前选用提供方。 | 固定独立样本、来源隔离和模型/模板版本，确定错误接受率、覆盖率与不确定候选的门槛；不能用零次接受或同模型复核代替。 |
| P2 外部与混合提供方实机闭环 | 同一内核 AC-23/24 的路由已有替身测试，纯外部和混合提供方真实服务验收仍缺。 | 明确测试提供方、可用凭据、费用与允许发送的合成/脱敏资料，分别验证成功、断网、限流和不可用时不擅自切换。 |
| P2 首次完整公网安装 | [分域控制验证](./2026-10-04-memory-domain-controls--908d675a.md)记录运行程序下载成功、权重完整公网下载失败；本地权重复用通过不等于首次下载通过。 | 隔离缓存完整下载并核对长度/哈希，验证取消和失败恢复；不改用户已启用状态。 |
| P2 硬件容量与长期 Wiki 质量 | 上述分域验证已覆盖本机 32K/64K 和八主题合成手册；128K/256K、其他 GPU、独立长资料及长期维护没有完成验收。内核 AC-22 保持开放。 | 固定硬件、资料版本与目标容量，复核数值/例外、修改后失效和撤回链路；每种硬件单独报告，不外推。 |
| P3 增量个人证据合并 | 父需求已解决相同历史重放；新增来源改变候选身份时的跨候选合并仍未实现。 | 收集重复提议的独立事件样例，设计保留来源与拒绝意图的合并规则；不得放宽已交付的偏好准入。 |

## Alternatives considered

把所有改动直接追加到需求正文最省文件，但会把问题、验收和执行状态混在一起；保留需求作为行为依据，以本任务维护唯一实施计划。一次重写整个知识工作台能统一样式，却扩大到已有可用的模型设置、个人画像和 Wiki 历史；本任务按 G1/G2 及 S1～S5 复用现有模块。仅清理文案不能解决旧动作仍入队和两个入口状态分歧，因此先处理状态与操作契约。

## Acceptance criteria

以下为父需求的引用，不另造或重编号行为条款；全部保持待验收。

- [ ] [状态摘要 AC-4](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-4)、[共享订阅 AC-5](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-5)。
- [ ] [审计详情 AC-6](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-6)、[审计分页 AC-7](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-7)、[布局 AC-8](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-8)。
- [ ] [当前审核信息 AC-10](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-10)、[旧操作收口 AC-11](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-11)。
- [ ] [两入口一致性 AC-12](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-12)、[对象与动作 AC-13](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-13)、[审核阅读与操作布局 AC-14](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-14)。
- [ ] [结构与语义关系 AC-15](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-15)、[图谱连线与数据 AC-16](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-16)。
- [ ] [图谱阅读与计数 AC-17](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-17)、[关系去重与端点保护 AC-18](note://972afef3-2fc7-49de-a3ee-7e041225d28c/81b578b4-5346-486c-9b93-e626e4bb636b#AC-18)。

## Verification

图谱扩展既有 [knowledge-graph.test.ts](../../tests/unit/knowledge/knowledge-graph.test.ts)，并增加真实画布浏览器回归，覆盖父需求 G1～G4；断言 SVG 路径生成和可见线段，同时监听 React Flow error 008。水平路径可能具有零高度包围盒，不能只依赖 Playwright 的元素 visible 判定，应结合路径、样式与截图。关系提议/拒绝重放和端点失效使用隔离存储测试，不操作在线库。

阶段验证优先扩展现有用例：S1 使用 candidate-actions、automation-service、memory-domain-controls 与 knowledge-ipc-contract；S2 使用 memory-review-tool、memory-review-ui、workbench-selection 与 knowledge-note-ui，补工作台右侧真实组件的状态矩阵，不能只验证侧栏；S3 使用 knowledge-automation-ui，补共享订阅计时和迟到响应；S4 使用 audit-service、workbench-service 和浏览器审计夹具。父需求 R/P/A 用例规定输入和断言。新增独立测试文件仅用于现有入口无法覆盖的行为，不为样式细节逐条造实现镜像测试。

集成检查命令如下，均在实施后运行，当前不能标为已通过：

```text
npm run test:unit -- --run tests/unit/knowledge tests/unit/memory-review-ui.test.ts tests/unit/knowledge-automation-ui.test.ts tests/unit/knowledge-ipc-contract.test.ts tests/unit/knowledge-note-ui.test.ts --maxWorkers=2 --reporter=dot
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

2026-10-06：完成问题记录、未完成项整理和实施计划，补充图谱的审核分类、连线故障及阅读布局。图谱合成浏览器和纯适配器诊断结果见父需求 Verification；它们验证缺陷，没有交付生产修复。本任务保持 proposed，实施尚未开始，未生成 execution/receipt。本次 `npm run check:notes` 为 247 篇、0 errors、27 项既有外部链接诊断；两个更新文件的 32 处 Note URI、14 处正文 AC 引用与 14 项 acceptanceRefs 均解析到现存目标。完整源码回归、界面验收、新构建与运行版本切换仍未执行。
