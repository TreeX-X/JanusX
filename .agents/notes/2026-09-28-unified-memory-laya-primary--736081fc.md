---
schema: harness-note/1
id: 736081fc-db55-40cd-b2ab-43c63f1729e9
kind: requirement
lifecycle: draft
created: 2026-09-28
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c0a75c6a-5d06-4088-b7ed-9ecdd835b3d3
class: architecture
tags: [memory, knowledge, unification, laya, decision-model]
---

# 统一记忆内核：工程知识库为主、Laya 为主决策开关

## Problem

JanusX 已有 queue-owned 的 observation → candidate → review → truth → BM25 管线。个人 Habit、显式保存与新 Episode 接入同一观察存储和队列，使用宿主来源契约；确定性提取器只提出候选。Profile 由人工 override 与带确认记录的个人事实派生，个人召回仍保留独立索引；旧 Episode 继续兼容读取。旧画像与个人事实提供人工重新确认迁移，不自动恢复历史确认资格。持久遗忘约束覆盖个人事实、Episode、候选及精修任务重放；明确格式的发布命令与默认输出语言具有单值冲突约束。更广泛的语义槽位、普通来源撤回的级联处理与召回强度更新仍需完成。

[确定性阶段](../../src/main/knowledge/deterministic-extractor.ts)只提出候选，由 [review-service](../../src/main/knowledge/review-service.ts)统一接收并等待人工审核。[Habit 聚合](../../src/main/knowledge/habit-aggregator.ts)按宿主核验的用户发言筛选来源，允许从工程会话学习开发习惯；项目配置、工具结果和助手回复本身不构成个人偏好证据。[个人保存工具](../../src/main/agent/runtime/tools/user-memory-tools.ts)及 [Episode](../../src/main/knowledge/user-episode-service.ts)已收拢新写入，[Profile](../../src/main/knowledge/user-profile-service.ts)生成带来源指纹的事实派生快照。[精修规划阶段](../../src/main/knowledge/llm-stage.ts)持久化通过评分门控的任务，由现有队列独立恢复执行；缺省关闭精修，无模型时保留等待且不消耗尝试次数。生产运行时已接入可选 Laya sidecar 和人工精炼入口；真实模型推理可用，但合成留出集质量不足，不能宣称生产校准完成。[个人强度计算](../../src/shared/memory-strength.ts)已连接预算后的召回与交付增强；工程事实也接入 Janus 聊天交付增强；observation 级联撤回和完整维护闭环仍待实现。

需求边界（2026-09-28）：知识库与个人画像统一底层机制；知识库服务工程事实、决策、流程、文件引用、Wiki 与图谱，参考 AgentMemory 的工程记忆设计和 MaiBot 的画像机制；Laya 成为启用后的主要决策分流器，LLM 退为可选精修；无 Laya 时规则加 BM25 加人工审核仍完整可用。

[queue 管线](./2026-09-03-knowledge-pipeline--dcc5e8a0.md)继续拥有结算、游标、失败记录与恢复。[个人与工程分离](./2026-09-15-personal-vs-engineering-memory--4515fa0e.md)及[首片落地](./2026-09-18-personal-engineering-separation--296ddf52.md)提供视图与共享边界。本提案拟替换[旧 Laya 提案](./2026-09-22-laya-decision-model-knowledge-confidence--673865a1.md)中“LLM 默认主路、Laya 仅作补充”的方向；旧文的模型资料只作背景，具体实施与验收以本篇为依据。本文保持 draft，不表示重构或模型验证已经落地。

## Expected behavior

采用 JanusX 原生的单记忆内核，保留工程与个人两种视图。复用现有文件存储、review 与 audit；AgentMemory 和 MaiBot 提供经核对的机制参考。统一管线为：

工程知识库面向用户阅读和 MCP 接出，供其他终端 Agent 使用项目事实、决策、流程、Wiki 与引用。个人画像与记忆服务 Janus 个人助手，保存用户明确要求记住的内容，并从交流及工程活动中积累可归因到用户本人的偏好与开发习惯。个人助手可以读取工程知识库，工程知识不是个人画像的禁区；读取项目事实与确认个人偏好是不同动作。个人记忆不能因此反向出现在工程 MCP 输出中。

明确的“记住这件事”应按记忆意图直接生成待结算材料，不受 Habit 的三次重复门槛限制；自动归纳习惯则需要独立事件证据。参考 MaiBot 的原始发言核验、确认账本和画像投影，不将 Janus 画像限制为闲聊资料，也不将项目中的每条规则都推断为用户个人习惯。

`Capture → 归属/证据核验 → Queue → 规则候选与相关记录检索 → DecisionScorer → Gate → 可选 LLM 精修 → Inbox/审核策略 → Truth → 分域 Recall → Lifecycle`

### 归属、证据与结算

让 `scope: project|user|global` 贯穿 capture、candidate、truth、search、recall 和 tool，并与 workspaceId、visibility 分开建模。scope 与可信来源由宿主根据调用通道和实际证据确定，模型及工具参数不能自行授予个人写入、全局共享或 server-verified 权限。工程域必须绑定真实工作区；global 仅表示明确的跨项目知识归属，不等于公开访问。个人域默认私有，不能因 allowGlobal、缺少 workspaceId 或旧 user 哨兵而进入工程与共享面。

一次队列调度可以结算两域的合法输入，但不强制一个工作区 batch 混装两域。工程原始记录保持 project 归属；宿主核验的用户陈述可派生 user 习惯候选，并保留原工程来源。无本人归因的工程事实、工具结果、助手推测不能直接成为个人习惯。右侧采用统一审核栏目，保留工程/个人筛选和独立计数，复用同一审核服务。通用 agent loop 保持中立，画像行为落在 JanusX 的 ChatTurnPorts、工具适配和 knowledge 服务内。

将 Episode 收敛为带 expiresAt 的 user Observation，将 Habit 收敛为 user MemoryFact；Profile 改为事实账本的派生快照。个人保存工具先保存可追溯输入，再经同一队列生成候选；明确的人工修改也通过统一 mutation/review 服务记录，不能直接写派生 profile.json。

原始证据必须记录 observationId、来源通道、实际说话者、会话、发生时间和可核对原文片段。个人身份与偏好的稳定来源只能来自人工确认、宿主核验的用户直接陈述或有明确来源的可信迁移；摘要、模型推测、第三人称转述和 assistant 回复只能作为未确认材料。可信来源也不自动等于审核通过；无 Laya 时仍须人工审核。采纳 MaiBot 的原始消息核验原则，在 JanusX 按 actor/session/correlation 与原文核对实现，不照搬聊天昵称和中文称谓正则。

候选生成与事实提交分离。确定性提取不得自行调用 autoAccept；queue 统一驱动 scorer、分流和候选结算。稳定处理键包含 scope、owner、原始事件身份与处理版本；同一事件重试不能累加习惯频次或重复提案，不同真实轮次的重复确认可以贡献证据。保留阶段结果与可重放的精修任务，使进程中断或某阶段失败后恢复不会重做已提交事实。跨批次习惯聚合读取有界历史证据，不能只依赖一次 debounce 恰好收集到三条输入。

### 知识库与审核界面

右侧知识库审核与个人画像审核合并为一个“审核”栏目，提供“全部 / 工程知识 / 个人记忆”筛选及各自待处理数量。复用候选卡片、详情、批准和拒绝操作；每张卡片明确归属与批准后的用途，批量操作不得隐式改变归属。工程候选展示项目、事实或决策、文件来源及版本冲突；个人候选展示明确记忆意图或推断习惯、用户原话、证据次数及来源项目。

“个人画像审核”改称“个人记忆审核”：审核对象是独立事实、偏好或习惯，画像由已确认记忆派生。知识库负责工程阅读、管理及 MCP 接出；个人画像负责查看 Janus 已了解的用户、纠正和遗忘；统一审核栏负责待确认内容。从工程会话归纳的个人开发习惯显示工程出处，批准后仍属 Janus 私有记忆，不进入工程 MCP 输出。

先统一审核入口和交互，再随 Profile 派生机制调整画像页面。保留两个独立审核面可突出领域区别，但会重复卡片和操作；将知识阅读、画像展示与审核全部合并则混淆已确认内容与候选。采用统一审核、分域筛选，继续保留知识库与画像两个阅读视图。[右侧审核栏](../../src/renderer/src/components/knowledge/MemoryReviewTool.tsx)提供全部、工程知识、个人记忆筛选与独立计数；画像卡片的审核按钮打开同一栏目，画像工具图标不再承担待审提醒。知识库工作台的候选详情复用同一审核卡片及原有审核服务。

审核栏打开或重新激活时读取三个候选集合，只展示 proposed；批准、拒绝后重新读取，另提供手动刷新。任一集合读取失败都显示错误与未知计数，不将部分读取结果解释为零条待审，并禁用旧列表上的审核操作。提交期间所有审核按钮禁用，主进程继续拥有候选状态及落库校验；提交携带候选类型、ID 与显示内容的 candidateHash，不改变归属。当前没有后台推送或批量批准，长时间停留时通过刷新获得外部新增候选。

[审核快照](../../src/shared/review-candidate-snapshot.ts)绑定完整候选的正文、归属、证据、冲突、替代目标及 Wiki 来源和页面版本，递归排序对象键后计算 SHA-256；外层处理状态、审核备注与评分建议不参与指纹。统一审核栏、知识工作台和 Note Wiki 编辑器都从已显示候选生成请求。主进程在候选锁内重新计算指纹；缺少或不匹配时拒绝批准和拒绝动作，用户须刷新后重审。提交成功但响应丢失时，原快照仍可对相同终态幂等重试。此指纹证明请求对应的候选内容，不授予来源可信资格，也不替代宿主的 Note hash、事实替代与遗忘核验。

[审核存储](../../src/main/knowledge/review-service.ts)与候选列表使用严格 JSONL 读取，只有 ENOENT 表示文件不存在；读取异常和 JSON 解析错误必须中断操作，保留原文件。Wiki 索引解析错误、缺少 pages 数组及页面读取异常也不能当作空库继续发布。确定性 Graph 提取、LLM Wiki/Graph 提取和 Note Wiki 提案均与对应审核动作共用进程内候选锁，新增候选按 ID 去重，在锁内读取并原子替换文件。审核审计失败的回滚不会覆盖等待中的新增候选。

仅在界面刷新列表可以减少过期内容，但不能排除显示到点击之间的后台精修；因此审核请求必须绑定显示快照。继续追加文件成本较低，但与整文件审核回滚并发时会丢失新增记录；采用同类候选串行写入，代价是新增也需读取整文件。当前不提供跨进程锁、跨集合事务或断电恢复日志；大库的文件重写成本需要测量后再决定分片。保持原有宽容读取虽能展示部分记录，却不能用于后续覆盖写入，因此损坏时优先保留数据并显式报错。

