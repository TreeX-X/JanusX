---
schema: harness-note/1
id: 3efc89cf-3aa2-4e1e-829f-a0abc4319691
kind: requirement
lifecycle: accepted
created: 2026-10-02
class: feature
tags: [blueprint, janus-chat, notes, roundtable, execution, ux]
---

# 蓝图连续对话与直接编辑的三阶段交付

## Problem

蓝图右侧将讨论、整理文档、审核和终端派发分成多个操作，用户需要手动搬运上下文、选择相关 Note，并在聊天与文件之间切换。圆桌成果、任务采纳和运行入口又分布在不同界面，用户难以从一个目标连续推进到实施与验收。

本需求将确定右侧连续协作的职责和三个交付阶段。后续阶段不得成为第一阶段交付的前置条件。

同一工作区的连续追问需要同时保留历史决策和已读取的来源。仅发送最近 24 条消息会遗漏早期约束；未知模型的 16,384 token 回退窗口、自动注入的 Note 正文和缺少摘要的裁剪路径会进一步挤掉上下文。读取成功但没有可见访问事件时，用户也无法核实助手实际查看了哪些 Note。

## Expected behavior

### 第一阶段：Janus 直接读取和编辑 Note

右侧应保留连续对话区。Janus 应通过项目授权范围内的工具读取真实 Note 正文，并根据用户明确的修改意图直接创建或更新 Note。用户要求分析或建议时应保持讨论；要求修改、新增或按已讨论方案更新时应直接执行，不再要求点击整理文档、生成待审稿或重复批准。

常规交互应移除整理文档与稿件审批步骤。文件修改仍须经过受管 Note 服务，保留身份、结构校验、读取基线、冲突处理和事务记录。该授权面向 Note 维护，不自动扩展为代码实施、任意命令执行或伪造任务完成状态。来源变化时应重新读取并处理冲突；失败、无变更和部分成功必须如实报告。

成功后应刷新蓝图，在对话中显示涉及的 Note、修改摘要及查看修改、撤销入口。操作卡应呈现写入回执；查看差异不作为常规写入的前置批准。撤销应校验当前来源，不能覆盖后续外部修改。继续讨论应读取最新内容并保留会话。一次明确指令可涉及多篇 Note，无需用户逐个手动选择；自动画布定位和范围展示在第二阶段交付。

### 第二阶段：自动聚焦与多 Note 工作范围

Janus 应能够按主题、正文和关系查找 Note，使用稳定 Note URI 定位单个或多个节点，并组织当前工作的主要目标、参考资料和依赖。宿主应校验真实来源；不存在、未接入或跨项目的 Note 应明确说明，不能按相似标题猜测替代。

工具应区分展示高亮、加入工作范围和作为实施目标。读取或高亮参考决策不代表需要修改它，工作范围中的所有节点也不自动成为实施任务。Janus 可主动补充必要参考并说明原因；用户可查看、移除或固定范围。

画布应区分主要目标与关联节点，突出相关连线；多个目标应一次适应共同视野。助手高亮应独立于鼠标选择，避免抢走用户查看的详情。明确要求定位或首次进入新目标时可自动聚焦；后台读取不逐次移动画布，用户拖动或编辑时应保留视野并提供定位入口。旧消息中的定位只重现引用，不改变当前实施范围。

### 第三阶段：派发实施与圆桌

右侧应支持普通对话与圆桌会议界面切换，分别保留会话状态。圆桌应携带明确的项目、议题和选定 Note，结论可返回普通对话，并由 Janus 根据用户要求直接更新 Note。已经保存的成果应直接引用，不要求重新整理；会议记录与工程资产保留各自身份。

新圆桌入口应复用设置中创新功能的 roundtable 开关。关闭后应隐藏入口、返回普通对话、保留会议记录并停止继续调度；正在运行的请求应正确取消或报告未停止状态。圆桌关闭时普通 Note 读写与实施仍应可用。蓝图入口自身继续遵守既有蓝图开关。

用户可从对话或当前目标发起实施。Janus 应读取并复用真实 task Note，补齐范围、验收条件和依赖；资料充分时自行准备，实质性未决问题才在对话中澄清。任务卡引用真实任务，派发内容由固定任务与依据生成，不另存需要手工维护的计划或简报正文。

