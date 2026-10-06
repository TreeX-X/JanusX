---
schema: harness-note/1
id: 81b578b4-5346-486c-9b93-e626e4bb636b
kind: requirement
lifecycle: proposed
created: 2026-10-06
class: bug-fix
tags: [memory, persona, automation, audit, ui]
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c1c04881-a2fb-430f-bc26-528027d0e5cf
---

# 个人记忆噪声过滤、自动化进度与审计详情

## Problem

### 接手入口与当前边界

本 Note 覆盖个人噪声、自动化状态和审计详情三项问题。个人噪声的采集过滤、偏好准入、历史重扫与提议审计修复已有实现，具体范围见“个人噪声修复”。真实存储中的待审候选仅做只读预览；历史处置 AC-3、自动化状态和审计详情 AC-4～8 保持未完成。整篇仍为 proposed，不把局部交付视为三项需求全部交付。此前的 Jev 密钥保存反馈已独立实现，不属于本 Note 的待办。

阅读时请先执行 `git status --short`，保留其他工作中的变更。源码引用以文件和函数名为定位依据，行号可能变化。核对当前实现是否已由其他提交修复，再决定剩余工作；本机数据统计和下方 ID 是 2026-10-06 的定位证据，不是要硬编码进产品的规则。

用户报告个人画像出现后台任务完成通知，自动化开启后无法判断是否正在运行，工程审计列表文字零散且卡片详情缺少有效内容。三项问题分别涉及证据归因、运行状态可见性和审计数据展示，不能只通过调整样式解决。

2026-10-06 对本机知识存储进行只读检查：26 条原始 observation 中有 14 条包含 task-notification 标记，包含标记不等于全部是纯通知。用户提供的任务通知对应一条 project 域、agent-stream 来源、speaker=user 的记录，并出现在两条 scope=user、status=proposed 的 habit 候选中。正式 facts 为空，profile/snapshot 未匹配该通知。因此已确认的是个人习惯候选污染，不能声称该通知已经成为确认画像或来自个人近期记忆。检查未修改数据，也未读取通知所引用的任务输出文件。

初次排查的归因缺口位于 [终端 transcript 解析](../../src/main/sessions/knowledge-transcript.ts)、[Hook 采集](../../src/main/knowledge/agent-turn-recorder.ts)和 [isUserStatement](../../src/main/knowledge/memory-evidence.ts)：消息 role=user 与 UserPromptSubmit 只证明传输角色，无法单独证明内容来自用户。共用会话显示函数 [claudeUserText](../../src/main/sessions/external-session-scanner.ts)继续返回原文，知识适配层负责排除已知运行通知；身份和来源校验仍保留。

初次排查时，[习惯聚合](../../src/main/knowledge/habit-aggregator.ts)仅按 Jaccard 相似度至少 0.6、不同来源事件至少 3 次形成候选，缺少偏好语义准入。通知模板因此构成伪习惯；来源集合变化还会生成不同候选 ID。[确定性提取](../../src/main/knowledge/deterministic-extractor.ts)跨批次读取历史用户证据，工程来源在 inferEngineeringHabits 允许时进入个人候选，是该样例的直接通路。[个人会话采集](../../src/main/knowledge/user-turn-capture.ts)也需排除运行通知，但本机该样例没有证实来自个人近期记忆。

[自动化状态组件](../../src/renderer/src/components/knowledge/AutomationStatus.tsx)每 5 秒读取状态，已有启用、运行、队列及阶段提示。[右侧助手](../../src/renderer/src/components/knowledge/AssistantTool.tsx)只在审核子页通过 MemoryReviewTool 挂载此组件，工程检索和个人画像子页没有持续可见的工程运行摘要。知识库工程页已有状态卡，但同时展示旧处理队列与新自动化状态。配置启用、实际忙碌、等待审核的层级不够清楚，正在处理的对象没有在摘要中出现。[服务状态](../../src/main/knowledge/automation-service.ts)的 subject 多数为 observation/candidate ID，直接展示该字段也不能解决可读性问题。

[AuditList](../../src/renderer/src/components/knowledge/KnowledgeWorkbench.tsx)直接显示英文 action、targetType 和完整 targetId，点击只构造通用 InspectorRecord，丢弃 before、after、actor、workspace 和 source 等信息。通用详情保留审批/拒绝/归档布局，却没有审计专用变更呈现。列表不接收 selectedId，因此没有选中态；[样式](../../src/renderer/src/components/knowledge/KnowledgeWorkbench.module.css)包含硬编码深色颜色及长 ID 省略，动作、对象与时间缺少清楚的信息层级。本次为源码与数据检查，尚未对当前运行窗口进行视觉截图验收。