机器验证（2026-09-29，审核一致性与存储保护）：`npx vitest run tests/unit/knowledge tests/unit/knowledge-ipc-contract.test.ts tests/unit/memory-review-ui.test.ts tests/unit/personal-memory-correction-ui.test.ts tests/unit/knowledge-note-sources.test.ts tests/unit/knowledge-note-ui.test.ts tests/unit/note-wiki.test.ts tests/unit/agent/user-memory-tools.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts` 通过 60 个文件、532 项测试；真实 Laya 文件的 1 项测试显式跳过。[审核测试](../../tests/unit/knowledge/review-service.test.ts)覆盖过期快照、缺失 hash、原快照重试、损坏 truth 与候选文件、不可读路径和并发新增期间的审计回滚；[提取测试](../../tests/unit/knowledge/extract-service.test.ts)覆盖三类候选列表损坏时拒绝部分读取；[浏览器测试](../../tests/unit/memory-review-ui.test.ts)覆盖后台改写后保留旧卡片、刷新及重新批准。[Note Wiki 界面测试](../../tests/unit/knowledge-note-ui.test.ts)验证候选 hash 与宿主来源 hash 的职责分离。`npm run typecheck:strict-unused`、`npm run i18n:check`、`npm run check:package-boundary` 通过；8 个生产文件定向 ESLint 零错误，保留 KnowledgeWorkbench 的既有 refresh 依赖警告。全库 Note 检查未通过：debug-mode-plan 缺少 Proposal、Risks，worktree-composer-entry-motion 的 scope/reason 关系字段无效；本篇未报错。未运行完整 Electron E2E、打包、真实模型或真实用户数据操作。

审核卡片显示批准用途、正文、事实类型、证据引用数、来源项目、发言者和原文、文件引用、替代目标及已有冲突提示。确定性 remember/habit 候选按宿主生成的稳定 ID 标明明确保存或推断习惯；旧候选缺少这些标识时不猜测意图，缺少来源字段时也不伪造用户原话。Wiki 继续复用 Note 来源核对组件。工程来源的个人习惯按 user 归属留在个人筛选，批准后仍是 Janus 私有记忆。

### 候选、重复、冲突与版本

规则层负责从原文提取有出处的陈述，保留文件和工程事件引用。BM25 在归属与权限过滤后的语料中查找相关事实，再用精确匹配、Jaccard 与概念/文件交集形成重复和冲突提示。相似度只用于候选召回，0.7/0.85 等阈值不得直接执行替代或删除；短文本、否定句、命令参数和同名跨项目内容必须有反例测试。索引未就绪时使用有界同域扫描或标记待复核，不得把“没搜到”解释成“没有冲突”。

事实沿用 MemoryFact 与 supersedes；isLatest 优先从 active 状态和版本链派生，避免额外维护另一份真相。精确重复合并证据；异值陈述成为独立候选；显式替代须引用同域当前版本，并经 review 检查。对于可结构化的单值槽位，如发布命令和默认输出语言，引入 factKey、polarity、cardinality 与冲突分组；未声明替代的新值进入冲突待审，不按时间或相似度覆盖旧值。自由文本不能确定槽位时保留冲突提示，不强行分类。

[事实冲突审核](../../src/main/knowledge/fact-conflicts.ts)使用严格读取的事实和候选集合，不以搜索索引是否命中判断无冲突。归属比较包括 memory scope、workspaceId、ownerScope、tenantId、projectId 和 ownerUserId；跨域事实及其他所有者的正文不进入审核上下文。新候选的 fact ID 若已经存在于 truth，无论内容相同、不同或旧记录已归档，均拒绝覆盖；只有已 applied 候选的同快照重试保持幂等。truth 已写入但候选仍 proposed 的崩溃残留需要恢复处理，不能借同 ID 再确认来覆盖已有记录。

[槽位规则](../../src/shared/fact-slot.ts)只识别完整单行的 `发布命令` / `release command` 和 `默认输出语言` / `default output language` 标签，支持冒号、等号及表示否定约束的 `!=`。语言值只归一化当前支持的中英文别名；命令保持大小写和参数。宿主从正文派生 factKey、cardinality 与 polarity，并在落库时拒绝与正文不符的自报字段。旧事实不需要批量重写，审核按同一规则读取正文；新的确认 hash 包含已保存的槽位字段。两个不同肯定值，以及同值的肯定和否定构成冲突；不同值的否定约束可并存。多行、临时要求、第三人称及不支持的语言表达不获得槽位身份。

确定性近重复聚类和 LLM 合并都核对槽位值与极性。不同命令参数、不同值或相反极性不得因 Jaccard 相似而合并；明确格式的命令候选保留规范化后的完整正文，不使用卡片预览截断。普通自由文本继续使用既有规则；这不承诺任意自然语言矛盾检测。

[审核控件](../../src/renderer/src/components/knowledge/FactReviewControls.tsx)在批准前通过专用 factReviewContext IPC 获取当前冲突事实、内容、版本和指纹，并列出同域同槽位的其他待审值。有一个当前目标时必须勾选替代确认，提交同时绑定候选快照与旧事实指纹。模型提供 supersedes 也不能跳过旧值展示与人工确认。主进程在事实共用锁内再次核对目标归属、active 状态、到期时间、遗忘约束和指纹；成功后归档旧版本，新事实记录 supersedes 并递增版本。审计记录所选目标 ID 和指纹，审计失败恢复候选及旧 truth。多个当前冲突目标、重复目标 ID 或失效目标阻止批准，用户须先处理已有冲突；普通批准不能隐式覆盖其中任意一条。读取失败和未完成核对都禁用批准，刷新可以重试；拒绝候选仍走原快照契约。

完整语义分类能覆盖更多表达，但需要可靠的抽取与质量证据；当前选择有限标签规则，避免把临时要求误判为长期单值。只显示冲突提示维护成本较低，却允许两个不同单值同时进入 active，因此提交端也实施约束。同 ID 全部拒绝可保留历史，代价是同内容崩溃残留不能自动修复。审核上下文按卡片读取并扫描当前文件，没有新增持久索引；大候选列表的读取次数和进程内串行等待需要测量，达到交互瓶颈时再引入批量上下文读取。当前没有多目标合并、任意事实选择器或跨进程事务；既有显式个人纠正保留目标的所有者字段。

机器验证（2026-09-29，单值冲突与显式替代）：执行审核一致性段落所列完整 Vitest 命令，通过 61 个文件、551 项测试；真实 Laya 的 1 项测试显式跳过。[事实冲突测试](../../tests/unit/knowledge/fact-conflicts.test.ts)的 15 项测试覆盖 ID 碰撞、语言别名、命令参数、极性、所有者隔离、槽位字段伪造、显式目标确认、旧目标变化、竞争替代与审计回滚；确定性与 LLM 提取测试覆盖不同参数不得被近重复合并；审核浏览器测试覆盖旧值展示、勾选确认、目标指纹提交及读取失败恢复。`npm run typecheck:strict-unused`、`npm run i18n:check`、`npm run check:package-boundary` 通过；16 个生产文件定向 ESLint 零错误，保留 KnowledgeWorkbench 的既有 refresh 依赖警告。全库 Note 检查仍有审核一致性段落列出的三个无关错误，本篇未报错。既有 user-memory-contract 测试在临时 audit 文件 rename 时输出一次 EPERM，未导致测试失败。未运行完整 Electron E2E、打包、真实模型或真实用户数据操作。

保留 WikiPage、GraphEdge、sourceFactIds，以及已落地的 [Note 来源审核](./2026-09-25-note-wiki-r3--844bc2f1.md)中的 sourceNoteRefs、hash、页面版本与回滚约束。Laya 不生成新正文；无 LLM 时可以提取原文事实、生成确定性关系和人工整理 Wiki，但不承诺自动完成多来源长文综合。

### Laya 决策与 LLM 精修

定义 DecisionScorer 和 NoopScorer；scorer 返回版本化的决策注解，至少携带 provider/modelRevision、问题模板版本、calibrationId、问题答案及分布、证据片段范围、截断/分块标记和不可用原因。核心问题包括 retention、kind、is-duplicate、does-supersede、is-conflict；事实支持度另设“该陈述是否由所附证据支持”的问题。kind 分类概率不能直接覆盖 MemoryFact.confidence，访问强度 strength 也不能作为事实可信度。

门控使用 `answer_confidence`（被选答案的概率），不能直接使用 choice/score 的熵型 `confidence` 或 action.act_probability。对 noul 布尔题还必须检查 `noul=P(true)` 的方向：0.98 的 answer_confidence 也可能表示“高度确定不重复”。宿主校验题目 ID、返回类型、有限概率及范围；缺失答案、选项折叠或证据截断一律不能进入自动接受。

高置信一致的“快道”首先表示跳过 LLM、直接进入审核路径。scorer 自己不能改变 scope、来源可信等级、supersedes 或 truth。首期自动接受默认关闭；未来只有 Laya ready、JanusX 对应任务与语言的校准通过、证据明确、无冲突且用户启用策略时，才考虑工程域纯新增确定性 fact 自动接受。个人身份/偏好改写、替代、删除及冲突处理保持人工审核。模型或校准版本改变即撤销旧门控资格。

LLM 精修策略明确为 off（默认）、on-demand 和人工触发。on-demand 下，只有 Laya 标记需精修且用户配置允许、预算充足时调用；Laya 缺席不会触发自动 LLM。人工精修仍走 queue-owned 任务。复用原有超时、重试、批次和字符预算；精修结果保留原候选关联与新增证据，重新接受证据/冲突检查，不能沿用精修前的置信度直接落库。无模型是正常不可用状态，原规则候选继续留在 Inbox。

长证据按可回溯片段切分并限制总块数和问题数。截断不得丢失否定、主体或替代对象。跨块矛盾进入复核；Laya predict_long 的最大概率窗口不能作为整篇证据的已校准支持度。retention 注解只建议后续分类，不能把长期证据降成 noise 后直接交给清理任务删除。

### 画像、召回与生命周期

Profile 按“人工 override → 已确认事实账本 → 有效近期事件”构建；uncertain 材料在审核面独立可见，默认不作为稳定画像注入。稳定事实独立于 BM25 top-k 选取，不能因查询分数变化被挤出。快照包含来源 ID 与内容版本、生成规则版本、模型/校准版本和 TTL；检索排名分数与普通访问计数不进入内容指纹。内容指纹不变时只续缓存期限，不制造新画像版本。事实变更、撤回、遗忘和 override 变更立即失效缓存，TTL 只作兜底；移除 override 后可恢复底层自动快照，不能由后台刷新覆盖人工输入。

共享召回实现与缓存协议，但保持按域过滤的索引视图、独立项目预算与独立画像预算。个人聊天可在允许时融合两段上下文，工程、maintenance、roundtable、remote、MCP 和共享通知默认排除 user。混合排序首期以 BM25 加新鲜度、可信来源和强度为基础，保留有界图扩展与可选向量接口；不把 embedding 变成默认依赖，也不让未配置的通道占排序权重。

统一 strength 为 [0,1] 的保留/排序强度，与 confidence、authority、是否仍然正确分开。采用墙钟锚点衰减与有冷却时间的有界增强：同一时刻重复计算和停机后计算结果一致；最后真实证据时间、最后访问时间与强度锚点分开保存。只对通过权限、有效性、去重和最终预算后真正交付的记忆记录访问，浏览列表、后台相似检索和被裁掉的候选不增强；同一请求去重，频繁读取不构成新证据。