开始前应展示任务、工作目录、执行方式、质量要求、验收与阻塞。执行方式和质量要求分别选择；内置 Janus 或外部编码终端应承接同一任务身份。用户已经明确目标、方式并要求启动且前提齐全时，应连续完成准备和启动，不重复询问。Note 编辑或会议结束本身不能自动启动实施。

启动后应保留运行卡和连续对话，提供进展、执行详情、终端与暂停入口。启动时固定范围和验收基线，浏览节点不改变运行目标；受影响合同变化时须重新定界后继续。多任务应按真实依赖推进，前置失败阻塞后续，同一工作目录默认顺序执行。自动依赖调度属于本阶段需要实现和验证的能力。

验收应依据任务与有效证据，分别表达实施中、验证通过、待提交和流程完成。终端仅预填时显示待发送，不能显示已经实施或完成。跨界面读取同一运行结果，不从聊天文字或节点高亮推断完成。

## Scope

交付顺序固定为第一阶段、第二阶段、第三阶段，各阶段分别建立实现范围和验证记录。第一阶段实现连续对话中的 Note 查找、读取和直接修改；第二阶段实现自动聚焦和多 Note 工作范围。第三阶段的多任务派发和右侧圆桌尚未实施，不计入前两阶段验收。

第一阶段的 `note_list`、`note_read`、`note_write` 只作用于会话已接入且仍有效的工作区。写工具按当前用户消息的明确修改意图提供；分析请求只提供读工具。宿主生成新 Note 身份，更新必须先读取并提交对应字节哈希，一次最多 16 篇 Note 通过同一受管事务写入。带 execution 的任务拒绝在这里更改合同；工具不提供执行字段、任意路径或命令权限。写入回执在 `.agents/.local/note-chat` 中保留前后正文，与已提交事务核对；提交后丢失回执引用时通过日志恢复。撤销重新校验当前字节。

常规项目对话的初始上下文提供 Note URI 和标题索引，正文通过 `note_read` 按需读取；旧维护提案入口保留其完整来源协议。`note_read` 默认返回 6,000 字符，每页最多 12,000 字符，提供 `offset`、`totalChars` 和未读完时的 `nextOffset`，哈希始终针对完整原始文件字节。模型必须继续读取任务所需章节。宿主缓存最近 32 个 Note 的已读证据，以工作目录和 URI 区分 checkout，连续分页仅在哈希相同时拼接；下一轮校验真实来源，变化或本轮写入后将旧正文标为失效。预算充足时再次提供已读正文，否则保留引用和重新读取提示。通用 `workspace_read` 读取 Note 时保留实际摘录和对应哈希，读取后发生来源变化时不能把新哈希附在旧正文上。

普通 Janus 与蓝图右侧共用 `ManagedChatSession`。界面每页显示 100 条消息，请求与持久化不按消息条数或单条长度裁剪原文。模型窗口按当前模型的显式配置、适配器目录、可靠模型资料、16,384 token 估算值依次解析；未知别名不能仅凭名称宣称支持百万上下文。输入区显示使用估算、窗口来源和压缩状态，并可保存该供应商模型的 `chatModelLimits`。输出上限同时用于生成请求和预算预留。

Vertex AI 适配器的 `listModels` 返回已配置模型的身份和能力，不查询服务端 token 容量；本地资料缺少 `gemini-3.8-flash` 的可靠匹配时，自动预算为 16,384。该数值表示宿主缺少容量信息，不代表供应商只支持 16k。明确保存的 `chatModelLimits[modelId].contextWindow = 1000000` 优先于回退，并在下一次实际推理和自动压缩中生效。开发版、安装版和便携版使用各自配置文件，在一个实例保存不会自动修改其他实例的容量。

上下文表单显示当前模型和实际使用的容量，采用带数字输入模式的文本框，不提供原生增减箭头，方向键和滚轮不调整 token 值。表单提示估算原因及下一请求生效规则，拒绝非整数或超出 1,024 至 10,000,000 的输入；容量未改变、请求进行中或保存中禁用提交，保存中禁用输入并显示结果。异步保存完成时重新核对当前模型，不能把旧模型容量显示在已切换的新模型上。