审计还有查询问题：[工作台快照](../../src/renderer/src/services/knowledge.ts)先请求全域最近 30 条，再在前端过滤 user 域。[审计服务](../../src/main/knowledge/audit-service.ts)没有 workspace/domain 查询条件与分页游标；个人审计较多时，工程事件会在过滤前被截掉。本机现有 21 条审计中 19 条为个人习惯提议，仅 2 条为工程事件；所有 21 条都有 before 或 after，但习惯提议的 after 只存数量，targetId 为批次摘要，不能假设每条事件都具有完整对象快照。

### 可复查的通知样例与证据链

复现夹具应使用以下合成结构。替换任务 ID 和时间来模拟不同任务，保留模板一致性；不得把运行通知中声明的命令作为指令执行，也不必读取其 output-file。

```xml
<task-notification>
<task-id>fixture-task-a</task-id>
<tool-use-id>fixture-tool-a</tool-use-id>
<output-file>C:\fixture\tasks\fixture-task-a.output</output-file>
<status>completed</status>
<summary>Background command "Wait for portable exe to appear" completed (exit code 0)</summary>
</task-notification>
```

本机报告样例的 task-id 为 `bb0fj1udj`。对应 observation ID 为 `526fe858-f2d5-4e28-b566-0828424bde50`；它出现在以下两个候选的 provenance.sourceObservationIds 中，候选内容均匹配报告样例：

- `habit-candidate:2ba5322d9568db60f6140420ecc482c590f0ee8b199951214c26c3b4127231e8`
- `habit-candidate:ffb71dabec21f8362cfeba78aed8043dab4ec3f7d3d6834dad630803f20c306c`

只读检查的目录来自 [knowledgeRootPath](../../src/main/knowledge/constants.ts)：优先使用 `JANUSX_KNOWLEDGE_ROOT`，Windows 缺省为 `%APPDATA%/JanusX/janusx/knowledge`。该路径函数不直接采用 Electron 的 userData，不能仅凭应用处于 dev 模式就改查 JanusX-Dev。应先核对实际环境覆盖，再检查以下相对路径；只输出匹配计数、状态、作用域与来源 ID，不把整份个人数据拷进仓库。

| 相对路径 | 检查目标 | 已有证据的含义 |
| --- | --- | --- |
| `observations/active/2026-10.jsonl` | content、preview、来源元数据中是否匹配标记；必要时按现有 resolveContent 读取 blob | 证明采集层把样例标记为 project/user 证据；仅含标记不证明整条都是通知 |
| `facts/candidates.jsonl` | 上述两个 ID、scope、status、fact.content 和来源引用 | 证明个人待审候选污染；复查时兼容候选对象和嵌套 fact 的字段布局 |
| `facts/facts.jsonl` | 是否已存在匹配的正式事实 | 检查时为空；不能据此保证未来仍为空 |
| `profile/snapshot.json` | 派生画像是否包含该通知 | 检查时无匹配；不得报告为正式画像已污染 |
| `audit/audit.jsonl` | action、provenance.workspaceId、before/after | 检查时 19 条 habit_candidate_proposed、2 条 candidate_proposed；审计次数不等于独立候选数 |

代码链路应按以下顺序核对：`claudeUserText → readKnowledgeTurn/parse → AgentTurnRecorder` 形成证据，另一入口是 recorder 的 UserPromptSubmit Hook；`isUserStatement → runDeterministicStage → deriveHabitPromotions → proposeHabitCandidates → habitPromotionToCandidate → proposeFactCandidates` 形成个人候选。Hook 与 transcript 都存在身份分类缺口，但本次没有读取源会话来断言报告 observation 具体经过哪一个入口。`register.ts` 的 allowHabitSource 用 `inferEngineeringHabits` 控制工程来源；`getUserMemoryOverview` 的 pendingHabitCount 来自个人待审候选，habits 来自正式 facts，recent 来自 episode，三个口径必须分开。

19 次历史习惯提议审计发生于候选持久化之前，不能解释为 19 条新画像内容。当前 `deriveHabitPromotions` 只推导候选，`runDeterministicStage` 在 `proposeFactCandidates` 返回实际新增项后记录数量和候选 ID；相同来源重放不增加习惯提议审计。历史读取上限仍为 200 条。增量来源导致候选身份改变时的跨候选合并不属于此次噪声修复。

## Expected behavior

优先修复采集和习惯候选污染。应在知识采集适配层识别消息来源类型：真实用户发言、助手文本、工具结果和运行通知。引擎提供可信元数据时优先采用元数据；缺失时仅识别完整、已知的运行通知结构，不能把所有 XML、日志或含 task-notification 的消息删除。纯通知不得作为个人偏好证据、近期记忆或待审核个人条目；用户引用通知并提出真实问题时应保留问题和必要上下文，引用内容不能提升为用户偏好。原始执行通知可留在会话/诊断证据中。