个人事实的有界实现由[强度函数](../../src/shared/memory-strength.ts)和[交付记录器](../../src/main/knowledge/memory-access.ts)承担：半衰期 30 天，每次增强 0.15，上限 1，冷却 10 分钟。宿主将 strength、anchorAt、lastAccessAt 与最近 64 个请求摘要存入 recallState，读取按锚点计算，不使用定时器反复写回衰减值。冷却期内只推进访问水位与请求历史，不重设强度锚点；重复回执及早于最后访问水位的回执被拒绝，时钟回退时保守跳过。审核移除候选自带的 recallState，访问状态不参与确认、替代或画像内容指纹，也不改写真实证据时间、confidence 和事实版本。工程事实的 Janus 聊天交付复用相同的衰减、冷却与上限。

个人召回先过滤失效与到期事实、到期 Episode，再按项目原有独立预算选择并去重；已确认 Profile 的前三项保留稳定名额，其余事实排序使用有效强度。纯搜索和浏览不记录访问。流式聊天只对完整保留在最终模型消息中的个人片段，在首个文本或工具调用输出时记录；仅创建流对象、输出前失败或已取消不记录。非流式聊天在生成成功后记录；user-memory.search 在构造最终工具返回值后记录。这里的交付指宿主交给模型或工具调用方，不证明模型引用了该事实，也不证明用户读到了回答。工具接口没有调用事件 ID，宿主每次执行生成 UUID，仅提供冷却限制，不承诺跨执行重试恰好一次。

记录器复用审核锁，重新验证当前确认、快照 hash、TTL、归属与遗忘屏障，再原子写入 facts.jsonl。损坏文件或非法访问状态使写入失败并保留原文件；元数据失败只警告，不阻断聊天。继续使用 JSONL 避免引入第二个数据库，代价是每次有效访问（包括冷却期内的水位更新）都全量读取、重写文件，并可能延迟首个输出。出现大库延迟后应测量再决定分片或独立遥测存储。有限请求历史不提供无限期请求 ID 去重；旧回执由时间水位拦截，同一 ID 在历史淘汰后配合新回执仍可计数。

强度变弱首先影响排序与热度，不能据此认定工程事实失效或删除当前 truth。替代/撤回由审核改变有效性，Episode TTL 到期后退出近期视图；仍被事实引用的证据保留可解释来源或明确的过期标记。清理必须检查引用、候选和待处理任务。遗忘须使候选重放、画像缓存、搜索索引与派生产物都不能复活已遗忘内容，并保留不泄露原文的必要审计记录。

[撤回服务](../../src/main/knowledge/operations-service.ts)按 workspace 与 ID 共同定位事实及图边，同一归属内的重复身份拒绝操作；事实、Wiki 和图边分别与对应审核共用写锁。撤回及反馈读取 JSONL 时只将缺失文件视为空集合，损坏行或读取错误直接失败，不能将剩余记录重写为完整库。Wiki 索引损坏保留原异常，不解释为找不到目标。

[精修任务](../../src/main/knowledge/refinement-tasks.ts)的列表和统计对 pending/running 任务重新核对候选状态与内容、有效事实上下文、证据内容和有效期。事实撤回或到期、候选拒绝、证据变化立即投影为 cancelled；不等待模型可用或自动精修开启。视图读取不争用整个模型调用期间持有的任务锁，也不写账本；下次调度在模型门控前持久化取消。视图判定与持久化之间若来源恢复，尚未落盘的取消可能恢复为 pending，这是只读诊断的明确边界。已持久化的 cancelled 不自动重放，终态历史保持原结果。模型提交回调同时核对候选仍为同一 proposed 快照，避免运行期间人工拒绝后继续提交；生成结束后候选已离开 proposed 时记录取消。

该实现复用现有上下文 hash，无须增加跨文件撤回日志。代价是同域、同 workspace 的任一有效事实变化都会使旧上下文任务失效，统计读取也需扫描来源并解析证据；大量历史或高频刷新出现延迟时应测量后引入可重建缓存。普通事实撤回不等于遗忘其全部观察来源，也不自动删除其他独立事实、Wiki 或图边；候选的替代与纠正目标仍由批准端核验。本切片不提供 observation 撤回入口、跨派生产物事务或已交付内容的撤回，完整 AC-9 保持未完成。

## Scope

工程事实在[召回服务](../../src/main/knowledge/recall-service.ts)中使用 `memoryStrength × 0.5` 作为独立 strengthBoost，保留 BM25、可信度与新鲜度项。衰减按每次召回的墙钟计算，不固定在索引构建时；active 与 TTL 过滤在缓存命中后重新执行，过滤后文档身份进入 BM25 缓存键，确保到期文档不继续影响词频。强度落盘仍会改变现有文件指纹并重建缓存，未引入单独的排名数据库。

[工程上下文](../../src/main/knowledge/context-service.ts)只为预算后直接交付的事实生成回执，绑定 workspace、ID、事实快照 hash 和完整上下文段落；Wiki/图边的引用不间接增强源事实。Janus 的个人融合聊天和工程聊天均在首个非空模型文本或工具调用输出后记录工程回执，非流式生成在成功后记录；最终消息裁剪了完整段落时保守跳过该回执。工程记录器在审核锁内核验 active、TTL、域、workspace、唯一身份与快照，拒绝跨项目同 ID 和私有事实串写。沿用工程 active truth 的资格规则，兼容没有个人 human-review 字段的历史工程事实，访问本身不会授予确认或修改事实内容与版本。

工程浏览、普通搜索、MCP、maintenance 和其他尚未接入交付确认的调用面保持只读；工程闭环验收范围是 Janus 聊天中的直接事实。整个段落作为回执会少计部分裁剪后仍保留的单条事实，但避免把被裁掉的上下文算作已交付。工程与个人回执分别写入同一文件，各自只影响本域事实，代价是融合聊天最多触发两次整文件更新；出现首输出延迟时需测量后考虑合并同请求更新。

### 上游源码核对

2026-09-28 按用户给出的 AgentMemory 与 MaiBot URL 审阅下列固定提交。A-Dawn/A_memorix 为额外对照；最终画像依据采用 MaiBot 主仓库中实际集成的 src/A_memorix 及宿主核验层。审阅范围是下列代码路径和相关测试，不代表对整个上游仓库做全面安全审计。