使用量接近窗口 80% 或扣除回复、工具和安全预留后的限额时，宿主将早期完整消息组分批交给模型摘要，目标为约 60%。摘要吸收全部选中输入，保留当前用户指令和最新工具调用及结果配对；URI、路径、来源哈希及事务引用由宿主单独记录，不能依靠模型复述。摘要全部成功且最终预算通过后才发布检查点；摘要失败、格式持续无效或用户取消均不提交部分结果，也不退回静默裁剪。若必要上下文仍过大，对话明确报错并保留原文，用户可缩小读取范围或配置真实模型窗口。

检查点包含已覆盖原始前缀的长度、哈希、工作区范围和重置代数；下一轮仅向模型提供摘要与未覆盖部分，改写、清空或换工作区会使不匹配检查点失效。`/compact N` 使用同一摘要路径并保留最近 N 条消息，原始消息仍可查看。供应商报告上下文超限时，Agent facade 在失败的模型调用边界强制压缩并只重试一次，已完成写入及工具结果随恢复上下文保留，不能重跑整个用户请求。普通会话检查点随现有日志保存；Note 正文缓存属于进程内状态，重启后依赖保留的引用重新读取。

右侧常规入口显示连续对话和写入回执，差异和完整正文按需展开。原整理与派发操作条不在该入口显示；旧维护服务和事务测试保留，新的实施入口由第三阶段负责。关闭再打开面板保留当前会话；应用重启继续遵循既有临时蓝图会话规则，不承诺重启后恢复会话。

当前安装的 Agent facade 使用固定工具目录，仓库通过 `scripts/patch-agent-note-tools.mjs` 补入五个宿主 Note 工具的模型参数声明，支持分页所需的整数和数值参数，执行仍走原有会话与工具循环。安装、开发、构建和单元测试入口应用幂等补丁；无法匹配依赖入口时明确失败。直接修改外部依赖源码会触碰缺失工作树，复制整套编排器又扩大维护面，因此暂用这个小范围兼容层。代价是依赖升级需要复核补丁；上游支持宿主动态工具后应移除它。自然语言意图判定采取保守规则，含分析或否定措辞的混合指令可能需要用户明确说“直接修改”。

第二阶段的 `note_scope` 设置当前关注范围，`note_focus` 仅展示指定 Note。宿主逐篇解析完整 URI、当前会话工作区和真实正文；一项无法解析即拒绝整次展示请求。`note_list` 的 `relatedTo` 返回原有关系和 Markdown 引用及其方向、类型与解析状态，不将引用推断为实施依赖。范围最多 32 篇，每篇包含目标、参考或依赖角色以及选入原因；这些角色不授权编辑或执行。用户固定的条目保持角色和理由，移除的条目不会被后续助手范围重新加入，直到用户重置范围。当前范围和排除项随下一轮对话传给模型，正文仍须从真实 Note 读取。

读取或更新成功后，宿主直接发送当前请求已访问 Note 的 `access` 事件，不依赖模型额外调用定位工具；专用读取和解析到真实 Note 的 `workspace_read` 都触发事件。读取标为参考，实际修改标为目标；最多展示同一工作区的 32 篇，普通访问不移动视野、不改变工作范围。显式 `note_scope` 或 `note_focus` 不抑制后续访问记录；画布将访问结果与语义范围合并展示，用户固定与移除优先。右侧“已访问 Note”卡显示真实来源，提供定位和加入关注；加入时保留已有范围。仅靠提示词要求模型主动定位无法保证高亮出现，因此专用工具负责语义范围，宿主保证实际访问可见。

右侧没有常驻的“直接告诉 Janus”说明；范围为空时不显示范围卡，有范围时显示可展开的“当前关注”，提供定位、固定、移除与重置。画布用实线、虚线和点线区分目标、参考和依赖，并强调所选范围内原有连线。助手高亮独立于鼠标选择与左侧详情。进入新主要目标可自动适应共同视野，相同目标的后续范围更新和普通读取不移动视野；用户拖动、滚轮操作或详情编辑期间跳过自动移动，不排队补跳。显式定位可展开目标的祖先和放开孤立节点折叠，保留其他折叠状态。