习惯聚合应在频次统计前增加偏好或稳定行为的语义准入。频率只能加强合格证据，不能独立证明习惯；不确定内容不得自动晋升。纯通知应由确定性规则直接拒绝，不依赖模型过滤。终端、个人聊天和历史扫描应复用同一准入契约，并防止被排除的通知在下一轮历史聚合中重新出现。

已有污染应提供明确匹配条件和预览，通过既有撤回/拒绝机制处理待审候选，并复核计数和派生内容；同一批通知反复运行不得重新提议。已确认事实需要单独核对证据，不能按字符串批量删除。审计保留实际发生的操作及清理原因。本次只记录方案，不清理数据。

自动化展示应复用同一状态源，右侧助手导航下方常驻一行工程状态，知识库工程页顶部保留一至两行摘要。示例为“正在审核条目 · 备份策略 · 等待 3 条”，窄屏省略对象标题并可查看完整标题；运行时只有一个小型活动图标。空闲显示“自动化已开启，等待新内容”，关闭显示“自动化已关闭”，未配置说明缺少哪个环节，异常显示“2 条需处理”。点击摘要进入已有处理记录，不增加弹窗仪表盘。状态须区分当前工作区与全部工程范围，不能让个人画像页误以为工程任务在处理个人信息。

应从候选、observation 摘要或 Wiki 标题生成脱敏、截断的可读对象名，内部 ID 留在详情。当前阶段、对象、排队数和最后完成时间优先于百分比；动态队列没有固定总量，不应伪造百分比。运行时建议 2 秒刷新、空闲时 10 秒刷新，多个展示共享请求，隐藏页面暂停轮询。读取失败显示“状态暂不可用”，不能继续显示旧状态为实时事实。旧处理队列与新自动化分别标注采集/提取和审核/发布，摘要不得重复计数；仅启用规则提取时也须有明确状态。

审计应使用紧凑记录列表，主行展示本地化动作和可读对象名，次行展示工作区、执行者和时间，选中项有明确样式。点击展示审计专用详情：操作摘要、变更前后、来源及关联对象入口，技术 ID 和原始结构折叠。事件只有数量时显示数量及来源，并明确未记录完整快照；对象已撤回或不可访问时说明原因。批次事件显示为批次摘要，不伪装成可打开的单个事实。审计页不展示与只读历史无关的审批按钮。深浅主题使用已有语义颜色，长标题、长 ID 和窄屏不破坏布局。

查询应在宿主按领域/工作区过滤后排序、分页，再返回事件和对应计数，避免个人事件挤占工程列表。详情优先使用事件自身记录的变更，关联对象只用于当前状态导航，不能将当前内容误称为历史快照。默认展示最近记录，提供简洁的动作筛选和加载更多。

## Scope

实施顺序建议为：通知归因与习惯准入、已有候选处置方案、自动化紧凑状态条、审计查询与专用详情。复用现有采集队列、自动化任务账本、审计日志和主题样式；不引入新的存储体系或复杂监控面板。

相关边界由[记忆与知识模块](./2026-10-03-module-memory--c1c04881.md)、[Hook 证据采集](./2026-10-05-hook-evidence-extraction--a61e849c.md)和[自动化需求](./2026-10-03-knowledge-accumulate-review-wiki-rereview--3944b368.md)约束。已实现范围仅为个人噪声防线；自动化状态、审计查询/界面和真实历史清理仍待交付。

### 修改落点与实施顺序

下表是完整需求的修改落点；是否已实现以“个人噪声修复”与 AC 为准。表中的状态接口、界面组件和历史清理仍为建议，内部重构不应扩展为整个知识库重写。