| 来源与固定提交 | 实际实现与对 JanusX 的取舍 |
|---|---|
| [rohitg00/agentmemory @ c314c7bf6a59cc6d024b77a15069887876f420d2](https://github.com/rohitg00/agentmemory/tree/c314c7bf6a59cc6d024b77a15069887876f420d2)，Apache-2.0 | [remember.ts](https://github.com/rohitg00/agentmemory/blob/c314c7bf6a59cc6d024b77a15069887876f420d2/src/functions/remember.ts)用 BM25 缩小比较集合，Jaccard >0.7 即直接使旧记忆非 latest；legacy 无 project 被视为通配。采纳相关记录预筛、来源和版本链；拒绝相似即替代、未知归属通配和绕过人工候选审核。 |
| 同一 AgentMemory 提交 | [access-tracker.ts](https://github.com/rohitg00/agentmemory/blob/c314c7bf6a59cc6d024b77a15069887876f420d2/src/functions/access-tracker.ts)记录有界访问历史，[retention.ts](https://github.com/rohitg00/agentmemory/blob/c314c7bf6a59cc6d024b77a15069887876f420d2/src/functions/retention.ts)使用时间衰减与访问增强并支持直接淘汰。采纳独立访问记录和索引失效；不沿用近期访问的 1/天数 增强公式或低分硬删除。其 iii-engine 运行拓扑不进入 JanusX。 |
| [Mai-with-u/MaiBot @ bac9090758668098003d59642b607fb0f1b77337](https://github.com/Mai-with-u/MaiBot/tree/bac9090758668098003d59642b607fb0f1b77337)，仓库根许可证 GPL-3.0 | [person_fact_verifier.py](https://github.com/Mai-with-u/MaiBot/blob/bac9090758668098003d59642b607fb0f1b77337/src/services/person_fact_verifier.py)核对真实说话者、会话、原文、直接自述及反转；[memory_flow_service.py](https://github.com/Mai-with-u/MaiBot/blob/bac9090758668098003d59642b607fb0f1b77337/src/services/memory_flow_service.py)由宿主设置 server_verified。采纳“模型提出、宿主核验”的边界；模型不能凭自报 trust 进入稳定画像。 |
| 同一 MaiBot 提交 | [metadata_fact.py](https://github.com/Mai-with-u/MaiBot/blob/bac9090758668098003d59642b607fb0f1b77337/src/A_memorix/core/storage/metadata_fact.py)实现 claim/evidence/transition、单值冲突与显式 supersedes；[person_profile_service.py](https://github.com/Mai-with-u/MaiBot/blob/bac9090758668098003d59642b607fb0f1b77337/src/A_memorix/core/utils/person_profile_service.py)将账本置于分类证据之前、限制非可信分栏、计算证据指纹、最后应用 override。复用这些规则到现有 MemoryFact/review，不新增一套平行 claim truth。 |
| 同一 MaiBot 提交 | [memory_lifecycle_policy.py](https://github.com/Mai-with-u/MaiBot/blob/bac9090758668098003d59642b607fb0f1b77337/src/A_memorix/core/utils/memory_lifecycle_policy.py)用墙钟锚点、半衰期、访问冷却及冻结/恢复阈值；[画像注入](https://github.com/Mai-with-u/MaiBot/blob/bac9090758668098003d59642b607fb0f1b77337/src/maisaka/memory/person_profile.py)限制人数和字数并默认排除 uncertain fallback。采纳确定性时间计算与有界注入；不采纳群聊人物选择和聊天记忆的默认衰减参数。 |
| [NandhaKishorM/laya @ 9d955671415fc19f069b9cc998928075c1f255ec](https://github.com/NandhaKishorM/laya/tree/9d955671415fc19f069b9cc998928075c1f255ec)，0.3.21，Apache-2.0 | [common.py](https://github.com/NandhaKishorM/laya/blob/9d955671415fc19f069b9cc998928075c1f255ec/laya/common.py)区分 max(p) 与归一化熵；[agent.py](https://github.com/NandhaKishorM/laya/blob/9d955671415fc19f069b9cc998928075c1f255ec/laya/agent.py)分别输出 answer_confidence、confidence、noul 和 action，并明确 predict_long 的跨窗概率未整篇校准。按答案语义和证据范围门控，不把任意高分当真。 |
| 同一 Laya 提交与多语模型 | [serve.py](https://github.com/NandhaKishorM/laya/blob/9d955671415fc19f069b9cc998928075c1f255ec/laya/serve.py)默认绑定 0.0.0.0、启动 preload 全部模型；health 可以在 loaded 为空时返回 ok。首期使用受控单模型 sidecar，要求模型预热推理成功后才 ready，不能直接沿用 CLI 默认值。 |
| [A-Dawn/A_memorix @ 28db65dd96f546f736d65c043a39254cbae2c4e9](https://github.com/A-Dawn/A_memorix/tree/28db65dd96f546f736d65c043a39254cbae2c4e9)，2.0.0a4，AGPL-3.0-only | 独立仓库已发展为 namespace memory engine；[画像服务](https://github.com/A-Dawn/A_memorix/blob/28db65dd96f546f736d65c043a39254cbae2c4e9/src/a_memorix/core/utils/person_profile_service.py)与[最终结果访问测试](https://github.com/A-Dawn/A_memorix/blob/28db65dd96f546f736d65c043a39254cbae2c4e9/tests/test_access_reinforcement_boundaries.py)用于交叉核对，不与 MaiBot 内置版本混为同一提交。 |

本方案以机制参考和 JanusX 自有实现为主，不复制或打包 MaiBot/A_memorix 源码；未来如需直接复用，须针对实际文件许可另作选择。SQLite 本身支持 local-first 和离线，并非否决理由；不整体接入上游引擎的原因是重复存储与审核所有权，以及额外运行时、向量索引、服务和迁移成本。

### Laya 部署与校准边界

首期使用 Python 本地 sidecar 加固定多语 checkpoint，通过父子进程 stdin/stdout 的 NDJSON 协议调用 Agent.predict，不开放 HTTP 监听端口。延迟加载单个本地模型，限制六个问题、1024 token、单次并发和五分钟空闲驻留；截断或选项合并返回 unavailable。预热最多等待 120 秒，下载最多 900 秒，单条评分最多 30 秒；每批最多 20 条，极端超时仍会占用队列时间。运行中失联、繁忙、超时或协议错误保留规则候选。直接固定模型，避免 Router 在英文输入时另行下载英文 checkpoint。

应用仅携带 sidecar.py、model-manifest.json 和 requirements.txt，Python/torch 环境与权重按需安装，默认模型目录为 userData/laya-weights/ 下的固定 revision。设置页提供开关、Python 绝对路径、模型目录、下载校验、预热和卸载。安装、下载、校验、预热与 ready 是不同状态，禁用或未 ready 时不能进入模型决策；自动精炼任务也必须检查运行时仍 ready。固定 SDK 0.3.21 和全部模型文件的 SHA-256；运行阶段设置离线模式，不临时联网拉取模型。

Windows 验证环境采用 Python 3.12、torch 2.6.0+cpu、transformers 4.57.6，其余版本见 [requirements.txt](../../resources/laya/requirements.txt)。安装示例为 `uv venv --python 3.12 <环境目录>`，然后 `uv pip install --python <环境目录>/Scripts/python.exe -r resources/laya/requirements.txt`；把该 Python 绝对路径填入设置，再下载并预热。该文件固定版本但没有依赖包哈希，不等同于模型文件的摘要校验。环境和权重未写入仓库，也未修改用户现有 Janus 配置。

SDK 会在加载时改写 tokenizer_config.json，因此 sidecar 在同卷临时目录复制该配置，并为大文件建立硬链接；不支持硬链接时复制文件。下载原件保留原摘要，重复预热仍可验证。正常卸载关闭 stdin，使临时目录清理完成；超时、崩溃和强制结束可能残留 `.runtime-*`，不保证异常退出清理。Windows venv 启动器可能另建 Python 子进程，强制停止必须终止整个专属进程树，不能只结束启动器。

多语模型核对版本为 [e4e9ddf21a7b1903b7acffd8814ad4307bf63a67](https://huggingface.co/convaiinnovations/laya-multilingual/tree/e4e9ddf21a7b1903b7acffd8814ad4307bf63a67)。其 [rl_agent_config.json](https://huggingface.co/convaiinnovations/laya-multilingual/blob/e4e9ddf21a7b1903b7acffd8814ad4307bf63a67/rl_agent_config.json)为 max_len=1024、head_max_len=256、temperature=[1,1,1]、temperature_by_options={}，未附分桶拟合温度。model.safetensors 为 643,835,514 bytes，tokenizer.json 为 34,363,188 bytes，整个该 snapshot 文件约 678.2 MB；“644 MB”只代表权重文件，不包含 tokenizer、Python 环境与运行内存。

上游 [BENCHMARKS.md](https://github.com/NandhaKishorM/laya/blob/9d955671415fc19f069b9cc998928075c1f255ec/BENCHMARKS.md)明确区分任务、语言、温度修正与拟合数据。0.466→0.081 属于上游英文模型特定拟合实验，不能作为 JanusX 多语模型的校准保证。建立真实工程与个人候选的标注集，按来源事件/会话拆分校准与留出测试，避免重复片段泄漏；分别测 retention、kind、support、duplicate、supersede、conflict 的 precision/recall、Brier、ECE、覆盖率和错误接受率。校准不提高分类正确率；质量不足时调模板或另行微调，自动接受继续关闭。

官方已有 Python ONNXAgent 与导出/INT8 工具，但仍复用 Python tokenizer/common 协议，所核对 HF snapshot 没有现成 ONNX 图。ONNX/量化作为后续 CPU 优化，需要另验导出、分词、选项、概率一致性及重新校准。

[实测报告](../../tests/fixtures/laya-evaluation-windows.json)记录 Windows CPU、最多四线程、24 条中英文合成样例的完整六题输出、模型版本及适配器摘要：进程预热 19,855 ms，六题总延迟 P50 714.5 ms、P95 874 ms，实际 Python 解释器峰值工作集 2,325,618,688 bytes（约 2.17 GiB）。预热包含校验、导入和推理，不代表清空系统缓存后的磁盘冷启动。报告由 [evaluate-laya.py](../../scripts/evaluate-laya.py)生成；Windows venv 启动器的约 5 MB 内存不能代表模型进程。以上是单台机器测量，不是设备性能承诺。

[评估样例](../../tests/fixtures/laya-memory-eval.json)包含 8 条校准样例和 16 条留出样例，按 source 分离；双语对照共用语义场景，样本量不足以建立生产校准。留出集两种语言 retention 准确率均为 37.5%、kind 为 50%、support 为 87.5%；conflict 正例召回率为 0。逐语言逐题 Brier、ECE 和 precision/recall 保留在报告。未拟合温度，未根据留出集调模板，calibrationId 仍为 null；自动接受在产品中始终关闭，不用零次自动接受伪装通过质量门槛。AC-8 保持未完成：下一项质量工作是扩大真实脱敏标注集、仅用校准部分改进题目，再对新的独立留出集验收。

### 人工评分与可选精炼的实施边界

[审核栏](../../src/renderer/src/components/knowledge/MemoryReviewTool.tsx)为普通确定性事实提供重新评分和提交 LLM 精炼。浏览器提交当前候选快照的 SHA-256，宿主从存储重新读取归属和证据；[candidate-actions](../../src/main/knowledge/candidate-actions.ts)在现有处理队列执行，只评分选中候选。旧迁移记录、显式记忆和个人纠正不使用人工精炼入口。评分详情展示模型建议与未校准提示，不能授权事实提交。

[精炼任务](../../src/main/knowledge/refinement-tasks.ts)用 trigger=manual 区分人工意图与 scorer 建议，不伪造 ready 注解。人工任务可在自动精炼关闭或没有 Laya 时运行，但仍要求知识功能启用、模型可用、字符预算充足和证据有效。没有 LLM 时保留 pending 且不消耗尝试；相同快照不重复建任务，失败最多三次，指数退避。执行前以及模型返回、候选写入前复核证据和工程上下文；候选已审核、变化、遗忘或来源失效时不覆盖。精炼只改选中候选，不追加无关事实、Wiki 或图谱输出；所有结果仍待人工审核。

### 实施顺序与范围

1. 固定归属与证据契约：在 shared/knowledge、contracts、capture、提取与审核入口贯通 project/user/global、宿主来源记录与事件身份；覆盖工程用户陈述可派生个人开发习惯、未归因工程内容不能派生个人习惯、重放去重及旧数据兼容。候选决策注解随 scorer 实施，Episode TTL 的统一随写链收拢实施。
2. 收拢写链并完成离线基线：改造 deterministic-extractor、processing-queue、review-service、user-turn-capture 和 user-memory-tools；移除提取器自动接受，个人保存与 Episode 进入统一管线，规则候选全量人工审核。新 Episode 切换写入时提供旧文件兼容读取与生命周期处理；未来自动审核由统一策略层另行实现。
3. 接入 scorer 与精修 Gate：实现 NoopScorer、sidecar 状态、固定多语适配、输出校验、校准记录和独立精修任务；无模型也能通过完整端到端测试，随后再评估真实 Laya。
4. 完成 Profile 与 Lifecycle：改造 user-profile-service、user-overview-service、habit-aggregator、recall-service 和 user-recall-service；接入稳定账本、override、指纹失效、双预算及有界访问增强。
5. 在停用旧数据读取及切换 Profile 写入口前落实迁移，再切换 UI：以稳定 legacyId/事件身份建立幂等迁移映射，保留原 ID、来源、审核状态、版本链和 TTL；无法证明人工来源的旧 Profile 文本进入待核验材料，不批量升格可信。迁移可断点续跑、有备份和回退读取方案；不靠长期双写维持一致性。
6. 接入设置、工程/个人 Inbox、画像和诊断信息，完成跨域、失败恢复、Wiki 来源与打包回归。扩展到已发布向量后端、个性化微调、团队 publish、新数据库和独立记忆服务器均需后续范围，不在本次默认依赖内。

源码审阅期间实际运行 Laya 的 `python tests/test_lang_guess.py`（93 passed）和 `python tests/test_blank_lang_routing.py`（24 passed），均未加载权重。MaiBot 的 person_fact_verification、fact_ledger、person_profile_service、memory_lifecycle_policy 等测试，以及 A_memorix 的访问边界测试只作源码阅读；未宣称通过整套上游测试或真实模型评测。后续实现验证采用临时 JANUSX_KNOWLEDGE_ROOT，禁止触碰真实个人知识数据。

### 当前实施边界：统一写入、离线基线与评分门控

[memory-evidence](../../src/main/knowledge/memory-evidence.ts)提供统一的 scope 解析、证据字段校验和用户陈述资格判断。Observation 保存原工作区、scope、通道、发言者、会话、事件 ID、时间、原文片段与来源级别；确定性与 LLM 候选携带这些宿主证据，审核后的 MemoryFact 在 provenance 中保留证据链。来源级别区分 user-stated、model-generated、tool-observed、unverified，不代表真实性或审核通过。LLM 输出的 scope/provenance 不参与赋权；IPC payload 的同名字段也不参与来源核验。global 仅由主进程上下文显式指定，查询范围的 global 与内容归属无关。

Janus 聊天适配器按实际消息角色和请求 ID 记录来源，同一会话的 loop capture 与结束 capture 使用相同会话身份。不同真实轮次的相同内容保留独立事件，同事件重试、重启或月份切换不重复追加观察。同一轮关联多个项目仍只贡献一次习惯频次。Habit 读取当前 batch 和最近 200 条观察中的可核验用户表达，跨批次、跨项目形成 user 候选，保留工程观察与工程候选的 project 归属；近期窗口以外的历史不参与这次自动归纳。

确定性事实与 Habit 的候选身份稳定，追加与已有审核共用锁；相同证据重放不复活已拒绝或已应用的候选，证据集合无新增时不增强频次或强度。旧 Observation/MemoryFact 缺少新增字段仍可读取，旧 user 哨兵仍按个人记忆过滤，其余缺省按 project；旧 actor/source 标签不自动升格为已核验用户来源。

第二片中，`user-memory.save` 先落带 `memoryIntent: remember` 的 user Observation，返回 `status: queued` 和 observation 引用，再由已有队列生成稳定 ID 的候选。一次明确保存即足够，不要求关键词或三次重复；返回 queued 不表示审核通过或已经进入长期事实。工具文本来源为 tool、发言者为 assistant、级别为 model-generated，不能伪装成用户原话。意图和来源只由宿主上下文赋予，payload/metadata 同名字段不参与赋权；工具运行上下文目前没有会话或调用事件 ID，因此该入口采用内容去重，不宣称能区分每次同文确认。

新 Episode 是带 `expiresAt`、`episodeStatus` 的 user Observation：个人聊天的用户原文与近期记录共用一份观察，助手回复另存且不作为该 Episode 的本人证据；带工程工作区的聊天也按 session/request 身份保存个人近期记录。原文经脱敏后完整保存，近期展示投影最多 4000 字符。旧 `episodes/*.jsonl` 保留原 ID、状态与 TTL 并继续读取，新内容不再双写旧目录；这属于兼容切换，尚未完成旧文件物理迁移。

Episode 的新存储过期与遗忘复用 Observation 写锁，覆盖活动分片及 gzip 归档，兼容层继续处理旧 Episode。召回按查询时钟过滤 TTL，即使 BM25 缓存未重建也不交付到期事件；队列、规则提取、Habit 和 LLM 输入排除已失效观察。带原事件身份的重试不会复活已遗忘 Episode。候选写入统一经 `proposeFactCandidates`，与审核共享锁；已写候选但游标未推进时可重试且不重复提案，损坏的候选文件报错保留原文。LLM 合并在锁内重读候选，不能覆盖期间已完成的批准或拒绝。

确定性提取器不再应用 truth，旧 `autoAcceptDeterministicFacts` 即使为 true 也归一为 false，旧 auto-policy 调用被拒绝，设置面板移除失效开关。缺省模式为 deterministic-only；已有 auto/llm-preferred 配置只允许通过评分门控的按需精修。设置选项显示“按需精修”及“按需精修（优先采用精修结果）”。显式记忆已由规则保留全文，不再送入 LLM；无合格证据返回正常 skip。

[decision-scorer](../../src/main/knowledge/decision-scorer.ts)定义宿主 DecisionScorer 接口、NoopScorer 与有界调用。六类问题为 retention、kind、support、duplicate、supersede、conflict；宿主检查唯一题目、完整选项、概率有限性、归一和、所选答案概率及 noul 方向。缺题、选项折叠、版本不符、异常或超时均回到人工审核；通用 scorer 默认 2 秒，真实 CPU Laya 为 30 秒。每份候选注解保留 provider/modelRevision、模板与校准标识、输入及候选 hash、原文字符范围、相关事实 ID 和截断标志。kind 概率不修改事实 confidence，评分不改变归属、来源、supersedes 或审核状态。

[decision-stage](../../src/main/knowledge/decision-stage.ts)通过已有队列的精修阶段运行，最多评估每批 20 个确定性事实候选。先按 scope 和 owner 过滤 active truth，再在最多 200 条同域事实中用 BM25 取前 5 条相关记录；候选证据最多 8 条、每条 6000 字符、总计 12000 字符，相关事实正文每条最多 2000 字符。缺证据、证据失效、归属不合法或上下文超限时保留人工审核，不对截断片段作完整支持度判断。读取仍复用现有全库文件扫描，这些上限限制评分输入，不代表磁盘读取成本已经有界。

完整且有效的评分中，各问题答案一致且所选概率至少为 0.9 时直接留待审核；不一致或不确定才建议精修。0.9 是跳过精修的初始策略阈值，不是校准结果或自动接受门槛；所有结果仍需人工审核。生产注册可选 Laya scorer，默认关闭；运行时未 ready、设置不允许或没有默认 LLM 时不执行自动精炼。普通单元测试使用替身，独立真实进程测试和上述固定样例报告才构成实际 Laya 推理证据。

评分落盘前重新核对证据有效性、同域事实集合和 scorer 身份；候选注解在审核锁内按候选 hash 写入，避免覆盖期间的批准、拒绝或内容修改。注解额外记录证据正文/来源 hash 与同域事实内容指纹，访问次数、强度及 lastSeenAt 不参与内容指纹。已通过本批评分门控的候选全部进入精修规划，60000 字符预算移到任务执行时计算，超出预算的任务保留到下次执行；超过本批 20 个评分名额的候选仍留待人工审核。

[refinement-tasks](../../src/main/knowledge/refinement-tasks.ts)以版本化 `processing/refinement-tasks.json` 保存任务，只存候选及证据引用、hash、scorer 身份和运行状态，不复制原文或保存供应商异常正文。任务 ID 绑定 scope、owner、候选快照、评分输入和同域内容指纹，同一任务并发入队或进程重启不会重复创建。状态为 pending、running、succeeded、cancelled、failed；写入采用原子替换，同进程的写入与执行共用串行锁，诊断通过原子文件快照读取，不等待模型调用结束。

队列先持久化任务再推进观察游标；规划或任务写入失败时保留游标，确定性产物仍在原处且可幂等重放。模型调用使用独立任务入口，在启动、已有 processNow 操作及每分钟恢复检查时执行，不依赖新的观察。恢复定时器不会在前一次检查仍等待时积累重复请求。每次恢复最多调用 20 个任务、交付 60000 字符，每个任务绑定单个候选和它的完整证据；关闭知识处理或缺少默认 LLM 时保持等待，不增加尝试次数。自动任务额外要求精炼开关和 scorer 就绪；人工任务以显式提交意图为依据。

执行前核对候选审核状态、正文版本、证据有效性、归属、同域事实内容及 scorer 版本；候选已修改、批准、拒绝，证据过期/遗忘/不可读，或有效 scorer 版本变化时取消旧任务。模型调用前、返回后及候选写锁内继续检查候选快照，只合并仍有效的目标，不追加模型顺带生成的其他事实、Wiki 或图谱。精修后删除旧评分注解；如果候选已提交而任务完成状态尚未写入，重启会识别失效快照并取消旧任务，不再调用模型。

任务调用关闭提取器内部重试，由任务账本统一控制最多 3 次尝试，失败后分别等待 1、2 分钟；最终失败不会被同一计划重新入队而隐式复活。崩溃留下的 running 任务同样受总尝试上限约束。任务成功只表示本次精修已处理，不表示事实已获批准。已有 processingStats 返回按任务状态划分的 refinement 计数及下次重试时间；旧 llm 阶段计数保留为规划结果。任务文件结构错误会明确失败并保留原字节，不按空文件覆盖恢复。

AC-5 的规则加 BM25、人工审核离线基线已验证；AC-1、AC-3、AC-4、AC-6、AC-10 尚未全部完成。历史审核资格自动恢复、单值画像槽位、第三人称/临时表述语义核验、外部终端 Agent 用户行为归因、人工精修/最终失败重试入口、相似习惯候选持续合并、真实 Laya 及完整生命周期仍按后续步骤实施。Episode 失效尚不级联撤销已生成候选或长期事实；任务执行前的失效检查也不构成覆盖整个模型调用期间的跨存储遗忘事务。统一遗忘屏障属于后续账本撤回与 Profile 失效工作，不能将当前 Episode 遗忘描述为全链路删除。新来源进入已确认画像仍须 Inbox 审核。

机器验证（2026-09-28，持久化精炼任务与恢复）：`npx vitest run tests/unit/knowledge tests/unit/agent/user-memory-tools.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts` 通过 50 个文件、422 项测试。[refinement-tasks.test.ts](../../tests/unit/knowledge/refinement-tasks.test.ts)的 20 项测试覆盖并发去重、不复制原文、重启恢复与退避、执行条件不足时延后、候选及来源变更取消、候选提交后崩溃恢复、预算溢出续跑、最多三次尝试、损坏账本保留、持久化失败后的游标重试及执行中状态读取；[processing-queue.test.ts](../../tests/unit/knowledge/processing-queue.test.ts)的 17 项测试包含规划持久化失败不推进游标、定时器合并与销毁。评分门控、精修期间人工审核保护、证据归属、统一写入及 MCP 回归继续通过。`npm run typecheck:strict-unused`、9 个生产 TypeScript 文件的定向 `npx eslint`、`npm run check:package-boundary` 与本片文件的 `git diff --check` 通过。未运行桌面打包/E2E 或真实 Laya 权重测试。

机器验证（2026-09-28，统一审核界面）：`npx vitest run tests/unit/knowledge tests/unit/right-tool-state.test.ts tests/unit/right-tool-dock.test.ts tests/unit/knowledge-note-ui.test.ts tests/unit/memory-review-ui.test.ts` 覆盖 51 个文件、436 项测试，435 项通过；truth-service 的一项测试在清理临时 audit 目录时遇到 ENOTEMPTY，随后单独运行该文件的 4 项测试全部通过，未修改其测试或生产代码。[memory-review-ui.test.ts](../../tests/unit/memory-review-ui.test.ts)用真实无头 Chromium 验证筛选、批准/拒绝、提交禁用、失败保留与刷新恢复；[memory-review-tool.test.ts](../../tests/unit/knowledge/memory-review-tool.test.ts)的 4 项测试验证来源项目、原文转义、私有归属、独立计数与读取失败。`npm run typecheck:strict-unused`、`npm run i18n:check`、`npm run check:package-boundary` 通过；8 个生产 TypeScript 文件的定向 ESLint 零错误，保留 KnowledgeWorkbench 原有 refresh 依赖警告。未运行完整 Electron 桌面 E2E、打包或真实 Laya 模型验证。

Note 全库检查未通过：`npm run check:notes` 缺少本地 yaml 依赖；通过临时 Node loader 解析到已安装的 `../janus-agentX/node_modules/yaml` 后执行原检查器，检查 207 篇 Harness Note，本篇零错误，但既有 `2026-09-28-debug-mode-plan--1645e12c.md` 缺少 Proposal、Risks 两节。没有修改该无关草稿，也没有将全库失败记为通过。测试均使用临时知识根目录，未改写真实知识数据。

[Profile 投影](../../src/main/knowledge/profile-projection.ts)只使用 active、未到期且带有效人工确认记录的 user 事实。审核服务在事实落库时生成 human-review 确认记录，绑定正文、归属、事实版本、类型、替代目标、TTL 和来源证据；模型不能通过候选字段授予确认资格。正文或来源改动后必须重新确认，访问强度与 lastSeenAt 不改变确认 hash。工程会话产生的个人习惯经审核后参与投影，普通工程事实仍由 Janus 的工程上下文通道读取，不直接成为个人画像。

`profile/snapshot.json` 是派生快照，包含已确认事实及来源 hash、人工字段、规则版本、内容指纹、版本与 5 分钟 TTL。每次读取都重新核对事实与 override，不等待 TTL 才发现撤回、到期或同 ID 内容变化。源内容不变时版本与 updatedAt 不变，TTL 到期只续期；快照正文不作为权威输入，内容偏差可从事实重建。结构损坏则报错保留文件，不用空画像覆盖。当前采用全事实扫描与整文件原子写，同进程共享队列；没有跨事实审核、遗忘、override、审计的统一事务，也没有跨进程锁。并发事实变更在后续读取中可见，不宣称已经撤销正在生成的聊天上下文。

人工身份及格式/工具偏好通过已有宿主 save 方法写入独立的 `profile/overrides.json`，限制字段与长度并记录审计；审计失败时恢复原 override。后台投影不能覆盖该文件，移除 override 不删除底层事实。未使用的 recordHabitVersion 直接写入口移除，habitVersions 随确认事实派生。override 已持久化但快照写入失败时调用会报错，后续读取仍可据 override 重建；完整跨文件崩溃事务尚未实现。人工编辑 UI、按语义单值槽位消解 override 与自由文本事实冲突仍待实现，当前召回明确标注人工字段优先。

旧 `profile/profile.json` 保留原字节，不自动当作人工 override；没有确认记录的旧个人 truth 保持可读，但不进入生产个人召回的稳定事实集。历史 candidate_approved/candidate_applied 审计没有绑定被审核的正文 hash，旧 actor 或 active 状态也不能证明当前内容仍是当时确认的版本，因此选择人工重新确认，不自动恢复历史资格。直接把旧 profile 当 override 可以保留原体验，代价是无法证明其来源；按既有审计自动补确认记录可减少操作，但在缺少内容绑定时仍可能错误升格。现有 overview 仍可展示旧事实，并标明尚未确认、不用于稳定画像；尚未增加独立 uncertain 分栏。

[旧资料导入](../../src/main/knowledge/legacy-memory-migration.ts)由右侧审核栏的“导入旧个人资料待确认”调用专用 IPC；不向工程 MCP 或 Agent 工具提供迁移写入口。支持现有 truth 读取器能识别的 active、未到期且未有效确认的个人事实，以及旧 profile 的 identity、formatPrefs、toolPrefs。导入只创建候选，每次最多 100 条新增候选，显示新增数量与剩余可导入数量；批次上限限制写入量，源扫描仍是全文件。旧 profile 字段按字段名与原值去重，未知字段不推断用途，不复制成画像偏好。

[迁移来源绑定](../../src/main/knowledge/legacy-memory-source.ts)以种类、来源 ID、正文/版本/证据 hash 生成稳定候选 ID，已有 proposed/applied/rejected ID 都不重复创建。候选账本承担迁移进度，不另设平行状态表；候选新增使用原子替换，重启后重新导入可跳过已生成条目。拒绝或遗忘后，同一旧 profile 原值不能经重复导入复活；来源改变时生成新的待确认候选，旧候选保留供用户拒绝。源 JSON 或候选 JSONL 损坏时明确失败并保留原字节；旧事实的结构兼容仍受现有 truth schema 约束，不将不认识的结构猜测成有效事实。

批准迁移候选前在事实候选写锁中核对源内容、有效性、候选正文与归属；事实撤回共用该锁，失效或已撤回的旧来源不能被迁移批准。旧事实确认通过现有 supersedes 事务归档原事实，生成连续版本的新个人事实与确认记录；旧 profile 字段则生成独立个人事实，不改写旧 profile。源不存在、源已变化或绑定丢失时拒绝批准，界面提示刷新、拒绝旧候选并重新导入。迁移候选不进入自动评分精修，用户审核的是被绑定的源内容。事实候选的批准和拒绝也严格读取 JSONL，避免覆盖其中损坏的行。

该路径保证保守重新确认与候选级续跑，不保证审核、truth 和 audit 多文件的崩溃事务。进程在事实提交后、候选或审计提交前退出仍可能留下待人工核对的中间状态；失效来源检查会阻止重复批准，不声称所有中间状态都自动恢复。旧 profile 单值字段改变后仍是新候选，不自动判定其替代哪条已确认事实；单值槽位与冲突处理继续作为独立后续工作。没有运行用户真实数据迁移，也没有自动批准历史资料。

个人召回按人工字段、已确认 preference、其他已确认事实的稳定次序预留最多 3 条，与 BM25 top-k 分离；其余画像材料及有效 Episode 继续按查询检索，共用既有个人条数/字符预算。已进入快照的事实不会再从旧事实检索路径重复注入；超长条目被跳过且标记截断，不阻断后续可容纳条目。事实行保留 fact/observation 引用及 supersedes，近期 Episode 不写入长期画像。工程召回与 MCP 权限过滤保持原路径。完整画像验收 AC-1、AC-3、AC-9、AC-10 仍未完成。

机器验证（2026-09-28，Profile 派生快照）：`npx vitest run tests/unit/knowledge tests/unit/agent/user-memory-tools.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts` 通过 52 个文件、438 项测试。[profile-projection.test.ts](../../tests/unit/knowledge/profile-projection.test.ts)的 12 项测试覆盖人工确认与域过滤、同 ID 修改、来源变更、撤回、TTL、仅排名变化、重启、并发 override、审计失败回滚、旧文件保留、损坏文件保留、缓存正文重建及稳定条目/溢出召回预算。既有人工审核→个人召回、MCP 隔离与替代链回归通过。运行中既有 schema_violation 异步审计在临时目录清理时报告一次 EPERM，未导致测试失败；不据此声称跨存储审计事务已经完整。`npm run typecheck:strict-unused`、6 个生产 TypeScript 文件定向 ESLint、`npm run check:package-boundary` 通过；未运行 Electron 桌面 E2E、打包、真实 Laya 或旧数据迁移演练。

机器验证（2026-09-28，旧个人资料重新确认迁移）：`npx vitest run tests/unit/knowledge tests/unit/knowledge-ipc-contract.test.ts tests/unit/memory-review-ui.test.ts tests/unit/agent/user-memory-tools.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts` 通过 54 个文件、453 项测试。[legacy-memory-migration.test.ts](../../tests/unit/knowledge/legacy-memory-migration.test.ts)的 12 项测试覆盖仅提案、私有归属、原文件保留、替代版本、并发导入去重、拒绝/遗忘不复活、源变更与撤回、分批续跑、损坏文件保留及审计失败回滚。失效来源提示调整后，IPC 与真实无头 Chromium 的审核交互测试 10 项复跑通过，验证导入不批准、领域筛选、显式批准及失败恢复提示。`npm run typecheck:strict-unused`、`npm run i18n:check`、`npm run check:package-boundary`、11 个生产 TypeScript 文件定向 ESLint 通过。未运行完整 Electron 桌面 E2E、打包或真实旧数据迁移。

### 已选个人记忆的显式纠正

[个人记忆纠正](../../src/main/knowledge/personal-memory-correction.ts)通过专用 IPC 接收选中事实的 ID、显示时的内容 hash 和新正文，限制正文长度并脱敏。来源必须是唯一、active、未到期的 user 事实；工程事实不能通过此入口改为个人偏好。提交只生成统一审核候选，不改变当前事实或派生画像；相同目标版本与正文生成同一候选 ID，已拒绝请求不会因重复提交恢复待审。该入口不向工程 MCP 或 Agent 写工具开放。

[纠正来源约束](../../src/main/knowledge/personal-correction-source.ts)绑定目标内容、版本、归属与证据 hash，批准前在既有事实候选锁内重新核对。候选记录人工提交的新正文，不将旧 observation 或原文证据冒充新陈述的依据；人工批准生成确认记录，并经 supersedes 归档旧事实、延续版本链。目标发生同版本内容修改、撤回、到期或已被其他纠正替代时，旧候选不能获批。多个候选可同时保留，先批准的有效纠正使其余旧目标候选失效，失效项仍供用户查看和拒绝。

[画像界面](../../src/renderer/src/components/knowledge/UserPersonaTool.tsx)提供逐条纠正入口，显示未确认旧事实的资格状态；激活或手动刷新时重读来源。编辑草稿在切换栏目和提交失败时保留，提交期间禁用重复操作，关闭工具后迟到的提交响应不重新打开审核。[统一审核卡片](../../src/renderer/src/components/knowledge/MemoryReviewTool.tsx)显示旧正文、新正文及同目标竞争纠正数，来源失效时提示刷新并针对当前版本重新纠正。

直接修改事实可以减少一次操作，但会绕过确认记录与版本链；用相似度自动定位替代对象可以省去选择，却无法可靠区分反转、补充与不同语义槽位。因此此入口只纠正用户明确选中的事实。人工 overrides 编辑器、自由文本单值槽位推断、自动冲突消解及完整遗忘事务仍待实现；已有 truth、candidate、audit 普通失败回滚不等于跨文件崩溃事务。AC-1、AC-2、AC-3、AC-9、AC-10 保持未完成。

机器验证（2026-09-28，个人记忆显式纠正）：`npx vitest run tests/unit/knowledge tests/unit/knowledge-ipc-contract.test.ts tests/unit/memory-review-ui.test.ts tests/unit/personal-memory-correction-ui.test.ts tests/unit/agent/user-memory-tools.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts` 通过 56 个文件、465 项测试。其中 [personal-memory-correction.test.ts](../../tests/unit/knowledge/personal-memory-correction.test.ts)的 8 项测试覆盖幂等提案、来源变化、版本替代、竞争纠正、候选篡改、损坏文件保留及审计失败回滚；[personal-memory-correction-ui.test.ts](../../tests/unit/personal-memory-correction-ui.test.ts)的 3 项真实无头 Chromium 测试覆盖草稿、刷新、重复提交与关闭后的异步响应。既有 user-memory-contract 测试在临时目录清理期间输出一次 schema_violation 审计 EPERM，测试仍通过。`npm run typecheck:strict-unused` 通过；17 个生产 TypeScript 文件定向 ESLint 零错误，保留 KnowledgeWorkbench 原有 refresh 依赖警告；`npm run i18n:check` 与 `npm run check:package-boundary` 通过。未运行完整 Electron E2E、桌面打包、真实个人数据操作或 Laya 权重验证。

### 个人记忆的持久遗忘

[个人事实遗忘](../../src/main/knowledge/personal-memory-forgetting.ts)由画像卡片的“遗忘这条记忆”进入确认页，通过专用 IPC 提交事实 ID 与显示内容 hash。宿主要求唯一、active、未到期的 user 事实，并重新核对 hash；工程事实和调用方附加的归属字段不能进入该操作。确认页说明历史版本、相同来源的个人派生记忆及相关候选会一并停止使用，提交期间禁用重复操作，失败后保留重试入口，成功后刷新画像。

[持久遗忘约束](../../src/main/knowledge/personal-forgetting-barrier.ts)以 `profile/forgotten.json` 为权威生命周期记录，在事实审核共用锁内原子替换。记录保存操作时间、目标内容指纹，以及事实、候选、来源 observation 和正文的 hash，不复制正文或原始来源 ID；这些指纹不构成匿名化承诺。显式版本链双向追溯，并递归纳入共享来源的个人事实及关联候选，避免旧版本、候选独有证据或迟到任务重建已遗忘内容。共享来源可能承载多条个人陈述，因此采用保守的来源级停用，确认页明确这一范围；project 来源和工程事实本身保持可读。

权威记录与最小操作凭据在同一次文件替换中提交，不依赖 truth、candidate、task、audit 多文件写入成功才能生效。提交失败时原记忆仍可使用；提交成功但响应丢失时，重试按目标 ID hash 与内容 hash 返回成功，不新增记录。没有遗忘记录时保持原路径；记录损坏时明确报错并保留文件，不能当成空记录继续召回。该文件必须随个人记忆保留和备份，不能从原始事实重建或作为缓存删除。原子替换保证进程退出后的旧版或新版可读，不承诺断电 fsync、跨进程锁或多设备同步。

truth 读取、Profile 投影、近期记忆、治理检索和个人召回都核对遗忘记录。正文完全相同的人工 override 在投影时抑制，原 override 文件保留；旧 profile 导入也不能重新生成同值候选。候选读取将关联 proposed 条目视为 rejected，候选新增、评分注解和人工批准受同一约束；精修合并在原审核锁中重读有效候选，不能由模型迟到响应恢复。任务读取和统计立即呈现 cancelled，后续任务写入持久化取消状态；运行中的模型请求可继续返回，但不能恢复候选资格。治理检索将遗忘记录纳入索引键并在使用缓存后再次过滤，个人召回若跨越遗忘提交则丢弃本次上下文。已经交付给模型或显示在会话历史中的内容不会被追回。

只归档原事实的实现简单，但无法阻止候选、旧 profile 和旧证据重放；逐个物理删除来源可以减少磁盘残留，但会破坏共享工程证据且需要跨存储恢复协议。因此采用持久生命周期记录与读写约束。此次是逻辑遗忘，原事实、原始会话、候选历史及旧审计文件仍保留。相同正文将持续被禁止进入个人记忆，没有恢复或重新授权入口；不同措辞、全新无关联来源的语义同义内容不在精确识别保证内。当前画像最多展示既有 overview 限额内的事实，未增加全库分页。独立 Episode 和 `user-memory.forget` 查询式工具已共用该记录；物理清除、人工字段独立遗忘和语义级恢复仍待收拢，AC-3、AC-9、AC-10 不据此勾选完成。

机器验证（2026-09-29，已选个人事实遗忘）：`npx vitest run tests/unit/knowledge tests/unit/knowledge-ipc-contract.test.ts tests/unit/memory-review-ui.test.ts tests/unit/personal-memory-correction-ui.test.ts tests/unit/agent/user-memory-tools.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts` 通过 57 个文件、476 项测试。[personal-memory-forgetting.test.ts](../../tests/unit/knowledge/personal-memory-forgetting.test.ts)的 9 项测试覆盖域隔离、版本与证据追溯、候选重放、旧资料导入、重复请求、写入失败、提交后响应丢失、损坏文件保留、热索引与召回并发；[refinement-tasks.test.ts](../../tests/unit/knowledge/refinement-tasks.test.ts)增加运行中遗忘和新服务实例恢复测试；[界面测试](../../tests/unit/personal-memory-correction-ui.test.ts)的 4 项真实无头 Chromium 测试包含遗忘确认、失败重试、提交禁用和刷新。首轮回归发现空遗忘记录影响旧精简候选统计，修复后全量复跑通过。最终回归中既有 user-memory-tools 测试输出一次临时审计目录 EPERM，未导致测试失败。`npm run typecheck:strict-unused`、18 个生产 TypeScript 文件定向 ESLint、`npm run i18n:check` 与 `npm run check:package-boundary` 通过。未运行完整 Electron E2E、桌面打包、真实个人数据遗忘、断电或 Laya 权重验证。

近期事件的画像卡片提供独立遗忘入口，沿用同一确认页和 IPC，以 `kind: episode` 区分事实。宿主根据正文、来源引用、创建时间、到期时间、状态及标签计算 hash；来源变化、到期、缺失或同 ID 多条记录时拒绝操作。遗忘 episode 的 ID 与来源也进入同一约束，已从它派生的个人事实、候选和任务不能继续使用；读取工程来源不因此受到删除。

[聊天遗忘工具](../../src/main/agent/runtime/tools/user-memory-tools.ts)继续要求 delete 审批和 `confirm:true`，由宿主统一校验查询长度、实质词语匹配及过宽请求。它直接扫描当前有效个人事实与全部有效近期事件，在同一事实审核锁内生成一次遗忘记录；无需依赖 BM25 排名或近期召回的 200 条上限。读取事实或事件来源失败时整次失败，不逐条提交部分结果。重复查询按实际匹配的 ID 与内容 hash 去重，源集合变化则成为新的显式请求；不把查询字符串保存成禁止未来新内容的语义规则。返回的 archivedFactIds、expiredEpisodeIds 保留旧调用字段兼容，`mode: logical` 表示实际动作是持久停止使用，原始文件状态并未被物理归档或删除。

[事件源读取](../../src/main/knowledge/user-episode-service.ts)为遗忘提供不限召回数量的视图；[观察读取器](../../src/main/knowledge/observation-service.ts)增加显式严格读取选项。遗忘读取 active 分片、压缩归档和旧 episode 文件时，JSON、schema、解压或 I/O 错误都不能被解释为空记录；其他已有读取者保持兼容模式。该扫描仍是全量，包含工程 observation 的损坏分片也可能阻止本次个人遗忘；这是防止漏读来源的保守代价。query 仅选择有效事实与近期事件，不单独选择只有候选或只有人工 override 的内容；显式重新授权、已到期事件的独立管理和全库分页仍需后续界面。

机器验证（2026-09-29，聊天与近期事件统一遗忘）：`npx vitest run tests/unit/knowledge tests/unit/knowledge-ipc-contract.test.ts tests/unit/memory-review-ui.test.ts tests/unit/personal-memory-correction-ui.test.ts tests/unit/agent/user-memory-tools.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts` 通过 57 个文件、481 项测试；补充损坏 observation 分片反例后，`npx vitest run tests/unit/knowledge/personal-memory-forgetting.test.ts` 的 14 项全部通过。新增覆盖独立 episode 指纹、原子查询提交与重试、205 条历史事件、宽泛查询拒绝、损坏来源保留，以及真实无头 Chromium 中 episode 类型和 hash 的传递。11 个生产 TypeScript 文件定向 ESLint、`npm run i18n:check`、`npm run check:package-boundary` 通过。`npm run typecheck:strict-unused` 未通过，唯一报告为工作区无关的 `src/main/notifications/agent-hook-config.ts:183`、`:184` 两个未使用常量；未修改该文件，也不把严格检查记为通过。未运行完整 Electron E2E、桌面打包或真实个人数据遗忘。

### Laya 接入与精炼验收（2026-09-29）

`npx vitest run tests/unit/knowledge tests/unit/knowledge-ipc-contract.test.ts tests/unit/memory-review-ui.test.ts tests/unit/personal-memory-correction-ui.test.ts tests/unit/agent/user-memory-tools.test.ts tests/unit/laya-settings-ui.test.ts tests/unit/package-boundary.test.ts` 通过 59 个文件、497 项测试；真实模型用例在普通回归中显式跳过。设置 `JANUSX_LAYA_PYTHON` 和 `JANUSX_LAYA_MODEL` 后单独执行 `npx vitest run tests/unit/knowledge/laya-real.test.ts` 通过，覆盖真实 Python 预热、宿主六题校验以及连续两次启动。`python -m unittest discover -s tests/laya -v` 通过 9 项，覆盖概率、摘要、SDK 配置写入隔离与评估指标。设置页补充父组件保存期间取消预热的 Chromium 验收，最终单独复跑通过。

严格未使用检查、生产构建、20 个改动生产文件定向 ESLint、双语键检查和 package-boundary 检查通过。执行项目既有 `npm run prepackage` 后，本地依赖以可打包目录安装，`exclusions:check` 的 416 项排除与生产闭包一致，未修改依赖声明或锁文件。Note 检查中本文零错误，全仓库仍由 debug-mode-plan Note 缺少 Proposal/Risks 两节而失败。

Windows 解包验证使用构建快照，避免运行中的开发服务改写 out 目录；临时配置仅将 out 输入替换为固定快照，保留原打包规则。`npx electron-builder --win --dir --config=artifacts/laya-package-config.json` 成功生成 `artifacts/laya-package-check/win-unpacked`。`node scripts/check-laya-package.mjs artifacts/laya-package-check/win-unpacked` 验证三份适配文件与源文件摘要一致，asar 不包含 Laya 源目录、模型权重或 Python/torch 环境。将 `JANUSX_LAYA_RESOURCES` 指向产物的 resources/laya 后，真实进程测试连续两次启动及六题评分通过。未生成 NSIS/便携安装包，也未运行完整 Electron 桌面 E2E。

第一阶段的运行时接入及 Windows 解包验收完成，第二阶段的人工/自动精炼代码路径可用，真实模型质量验收未通过。第二阶段仍需真实脱敏标注、独立留出与按题目/语言确定质量门槛。未调用真实外部 LLM、未操作真实用户记忆，也未声称 AC-8 或整项重构完成。

个人访问生命周期机器验证（2026-09-29）：`npx vitest run tests/unit/knowledge tests/unit/knowledge-ipc-contract.test.ts tests/unit/memory-review-ui.test.ts tests/unit/personal-memory-correction-ui.test.ts tests/unit/knowledge-note-sources.test.ts tests/unit/knowledge-note-ui.test.ts tests/unit/note-wiki.test.ts tests/unit/agent/user-memory-tools.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts` 通过 62 个测试文件、568 项测试，真实 Laya 用例显式跳过。新增 `memory-access.test.ts` 的 17 项覆盖锚点、持久化去重、冷却、画像不变、失效/遗忘/取消、损坏与写失败、预算裁剪、工具返回和流消费。补充生产聊天入口测试后，`npx vitest run tests/unit/llm/chat-turn-guard.test.ts` 的 11 项通过，覆盖个人成功输出、工程隔离与输出前失败。严格未使用类型检查、12 个生产文件定向 ESLint、双语键检查与 package-boundary 通过。全库 Note 检查仍有三项无关错误：debug-mode-plan 缺少 Proposal/Risks，worktree-composer-entry-motion 的 scope/reason 位置非法。未运行本切片的 Electron E2E、生产构建、真实模型与真实个人数据验证。

撤回与精修任务失效机器验证（2026-09-29）：`npx vitest run tests/unit/knowledge tests/unit/knowledge-ipc-contract.test.ts tests/unit/memory-review-ui.test.ts tests/unit/personal-memory-correction-ui.test.ts tests/unit/agent/user-memory-tools.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts` 通过 61 个测试文件、577 项测试，真实 Laya 用例显式跳过。`operations-service.test.ts` 的 11 项覆盖跨 workspace 同 ID、归属内重复 ID、损坏事实/图边保留和审核锁竞争；`refinement-tasks.test.ts` 的 40 项包含真实撤回到取消落盘、停用期间视图失效、来源读取错误保留和运行中拒绝的提交阻断。最终撤回模块定向复跑 11 项通过。严格未使用类型检查及三个生产文件 ESLint 通过；全库 Note 检查仍由上述三项无关错误失败。未运行本切片的生产构建、Electron E2E、真实模型或真实数据操作。

工程事实交付强度机器验证（2026-09-29）：`npx vitest run tests/unit/knowledge tests/unit/knowledge-ipc-contract.test.ts tests/unit/memory-review-ui.test.ts tests/unit/personal-memory-correction-ui.test.ts tests/unit/knowledge-note-sources.test.ts tests/unit/knowledge-note-ui.test.ts tests/unit/note-wiki.test.ts tests/unit/agent/user-memory-tools.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts` 通过 62 个测试文件、585 项测试，真实 Laya 用例显式跳过。补充失效事实过滤和真实缓存更新后，`npx vitest run tests/unit/knowledge/memory-access.test.ts tests/unit/knowledge/recall-phase3.test.ts tests/unit/knowledge/recall-service.test.ts tests/unit/knowledge/context-service.test.ts` 的 48 项通过。覆盖工程回执的跨项目同 ID、私有域隔离、重复请求、归档拒绝、实际缓存更新，固定墙钟下的衰减/重启等价、TTL 缓存失效、预算裁剪，以及个人融合/工程聊天成功和输出前失败的真实接线。严格未使用类型检查、八个生产文件定向 ESLint 与 package-boundary 通过；全库 Note 检查仍有上述三项无关错误。未运行本切片的生产构建、Electron E2E、真实模型或真实数据操作。

## Alternatives considered

- 工程记忆沿用仅 BM25、可信度和新鲜度排序：成本最低，但实际访问无法参与排名。为工程域另建强度库可降低事实文件写入量，却引入第二份身份和恢复机制；采用同一 recallState 与写锁，工程回执额外绑定 workspace，并接受访问时重建现有文件指纹缓存的成本。

- 撤回时同步修改所有精修任务：能立即落盘取消，但现有任务锁覆盖模型调用，会使撤回等待供应商响应，并增加事实锁与任务锁的逆序风险。选择只读来源校验投影加调度持久化；保留读取与落盘之间的恢复窗口，不伪称跨文件事务。

- 只保留已有衰减函数而不连接交付：实现成本最低，但生产排名无法反映实际访问。定时写回强度能简化读取，却增加停机恢复、重复衰减和后台写入复杂度；个人事实采用只读锚点计算和交付时更新，承担整文件写入成本，工程生命周期另行验收。

- 直接引入 AgentMemory SDK 与 iii-engine：完整提供编码 Agent 接入、版本记忆、检索和运维能力。否决原因是其默认相似度替代和 legacy 通配不满足本仓审核与域隔离约束，且运行引擎会与现有 queue/review/storage 重叠；选择借鉴检索预筛、来源和版本设计。
- 整体引入 MaiBot/A_memorix 的 SQLite、向量池与关系检索：画像账本、证据、快照、生命周期实现完整。否决原因是已有事实存储与审核所有权会被复制，聊天实体与 namespace 服务不是当前工程域需求；许可与依赖也增加直接集成成本。保留其证据状态机与画像投影机制，自行实现。
- 让 Laya 直接决定 truth 或替换全部内容提取：可以省去 LLM 成本并缩短链路。否决原因是它只输出有限选项决策，不能产生有依据的新正文；任务概率不等于事实可信来源，多语 checkpoint 尚未完成 JanusX 校准。选择主决策分流加宿主核验和审核。
- 立即改为 Electron 内 ONNX：有望减少 Python 常驻成本。当前缺少已验证的多语图、JS 分词/推理协议实现与部署测量，会把内核重构绑到第二个推理实现；先使用受控单模型 sidecar，再按测量决定。
- 分叉个人和工程的存储、队列与审核：物理隔离容易理解，但会重复重试、证据、版本和生命周期逻辑。选择同内核、分域约束、分视图与分预算。
- Do nothing / reuse：保持当前规则加可选 LLM，避免迁移成本。代价是画像旁路、来源可信度缺口、默认精修策略与需求不符，强度计算无法闭环。

## Acceptance criteria

- [ ] AC-1: 单管线可达双域 — 一次调度能够结算合法 project/user 输入，分域游标与处理键不串域；Episode、个人保存和 Habit 候选进入统一入口，Profile 仅为派生视图；可归因到用户的工程陈述或行为可派生个人开发习惯，工程事实保持原归属，未归因工程内容不能直接升格为个人偏好。重试、跨批次与多项目转发不重复计数。
- [ ] AC-2: 工程事实闭环 — agent/checkpoint/git/tool/blueprint 来源可追溯；重复只合证据，相似度不直接替代，显式 supersedes 检查归属与当前版本；测试覆盖版本晋升、冲突、索引失效和退出默认召回，强度变弱不删除有效 truth。
- [ ] AC-3: 画像证据闭环 — 个人画像服务 Janus，可读取工程知识并归纳有本人证据的开发习惯；明确保存意图不受重复频次门槛限制。人工 override 与可信账本优先，模型推测进入 uncertain 且默认不注入稳定画像；来源可核验、同证据不增快照版本、撤回立即失效、私有数据不进入工程与 MCP 等共享面。
- [x] AC-4: Laya 为主决策分流 — ready 时输出 retention/kind/support/duplicate/supersede/conflict 注解，answer_confidence 与 noul 方向校验驱动快道或待精修；关闭、缺席、失联、超时、无效输出时用 NoopScorer 保留规则候选且不抛到聊天主链。兼容既有数据，不要求延续旧自动审核/自动 LLM 行为。
- [x] AC-5: 无 Laya 基线完整 — 无 key、无 sidecar 时规则加 BM25 仍能完成 capture→candidate→人工 review→truth→recall；全部新候选人工审核，原 autoAccept 设置不得绕过；没有默认 LLM 是正常状态。
- [x] AC-6: LLM 可选精修 — off 默认不自动调用；on-demand 仅在 Laya 标记、配置允许和预算充足时运行，人工触发也归 queue；超时、重试、字符预算及失败保留候选的语义可测试，精修结果重新核验。
- [x] AC-7: Laya 资源受控 — 安装包不包含权重与 Python/torch；模型按需下载、revision/hash 固定、只加载指定多语 checkpoint；预热推理未通过不能 ready，idle 卸载与缺席回退可观察；单纯 health=ok 不算就绪。
- [ ] AC-8: 决策质量可追溯 — 校准集与留出集按来源隔离，记录模型、题型、语言与模板版本的准确率、Brier、ECE、覆盖率和错误接受率；熵型 confidence、分类概率、act_probability、跨窗最大概率都不能冒充事实支持度。未达到已记录的审核策略质量门槛时自动接受保持关闭。
- [ ] AC-9: 生命周期与召回确定 — 墙钟衰减重复计算和停机恢复等价；只增强最终交付且去重后的记忆，受冷却与上限约束；Episode 到期、遗忘与撤回同步影响索引、Profile 和任务重放，双域预算不互相挤占。
- [ ] AC-10: 迁移与回归可复现 — 迁移可断点续跑、重复执行不重复数据、未知旧来源不升格；保持 Wiki sourceFactIds/sourceNoteRefs/hash/版本审核语义；相关 Vitest、typecheck、IPC/UI 与打包检查通过，真实 Laya 性能另有 Windows CPU 实测记录。
- [x] AC-11: 统一审核界面 — 右侧只有一个审核入口，支持全部、工程知识、个人记忆筛选及独立数量；复用候选详情与审核动作，清楚展示来源和批准用途；知识库与个人画像保留各自阅读视图，工程来源的个人习惯仍不进入 MCP 输出。
- [x] AC-12: 审核一致性与存储保护 — 三个审核入口携带显示快照 hash，主进程锁内核验批准与拒绝；过期快照不能变更候选，原快照成功重试幂等。损坏或不可读的候选、truth、Wiki 索引不得被空数据覆盖；Wiki/Graph 新增与审核回滚共用锁。
- [x] AC-13: 明确单值事实的冲突审核 — 同 ID 不覆盖 truth；发布命令与默认输出语言按同域、值和极性分组，近似文本不吞掉不同参数；替代展示旧值并要求人工确认，提交绑定旧事实指纹，竞争替代最多成功一次，审计失败可回滚；跨所有者、失效及多目标情况不允许直接批准。
- [x] AC-14: 个人事实访问强度 — 锚点衰减可重复计算，只有最终交付的有效个人事实可增强；持久化请求去重、水位、10 分钟冷却与上限生效；访问不改变事实证据、确认或画像版本，损坏存储与失败写入不丢失原数据。此项不代替 AC-9 的工程域、任务级联撤回及完整生命周期验收。
- [x] AC-15: 撤回与精修任务失效 — 事实撤回按归属定位并保护损坏存储，图边撤回与审核串行；待处理和运行中任务的视图立即反映候选、证据及有效上下文失效，下次调度持久化取消；模型提交重新检查候选审核状态，不将已拒绝候选记为精修成功。
- [x] AC-16: 工程事实的 Janus 交付强度 — 直接交付的工程事实按 workspace 与快照绑定增强，复用衰减、冷却、去重与上限；缓存命中仍按当前时间衰减和过滤到期事实，访问落盘影响后续排名，私有事实与跨项目同 ID 不串写。普通搜索保持只读，Wiki/图边不按引用增强，不据强度归档或删除 truth。

## Risks

来源核验与审核状态会增加数据字段和迁移成本，但它们分别回答“谁说的、证据是否匹配、是否允许采纳”，不能合并成一个 confidence。人工确认只能证明采纳意图，不能保证陈述永远正确；后续冲突仍须暴露。

事件重试检查复用现有观察分片，跨月恢复需要扫描历史；Habit 的最近 200 条候选窗口不等于底层读取成本上限。大历史库需要测量采集延迟后再引入可重建事件索引，避免当前切片增加第二份持久状态。来源核验目前只证明发言归因，不证明“这是长期偏好”；第三人称转述、临时要求、否定与反转仍依赖人工审核及后续语义核验。

单值槽位的语义归一化可能漏检或误合并。首期只对可明确定位的结构化事实采用槽位约束，其余内容保留独立事实与冲突提示。BM25 无法保证语义召回全面，不能因没有近邻就自动接受高风险变化。

Laya 多语模型的任务质量和校准仍需本地样本证明；温度拟合不能修复错误分类，长文和跨语言表现也不能由一个总 ECE 覆盖。sidecar 的冷启动、环境安装、驻留内存与用户设备差异是实际维护成本；NoopScorer 和人工审核必须长期作为受支持路径。

画像必须能在来源失效时及时重建，同时保留 override。缓存指纹遗漏依赖会保留过期偏好，加入访问分数又会引发无意义重建；以来源内容版本、生成规则和人工变更为依据，并用撤回、遗忘、同 ID 内容变化和仅排名变化的反例验收。

统一写链最易在迁移期间因重放、旧工具直写或习惯跨批次聚合重复积累。上线切换必须有明确的写入所有者、幂等映射和恢复点；模型不可用不能阻塞规则结算，模型恢复也不能把旧候选自动重放成已接受事实。

Episode 兼容期的新观察分片与旧文件分别持锁，不构成跨文件事务；部分失败需重试完成剩余过期处理。当前测试证明普通重试不会恢复同一原事件，但不覆盖已派生候选、长期事实或运行中精修的级联撤回。缺少调用事件 ID 的显式保存只能按内容去重，恢复真实事件身份前不能将同文工具调用当成多次独立本人确认。

任务账本采用整文件原子读写并保留终态历史，尚未实现任务归档或跨进程分布式锁；大历史量需要测量后再决定分片。外部模型已返回、候选尚未提交时的崩溃可能导致恢复后重新推理，因此只承诺已提交候选不被重复修改，不承诺供应商侧恰好调用一次。旧评分注解缺少新增证据/内容指纹时不会自动产生任务，需要重新评分；既有 llm 失败记录也不直接升级为有调用资格的精修任务。