历史定位仅恢复当时的高亮，不改写当前范围。折叠节点显示隐藏提示并可主动定位展开；无投影、重名身份或不属于当前工作区的节点保留不可用提示，不能按标题替代。显示状态按 conversationId 保存，只有当前蓝图会话可以更新画布，关闭面板后的后台事件保留在所属会话而不点亮其他画布。范围和最近 100 条定位记录属于当前进程会话，清空对话或切换项目时清理，应用重启不恢复；这避免维护第二套持久 Note 索引。用户可在定位被跳过后主动点击定位。后续若需要跨重启的工作范围，应接入正式会话持久化，而不是再存一份 Note 关系图。

[文档审核循环](./2026-10-02-blueprint-review-conversation-loop--9c426f18.md)记录原审核交互的验证结果。本需求将取代其中普通对话只读、必须整理并批准才写的产品要求；来源一致性和事务正确性的目标应保留，直接写入协议由第一阶段实施记录持有。旧验收结果不应改写为本设计已通过。

[圆桌到实施闭环](./2026-09-16-roundtable-chat-harness-loop--f8f6586b.md)提供原生 Note、任务身份和证据回流的总体约束；[圆桌成果卡](./2026-09-16-roundtable-artifact-card-s5--6471d8f2.md)与[任务采纳](./2026-09-18-task-contract-adoption--6b7c688e.md)提供现有接点。第三阶段应复用已有能力并核实缺口，不把旧提案直接当成已交付功能。

## Alternatives considered

- 保持整理、审批和终端预填：已有链路有校验和测试，但要求用户在讨论后重复操作，不能满足直接维护 Note 的要求。
- 同时交付三个阶段：能一次呈现完整体验，但直接读写会被圆桌、画布工具和调度阻塞，不符合交付优先级。
- 直接用通用文件工具绕过 Note 服务：接入较短，但不能维持身份、来源冲突和事务一致性；应移除常规人工审批步骤并保留领域校验。
- 分阶段接入直接协作：每阶段可独立验收，代价是需要清楚维护能力边界和后续接点。
- 保持共享运行时默认裁剪或仅提高 16k 回退：接入成本最低，提高窗口也能推迟超限，但不能修复 24 条请求截断、跨轮来源丢失和最终满载，未知模型还可能被高估。
- 保留原文并使用宿主摘要检查点：复用 Agent 工具循环和单次超限恢复，正文分页降低每轮输入，代价是摘要调用和日志容量；相较复制编排器或改动外部缺失工作树，此方案把修复限制在 JanusX。

## Acceptance criteria

- [x] AC-1: 第一阶段，连续对话读取真实 Note，明确修改指令直接执行，无需整理按钮或常规稿件审批；纯分析请求不写入。
- [x] AC-2: 第一阶段，读写保留授权范围、结构校验、冲突处理和事务记录；不能伪造执行完成，失败和部分成功如实显示。
- [x] AC-3: 第一阶段，成功后刷新蓝图，提供修改回执、差异和可校验撤销；多轮读取最新内容，多 Note 指令无需逐个手动选择。
- [x] AC-4: 第二阶段，工具可定位单个或多个真实 Note，区分主要目标、参考与实施目标，并提供范围解释和用户调整入口。
- [x] AC-5: 第二阶段，自动聚焦不抢占用户交互，后台读取不连续跳动画布；历史定位与当前工作、实施范围相互独立。
- [ ] AC-6: 第三阶段，右侧圆桌可切换并衔接结论，遵守创新功能开关；关闭时处理活动会议并保留记录。
- [ ] AC-7: 第三阶段，实施准备复用真实任务，明确目录、执行方式、质量要求和验收；充分授权后无需重复确认，未启动不虚报运行。
- [ ] AC-8: 第三阶段，任务遵循依赖和工作目录约束，运行范围固定；进展、暂停、检查、修复和证据回流可达，完成与提交有真实依据。
- [ ] AC-9: 三阶段分别验收；后续阶段不阻塞第一阶段，旧验证记录和未验证探索代码不计为本需求已完成。
- [x] AC-10: 普通 Janus 与蓝图连续追问保留原始历史，满上下文通过可见摘要检查点延续；失败和取消不丢原文，供应商超限恢复不重放已完成写入。
- [x] AC-11: 专用及通用 Note 读取均显示访问记录，高亮与当前会话隔离，已有工作范围不抑制后续读取，隐藏节点提供可达定位入口。