| 步骤 | 文件与函数入口 | 需要调整的职责 | 完成条件 |
| --- | --- | --- | --- |
| 1. 来源归因 | [knowledge-transcript.ts](../../src/main/sessions/knowledge-transcript.ts) 的 parse/selectTurn；[agent-turn-recorder.ts](../../src/main/knowledge/agent-turn-recorder.ts) 的 Hook 和结束采集；[external-session-scanner.ts](../../src/main/sessions/external-session-scanner.ts) 的 claudeUserText | 在知识采集路径识别运行通知，避免标为用户陈述；若改共享 scanner，须检查历史聊天显示等其他调用者 | 通知不作为用户证据，也不会错误地切断真实用户回合或丢掉随后助手回答 |
| 2. 个人准入 | [memory-evidence.ts](../../src/main/knowledge/memory-evidence.ts)、[user-turn-capture.ts](../../src/main/knowledge/user-turn-capture.ts)、[habit-aggregator.ts](../../src/main/knowledge/habit-aggregator.ts)、[deterministic-extractor.ts](../../src/main/knowledge/deterministic-extractor.ts) | 真实身份校验与内容准入分开；初次输入、历史输入及个人 episode 使用一致的规则，频率只作用于合格偏好证据 | 新采集与历史重扫均通过 AC-1/2；不通过降低角色权限或全局关开关掩盖问题 |
| 3. 候选与审计去重 | [review-service.ts](../../src/main/knowledge/review-service.ts) 的 proposeFactCandidates；habit-aggregator 的 deriveHabitPromotions | 检查相同来源和增量来源是否会重复提议，审计区分真实新增、更新与无变化 | 重放不增长候选数或虚假的新增计数；不要把事件时间相近当成同一事件 |
| 4. 历史处置 | review-service 的 rejectCandidate 与现有来源撤回/个人遗忘边界 | 生成预览，按完整通知判定和来源绑定处置污染候选，复核派生状态 | 使用最新 candidateHash 和既有锁，不直接重写 JSONL；执行后重跑提取不复生 |
| 5. 状态投影 | [knowledge-automation.ts](../../src/shared/knowledge-automation.ts)、[automation-service.ts](../../src/main/knowledge/automation-service.ts) 的 status/plans | 给摘要提供可读对象、范围及真实时间信息；保留当前队列与历史账本的区别 | 页面无需多次逐条查正文，不把任务 ID 或未脱敏原文直接展示 |
| 6. 紧凑展示 | [AutomationStatus.tsx](../../src/renderer/src/components/knowledge/AutomationStatus.tsx)、[AssistantTool.tsx](../../src/renderer/src/components/knowledge/AssistantTool.tsx)、[MemoryReviewTool.tsx](../../src/renderer/src/components/knowledge/MemoryReviewTool.tsx)、[KnowledgeWorkbench.tsx](../../src/renderer/src/components/knowledge/KnowledgeWorkbench.tsx) | 抽取共享状态订阅及纯展示摘要，右侧只挂载一份摘要；保留既有记录入口 | 切子页不丢状态，不重复轮询，右侧与工作台相同范围显示一致 |
| 7. 审计查询 | [shared/ipc/knowledge.ts](../../src/shared/ipc/knowledge.ts) 的 AuditQuery/API；[audit-service.ts](../../src/main/knowledge/audit-service.ts) 的 list/stats；[knowledge-handlers.ts](../../src/main/ipc/knowledge-handlers.ts) | 宿主校验领域、工作区和游标，在截断前过滤；列表和计数共享过滤口径 | AC-7 的大量混合领域、相同时间及新事件插入场景通过 |
| 8. 审计详情 | [services/knowledge.ts](../../src/renderer/src/services/knowledge.ts) 的快照装配；KnowledgeWorkbench 的 AuditList/Inspector；对应 CSS 与中英文 knowledge.json | 使用完整 AuditEvent，提供专用列表与详情，接入查询页状态及加载更多 | AC-6/8 通过，事件选择刷新后保持或明确消失，切领域不残留旧详情 |

来源分类建议采用可单独测试的纯函数，输入包含引擎、消息角色、可信元数据和原文，输出至少能区分用户正文、引用片段与运行通知。输出不必持久化成新 schema，先复用当前证据类型的能力；若增加字段则应明确旧记录的默认解释，不能给旧记录补造“已验证用户发言”。纯通知可以跳过个人派生，同时仍留在原始 transcript；若保留为 knowledge observation，其类型和 authority 必须避免进入用户偏好和自动知识候选。

偏好准入采用保守的明确表达规则，覆盖“以后回答请简洁”“我习惯先跑测试”等可解释样例。引用、代码、XML 和疑问不作为自动个人证据；临时指令、明确项目限定及无法解释的混合正文不参与习惯累计，原始会话保留。个人事实与决策仍有各自提取路径，不要求个人事实都表达偏好。需要模型识别的含蓄行为仍待独立设计，不增加逐消息模型调用，也不把重复工程命令认作个人习惯。

### 自动化状态的显示契约

当前 `KnowledgeAutomationStatus.stages` 表示配置，不证明提供方可连接；`running` 表示一次调度在执行，不保证某个模型请求已开始；`queue` 是当前计划投影，`counts/total/tasks` 包含历史。队列里的 extraction subject 是 observation ID，entryReview 和 wikiReview 是候选 ID，wikiGeneration 是 slug。仅将现有 subject 拼到 UI 上会得到乱码式标识，应在宿主已取得的快照中映射出简短对象名。现有任务只有 createdAt/updatedAt，没有专用 startedAt，不能把 createdAt 当作实际运行起点。