## Risks

直接写入需要可靠的事务、来源校验和撤销冲突处理。多 Note 的参考、编辑与执行范围容易混淆，工具和界面必须区分。圆桌与普通对话共享展示位置时，应避免错误复用项目、会议和取消目标。终端预填、多任务调度及正式验收必须按实际能力显示。

摘要有损且增加模型调用成本，原文用于回查，不能承诺摘要逐字保留全部历史。token 为本地估算，真实供应商窗口与计数规则可能不同；未知模型应通过其服务端配置核实窗口。必要指令、工具结果或精确引用本身超过预算时必须停止并说明。现有会话日志保存完整快照，长对话增加磁盘和序列化成本；出现可测容量或延迟问题时应迁移增量存储，不能以静默删除历史代替。当前验证使用模型替身，未实测 `gemini-3.8-flash` 供应商；外部 janus-agentX CLI 不属于此修复的代码范围。

## Verification

2026-10-03 容量与控件机器验证：`npm run test:unit -- --run tests/unit/llm/janus-agent-ports.test.ts tests/unit/managed-chat-session.test.ts --reporter=dot` 的 28 项通过。相同的 31 条长消息经过真实 Agent facade，在 `gemini-3.8-flash` 无容量配置时触发 16k 压缩，在显式 1,000,000 配置下不触发压缩；模型传输为测试替身，不构成服务端容量验证。`npm run test:e2e -- tests/e2e/janus-context.spec.ts --workers=1` 的 4 项通过，覆盖 1M 保存、无增减箭头、越界输入、保存中禁用以及切换模型后的迟到回执。严格类型检查、所改控件和 hook 的 ESLint、i18n 检查及 `npm run build:check` 通过；全仓 Note 检查保留 `dsh-integration.md` 的 6 项既有错误。

最终 `npm run build:check` 通过，主进程、preload 和 renderer 构建产物位于 `artifacts/build-check`；构建日志为 `artifacts/blueprint-context-fix-build.log`。访问卡文案与摘要状态调整后的 `npm run test:e2e -- tests/e2e/janus-context.spec.ts tests/e2e/blueprint-note-focus.spec.ts --workers=1` 的 11 项复验通过。

上下文与访问高亮机器验证：`npm run test:unit -- --run tests/unit/managed-chat-session.test.ts tests/unit/note-chat.test.ts tests/unit/note-focus.test.ts tests/unit/project-chat-context.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts tests/unit/janus-chat-conversations.test.ts tests/unit/janus-chat-store.test.ts tests/unit/blueprint-maintenance tests/unit/maintenance-harness-apply.test.ts tests/unit/harness-undo.test.ts tests/unit/blueprint-store.test.ts tests/unit/google-tool-pairing.test.ts tests/unit/janus-tool-pairing.test.ts --reporter=dot` 的 21 个文件、182 项测试通过。来源变化场景补充后，`npm run test:unit -- --run tests/unit/note-chat.test.ts tests/unit/managed-chat-session.test.ts tests/unit/llm/chat-turn-guard.test.ts --reporter=dot` 的 48 项通过。覆盖连续三轮摘要检查点、全部分批输入、精确引用、取消和失败保留原文、手动压缩、Note 分页与缓存失效，以及真实 Agent facade 超限恢复时写工具仅执行一次；合计覆盖 183 个不同测试用例。

`npm run test:e2e -- tests/e2e/janus-context.spec.ts tests/e2e/blueprint-note-focus.spec.ts tests/e2e/blueprint-chat-recovery.spec.ts tests/e2e/project-conversation.spec.ts --workers=1` 的 22 项通过，使用真实 React 界面与 IPC 替身，验证两入口均发送超过 24 条历史、205 条原文分页、窗口配置、手动压缩保留原文、读取记录、折叠定位、范围追加和会话隔离。`npm run typecheck:strict-unused`、`npm run i18n:check` 通过；修改的 19 个 TypeScript 文件 ESLint 为 0 错误，`JanusChat.tsx` 保留 4 项既有中文字符串警告。`npm run check:notes` 仍报告 `dsh-integration.md` 的 6 项既有结构错误，本 Note 无结构错误。真实 Gemini 服务端与跨重启摘要质量未进行人工验证。