建议状态优先级与文案如下。异常数量可作为运行态的次要提示，不能盖掉真实进行中的工作。

| 条件 | 主提示 | 补充与点击行为 |
| --- | --- | --- |
| 首次读取未返回 | 正在读取运行状态… | 不先显示关闭，避免闪烁误导 |
| 请求失败或已失去有效订阅 | 状态暂不可用 | 可重试；保留旧信息时明确为上次状态 |
| knowledge 或自动化未开启 | 工程自动化已关闭 | 不暗示个人记忆被关闭 |
| 存在 running 任务 | 正在审核条目 · 对象名称 | 小型活动图标；次行可显示等待数量，点击打开对应处理记录 |
| 调度 running 但没有可显示的任务 | 正在检查待处理内容 | 不虚构模型或对象 |
| 有待处理任务、调度尚未运行 | 等待处理 · N 条 | 不持续播放“模型运行”动画；重试延迟信息可在详情说明 |
| 无当前任务且配置可运行 | 已开启，等待新内容 | 可显示最近完成时间；不要显示永久的 100% |
| 所需环节未配置 | 条目审核尚未配置 | 部分自动化应明确仍可运行的环节；规则提取与全关闭要区分 |
| 无运行任务但有失败/待人工审核 | N 条需要处理 | 分开说明失败和人工审核，点击已有审核/记录入口 |

推荐首版采用“全部工程”范围，与当前全局自动化服务一致，在右侧也明确标识；不随当前终端切换而静默改变范围。若实施时改成当前工作区过滤，须给 queue 补 workspaceId 并同步过滤任务、计数与对象标题，不能只在前端更换标签。组件名可选 AutomationSummary，状态订阅可用现有 store 模式；关键是状态源只存在一份，而不是必须采用该命名。

轮询建议采用 single-flight：上一请求未完成时不发下一次，最后一个订阅者卸载或 document 隐藏时停止计时，恢复可见后立即刷新；卸载或过期响应不能覆盖新结果。运行 2 秒、空闲 10 秒是待实施的建议值，需核对 status 当前会调用 plans/snapshot 的成本。若轮询代价高，先减少重复投影或沿用较低频率，不为动画增加磁盘全量扫描。仅改展示不能解决调度未运行的问题；若复现时一直 pending，继续核查 [processing-queue.ts](../../src/main/knowledge/processing-queue.ts) 的 scheduleAutomation、configureAutomationHandler 和 startRefinementLoop（默认 60 秒），不要以模拟动画替代真实状态。

### 审计查询、详情和旧事件兼容

当前 `listAudit(query): Promise<AuditEvent[]>` 只接收 action、targetType、targetId、limit；`auditStats()` 无过滤参数。分页若改为带 items/nextCursor/total 的结果对象，应同步类型、preload、浏览器 fallback、工作台 services 和所有调用者；若采用新增分页接口，旧列表行为必须保留并有合同测试。两种方式都可行，实施前根据调用范围选最小变更，不能只改主进程返回值导致旧数组消费者报错。

推荐以 `(createdAt, id)` 建立稳定的倒序排序及不透明游标。过滤后统计，在同一读取快照内生成 items 与计数；游标查询应绑定领域/工作区/动作过滤条件，筛选改变时清空游标和选中项。分页期间追加新事件时，继续页不应重复旧页；刷新首屏后重新开始浏览最新记录。领域不是 AuditEvent 的顶层字段，现有个人事件用 provenance.workspaceId=user 区分；未知或缺失来源不能被默认为可跨域展示，处理规则应显式验证。

列表只显示动作、本地化对象类型、脱敏标题、时间及必要的工作区/执行者。详情必须保留原始 event.id，不能把 targetId 当成唯一选中键；同一对象可以有多个审计事件。动作未知时使用中性兜底文案并在技术详情显示原值，不出现空白翻译键。长内容按普通文本呈现，不执行 HTML/XML；控制默认预览长度，完整数据按需展开。

| 事件形态 | 列表与详情处理 |
| --- | --- |
| before 与 after 均有值 | 按变更字段呈现前后值；不变字段折叠，数组和嵌套结构可展开 |
| before=null、after 有值 | 显示创建/提议结果，before 显示“此前无记录” |
| after 只有 count | 显示“提议 N 条习惯候选”及来源；不得渲染成具体偏好正文 |
| 缺少 before/after | 保留动作、对象标识、来源和时间，并说明“此事件未记录内容快照” |
| 关联对象存在 | 提供“查看当前对象”，区分当前对象与当时变更 |
| 关联对象已删除/撤回/无权限 | 仍展示事件自身记录；入口置为明确不可用状态，不显示空面板 |