工具访问高亮回归：`npm run test:unit -- --run tests/unit/google-tool-pairing.test.ts tests/unit/janus-tool-pairing.test.ts tests/unit/note-chat.test.ts tests/unit/note-focus.test.ts tests/unit/project-chat-context.test.ts` 共 37 项通过，覆盖真实 Note 读取/写入后的自动展示、专用范围优先、用户固定与移除。`npm run test:e2e -- tests/e2e/blueprint-chat-recovery.spec.ts tests/e2e/blueprint-note-focus.spec.ts tests/e2e/blueprint-maintenance.spec.ts tests/e2e/project-conversation.spec.ts --workers=1` 共 21 项通过，包含浏览器实线/虚线轮廓样式和视野不移动的断言。Google 工具结果分组原因见[配对错误与恢复](./2026-09-25-blueprint-dialog-separation--2ec6c79b.md)。

2026-10-02 机器验证：`npm run test:unit -- --run tests/unit/note-chat.test.ts` 的 17 项通过，覆盖实际 facade 工具调用、临时目录多 Note 事务、读取基线、冲突拒绝、撤销、丢失回执恢复与非法结构拒绝。模型响应由测试替身提供，未调用真实供应商。关联回归命令 `npm run test:unit -- --run tests/unit/note-chat.test.ts tests/unit/project-chat-context.test.ts tests/unit/harness-undo.test.ts tests/unit/llm/janus-agent-ports.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/blueprint-maintenance tests/unit/maintenance-harness-apply.test.ts tests/unit/blueprint-store.test.ts` 在增加最后五项回执、结构与否定指令测试前为 131 项通过。

`npm run test:e2e -- tests/e2e/blueprint-maintenance.spec.ts tests/e2e/blueprint-workbench.spec.ts tests/e2e/project-conversation.spec.ts --workers=1` 的 22 项通过，使用真实 React 界面与 IPC 替身，覆盖回执、差异、撤销冲突、面板重开、会话隔离、1280×720 和 1440×900 布局。人工检查窄窗口截图，长正文滚动时输入框与撤销入口仍可见。`npm run typecheck:strict-unused`、`npm run i18n:check`、`npm run build:check` 通过；`npm run lint` 无错误，有既有警告。全仓 `npm run check:notes` 未通过：6 项错误均来自未纳入本次改动的 `dsh-integration.md`。

第二阶段机器验证：`npm run test:unit -- --run tests/unit/note-chat.test.ts tests/unit/note-focus.test.ts tests/unit/blueprint-graph-controller.test.ts tests/unit/blueprint-context-scope.test.ts tests/unit/project-chat-context.test.ts tests/unit/llm/chat-turn-guard.test.ts tests/unit/llm/janus-agent-ports.test.ts` 共 74 项通过，包括真实 facade 的只读范围调用、真实文件关系查找、跨项目 URI 拒绝、固定与移除优先级、身份歧义和历史范围隔离。模型使用测试替身，未验证真实供应商的主动调用频率。

`npm run test:e2e -- tests/e2e/blueprint-note-focus.spec.ts tests/e2e/blueprint-workbench.spec.ts --workers=1` 共 20 项通过，覆盖多 Note 高亮、连线、用户选择保留、相同目标不跳转、拖动期间无延迟跳转、折叠节点展开和编辑保护，以及两种窗口尺寸。第一阶段回执与项目会话的 7 项浏览器回归也通过。人工检查 `working-note-scope.png`，当前关注卡与高亮可见，输入框保留在窗口内。类型检查、i18n 检查和构建通过；lint 无错误，现有警告保留。

第三阶段应验证创新开关、会议返回、任务复用、重复启动防护、依赖阻塞、暂停恢复及证据回流；终端预填与真实执行分别验证。