对象导航应使用明确的 targetType、workspace 和已有查询方法。像 `habits:2` 或以 workspaceId 作为 targetId 的汇总事件不得尝试作为 fact ID 查询。现有通用 Inspector 的审批按钮不能复用到只读审计详情。选择可通过专用 selectedAuditId 实现，或扩展明确的记录联合类型，避免继续把完整事件压缩成只有 title/body 的 InspectorRecord。

### 历史污染处置步骤与停止条件

1. 先在测试数据中验证分类和重放防线，再对真实存储进行只读扫描。预览分为纯通知、混合引用、无法判断三类，列出候选 ID、当前 hash、来源、是否已确认以及预计影响；不要按标记匹配结果直接删除。
2. 对全部来源均为纯通知的待审候选，建议通过 `knowledgeReviewService.rejectCandidate` 路径拒绝，并写入可理解的原因。读取最新 candidateHash，复用现有锁和领域门禁；hash 变化应返回需重新预览，而不是覆盖并发审核。
3. 对混合来源候选或已确认事实停止自动清理并逐条核对。若必须撤回来源，先评估其工程知识/Wiki 引用，不因清理个人噪声撤回合法工程证据。个人近期记忆若存在同类污染，使用已有遗忘/过期机制，不另造绕过屏障的删除脚本。
4. 清理后刷新个人 pendingHabitCount、正式画像投影及必要的召回状态，再执行两次同样历史输入的提取，确认无候选复生。保留真实操作审计；不要删除旧审计来“清空噪声”。失败或中断后可重新预览并幂等继续。

本机两个 ID 只用于定位报告样例，不能作为批量清理的白名单；未来数据可能已被用户审批或修改。不要重置整个知识库、重写所有游标、关闭用户偏好设置或删掉整个 observation 分片。

## Alternatives considered

只在 UI 隐藏通知最省改动，但候选计数、习惯提议与未来召回仍会污染，不能采用。完全关闭工程习惯推断能快速降低噪声，却损失用户主动开启的跨项目偏好积累，只适合作为临时手动措施。所有内容先交给模型可覆盖复杂语义，但增加成本且不能保证排除明确运行信号；推荐确定性消息分类加语义准入。

沿用当前自动化大卡片可复用全部功能，但右侧常见子页仍看不到状态；增加百分比和独立监控窗口会造成误导并增加面积。推荐复用状态源的紧凑摘要，保留已有详情。审计直接显示完整 JSON 可以保留字段，但阅读负担大；专用摘要与前后差异为主、原始结构折叠为辅更符合排查需求。

## Acceptance criteria

- [x] AC-1: 纯任务完成通知不会成为个人候选、近期记忆或习惯频次；重复三次以上仍不晋升，重新扫描历史也不恢复污染。
- [x] AC-2: 用户引用通知提出问题、正常 XML/代码内容和真实偏好陈述不会被整条误删；来源身份与引用边界可验证。
- [ ] AC-3: 既有污染处置可预览、可追溯且幂等，更新待审计数；未经核对不修改已确认画像，保留原始执行证据与审计。
- [ ] AC-4: 右侧助手与知识库工程页显示一致的阶段、可读对象及排队状态；能区分开启空闲、运行、未配置、关闭、异常和读取失败。
- [ ] AC-5: 多个状态入口共享查询；活动页面在规定刷新周期内反映变化，隐藏页面停止轮询，不伪造处理百分比。
- [ ] AC-6: 审计记录支持选中和专用详情，展示已有 before/after、执行者、领域、时间和来源；缺失快照及批次事件有明确说明。
- [ ] AC-7: 审计在宿主过滤后分页、计数，大量个人事件不会让工程事件缺失；翻页无重复和遗漏。
- [ ] AC-8: 窄侧栏、长标题、长 ID 和深浅主题均可读，状态摘要保持一至两行，审计无无效审批操作。

## Verification

初次分析证据为源码检查及本机结构化数据只读统计。个人噪声实现的机器验证见下节；没有运行本需求的 UI 视觉回归，也没有变更真实个人数据。存储统计仅代表检查时快照，不作为持久验收结论。

### 个人噪声修复（2026-10-06）

[共享内容准入](../../src/main/knowledge/personal-memory-content.ts)只将完整的已知 task-notification 包装识别为运行通知；缺失字段、仅提及标签、普通 XML 与带用户正文的混合引用不会被整条删除。Claude 的可信 isMeta 元数据在 Hook 与 transcript 知识适配层排除。纯通知不建立或覆盖用户回合边界，重启恢复也跳过旧通知起点；后续助手回答仍归属真实用户回合。原始会话显示和工具证据不受影响。

个人聊天两个入口在写 observation/episode 前排除纯通知。`isUserStatement` 拒绝内容完整的通知；确定性提取在解析完整原文后、归一化截断前排除通知，历史习惯聚合复用同一偏好准入。个人自动确定性提取和[模型提取](../../src/main/knowledge/extract-service.ts)采用排除引用、通知、代码、XML 和疑问的正文视图，来源引用和原始哈希保留。确定性偏好/习惯候选要求明确偏好表达，个人事实和决策保留既有提取路径；工程语义提取不受个人偏好规则限制。显式记住继续走独立的人工审核路径。

纯词频聚合成本最低，但无法区分运行模板与偏好；全部交给模型能识别更多含蓄表达，却为明确噪声增加成本和不确定性。当前规则只支持明确的中英文偏好、稳定行为及输出风格请求，保持用户归因、独立事件计数与人工确认。代价是含蓄表达、混合正文、条件不明确或被截断的材料可能不生成个人候选；它们仍保留原文，不通过猜测补全偏好。扩展覆盖须先增加带引用、否定、条件和项目范围的正反例，不能只增加关键词。

习惯审计仅记录实际新增的候选，包含 count 与 candidateIds；相同历史重放不产生新增事件。已有的候选写入与审计属于先后操作，不声称具备跨文件崩溃原子性。来源增量形成不同候选 ID 的一般合并问题保持后续范围。

只读复查解析 42 条 observation，其中 11 条为完整纯通知，blob 解析失败为 0。原报告的两条候选仍为 proposed，来源分别为 4 条与 10 条且均为纯通知；正式事实中没有匹配的完整通知。预览没有读取通知所引用的任务输出文件，也没有拒绝候选或删除数据。AC-3 保持未完成。

最终 `npm run test:unit -- --run tests/unit/knowledge tests/unit/knowledge-transcript.test.ts tests/unit/external-session-scanner.test.ts --maxWorkers=2 --reporter=dot` 为 75 个文件通过、4 个文件按条件跳过，741 项通过、5 项跳过。新增回归覆盖重复通知、历史重扫、引用/代码/XML、限定条件、明确偏好、普通个人事实保留、Hook 回合与重启恢复、个人 episode、模型输入与 blob、拒绝旧候选后的两次重放及提议审计不增长。数据写入均使用临时知识根，模型调用使用替身。

`npm run typecheck:strict-unused`、八个变更生产文件 ESLint、`npm run build:check`、`npm run check:package-boundary` 与变更 diff 检查通过。构建产物位于隔离的 artifacts/build-check。`npm run check:notes` 为 246 篇、0 errors、27 项既有外部链接诊断。本次没有运行真实模型质量、真实桌面交互或自动化进度/审计视觉验收。

实施时应以脱敏合成通知覆盖 Hook、transcript、个人会话和历史聚合路径；使用重复通知、混合引用和真实偏好作为对照。状态展示使用可控任务序列验证变化与多入口一致性。审计用个人事件超过分页大小、工程事件较旧、空 before/after、批次事件和已撤回对象的夹具验证；浏览器检查点击详情、键盘选择、窄屏和深浅主题。验收完成前保持上述条款未勾选。

### 验收用例矩阵

| 用例 | 输入/动作 | 应断言的结果 | 对应 AC |
| --- | --- | --- | --- |
| N1 纯通知重复 | 3 条以上相同模板、不同 task-id 的 user-role 通知，跨批输入 | 不生成 user habit，不增长个人候选或 episode | AC-1 |
| N2 历史重扫 | 历史库已有 10 条通知，新增一条真实用户消息触发聚合，连续运行两次 | 不重新提议旧通知；同一输入不会制造新增审计 | AC-1/3 |
| N3 混合引用 | 用户正文“为什么这条通知出现”加通知代码块 | 保留用户问题和引用边界，不把通知总结成偏好 | AC-2 |
| N4 正常技术文本 | XML 示例、包含标签名称的说明、正常工具日志被用户讨论 | 不因单词或尖括号整条删除，不误认成运行通知 | AC-2 |
| N5 真实偏好 | 多次独立表达简洁输出或先测试的明确偏好 | 按既有审核流程形成候选，不能绕过人工确认成为事实 | AC-2 |
| N6 同一回合多来源 | Hook 和 transcript、多个工作区扇出同一个 sourceEventId | 频次只记一次；分类不切断助手响应的回合归属 | AC-1/2 |
| N7 处置冲突 | 预览后 candidateHash 改变，或候选已被批准 | 不覆盖；要求重新核对，重试无重复写入 | AC-3 |
| P1 状态序列 | loading→idle→pending→running→succeeded，再进入 failed/needs-review | 状态文案、对象、等待数和最后完成提示与真实数据相符 | AC-4 |
| P2 单入口/双入口 | 同时打开侧栏与工作台，切工程/个人/审核子页 | 共用查询，无状态闪回或请求翻倍；工程范围标识清楚 | AC-4/5 |
| P3 延迟与失败 | 请求超过轮询间隔、请求拒绝、隐藏窗口后恢复、卸载后的迟到结果 | single-flight、错误可见、隐藏停止、恢复刷新、迟到结果无效 | AC-5 |
| P4 部分配置 | 仅规则提取、部分自动审核、全关闭、运行时尚无 current task | 不把部分配置当全部关闭，不虚构正在调用的模型 | AC-4 |
| A1 混合领域分页 | 40 条较新的个人事件、35 条较旧的工程事件，每页 30 条 | 工程列表能读到全部 35 条，计数同范围、翻页不重复 | AC-7 |
| A2 同时刻与新插入 | 多条同 timestamp 事件，翻页间插入新事件，切工作区过滤 | 稳定排序、旧页续读无重复，筛选切换重置游标 | AC-7 |
| A3 详情完整性 | 普通变更、count-only、空快照、未知动作、对象已撤回 | 逐类显示有意义信息，明确缺失，不出现空详情或无效审批按钮 | AC-6 |
| A4 视觉与键盘 | 320/390px 侧栏、宽工作台、深浅主题、长标题/ID、Tab/Enter | 摘要不超过两行，列表无横向溢出，选中与焦点可辨，详情可打开和关闭 | AC-8 |

### 测试入口与交付证据

优先扩展已有测试而非另建整套测试框架：通知适配使用 [knowledge-transcript.test.ts](../../tests/unit/knowledge-transcript.test.ts) 和 [external-session-scanner.test.ts](../../tests/unit/external-session-scanner.test.ts)；身份与习惯使用 [memory-evidence.test.ts](../../tests/unit/knowledge/memory-evidence.test.ts)、[user-memory-m1.test.ts](../../tests/unit/knowledge/user-memory-m1.test.ts)、[deterministic-extractor.test.ts](../../tests/unit/knowledge/deterministic-extractor.test.ts) 和 [user-turn-capture.test.ts](../../tests/unit/knowledge/user-turn-capture.test.ts)。自动化使用 [automation-service.test.ts](../../tests/unit/knowledge/automation-service.test.ts) 和 [knowledge-automation-ui.test.ts](../../tests/unit/knowledge-automation-ui.test.ts)；审计使用 [audit-service.test.ts](../../tests/unit/knowledge/audit-service.test.ts) 与 [knowledge-ipc-contract.test.ts](../../tests/unit/knowledge-ipc-contract.test.ts)。浏览器审计交互可在现有 UI 测试基础上补独立用例。

下列命令保留为完整需求后续实施的验证入口；个人噪声已执行的命令与结果以上节为准：

```text
npm run test:unit -- --run tests/unit/knowledge-transcript.test.ts tests/unit/external-session-scanner.test.ts tests/unit/knowledge/memory-evidence.test.ts tests/unit/knowledge/user-memory-m1.test.ts tests/unit/knowledge/deterministic-extractor.test.ts tests/unit/knowledge/user-turn-capture.test.ts
npm run test:unit -- --run tests/unit/knowledge/automation-service.test.ts tests/unit/knowledge-automation-ui.test.ts tests/unit/knowledge/audit-service.test.ts tests/unit/knowledge-ipc-contract.test.ts
npm run typecheck
npm run i18n:types
npm run i18n:check
npm run check:notes
```

修改 IPC 时同步 preload、fallback 和合同测试中的完整方法集合；不要只通过 TypeScript 编译就认定主进程已注册新接口。完成后记录实际运行的测试数、命令及未覆盖边界；视觉验收需保留合成数据下的侧栏状态、审计选中和详情截图，不能用源码阅读代替真实点击测试。

### 尚待实施验证的判断

尚未确认报告 observation 的具体 Hook/transcript 来源分支，修复通过合成夹具覆盖两个入口；未验证当前机器自动化是否实际存在调度故障，也未检查当前运行窗口的审计视觉和详情动画。后两项运行态问题应在对应实施前用脱敏夹具或实际只读诊断核对，不得据此宣称自动化后端完全未运行或审计点击事件没有触发。

优先采用本 Note 推荐的全部工程状态范围、紧凑摘要和专用审计详情。偏好语义识别的覆盖、审计分页兼容方式以及历史清理涉及的已确认事实若与实施时数据不同，应在本 Note 内更新具体取舍；不要另建缺少来源关系的临时计划文档。
