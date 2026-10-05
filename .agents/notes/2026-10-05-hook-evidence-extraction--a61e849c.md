---
schema: harness-note/1
id: a61e849c-265d-4e35-a197-6a8b6e35f92a
kind: decision
lifecycle: implemented
created: 2026-10-05
class: architecture
tags: [knowledge, capture, extraction, idempotency]
---

# Hook 触发的证据采集与任务上下文提取

## Problem

终端结束 Hook 可能仅包含状态，界面会话摘要又有长度限制。单事件提取容易缺少用户纠正与工具验证；服务写入失败及模型重试可能造成漏采、重复候选，来源未经绑定的摘要难以复核。持续镜像全部外部会话则需要维护改写、分叉与删除传播，超过当前按任务积累知识的需要。

## Decision

采集保留 Hook 入口，必要时读取当前轮次原始会话，以本地 observation 作为后续提取的证据快照。外部记录后续改写不自动改写已接受知识；新纠正通过新的证据进入审核。用户主动撤回和遗忘继续使用原有来源撤回机制。

CaptureInbox 在异步处理前保存脱敏后的采集批次，逐事件复用来源 ID，成功落盘后移除待处理批次。失败保留错误与退避时间，应用装配及终端注册启动恢复；诊断提供积压数量。宿主事件 ID 或时间戳优先，缺失身份时仅能保证本次交付及本地重放的身份稳定，不能承诺识别外部客户端无身份的跨进程重复发送。

原始会话读取覆盖 Claude、Codex、Pi、Janus 文件格式与 OpenCode SQLite，使用最近轮次边界，不调用界面摘要接口。文件读取上限为 2 MiB；边界不完整、格式错误、正文尚未完成或预算不足必须报告原因。角色和工具观察分别保留；模型陈述不获得工具证据的权威级别。知识处理不持续同步外部会话文件。

模型提取使用已完成轮次及前两个相关轮次，按工作区、会话和 Agent 隔离。单块证据最多 18,000 字符，长条目使用带重叠的片段，最多 64 片；多块结果需要最终归并。每条候选须包含准确原文引用、完整条件和来源标识。输出不完整或任一引用无效时保留任务与源证据，不提交部分候选。引用不连续或不匹配时，模型获得一次完整批次纠正机会；仍不匹配则转人工审核，宿主不做模糊匹配。提取提供方独立选择外部或本地模型，输出预算为 4,096 token，规则不作为语义提取的硬筛选。

独立提纯调用逐条保留长期知识、丢弃临时状态或被替代的建议、归并重复陈述。长期规则夹带测试计数或完成状态时，提纯可以清除附带内容，但必须保留长期条件、例外、数值及理由；改写结果仍绑定原始引用并经过入库审核。每条候选必须获得唯一处理结果，无效索引、等价目标或重复目标阻止整批发布。

候选身份基于工作区、知识类型、陈述及来源快照，独立于模型与输出顺序。完全相同的待审事实合并来源并失效旧审核建议；新旧条件不同则保留审核冲突。模型提示要求同义事实复用已有陈述，语义等价仍是模型质量边界，不把词面相似度当作自动替代授权。多次分析同一证据不增加独立确认次数。

自动审核核验完整来源哈希、角色和每条引用。长来源可以围绕引用展示相邻上下文；只有模型来源、证据不完整或冲突时保留人工审核。模型来源与用户或工具证据一起出现时，审核仍须区分陈述、要求和已验证结果。审核通过才进入正式事实，Wiki 发布继续沿用[工程自动处理](./2026-10-03-knowledge-accumulate-review-wiki-rereview--3944b368.md)的快照与版本约束。

## Alternatives considered

维持 Hook payload 加单事件提取改动最少，也能保留实时性，但状态型结束事件无法提供答案正文与纠正上下文。

完整镜像原始会话可重建历史和重跑提取，但需要处理各终端格式、改写、压缩、分叉与删除传播。按轮次有限读取复用已有会话定位，维护边界更小。

对摘要反复归纳能降低输入成本，但多层压缩可能丢失否定、条件与数值。任务提取保留来源引用，摘要只用于组织信息。

## Consequences

恢复账本增加少量本地状态，故障积压需要通过诊断发现；磁盘不可写时仍无法保证捕获，不能报告成功。模型提取与跨块归并增加推理成本，真实会话的长期漏提率与语义重复率需要持续测量。提示词的覆盖检查与引用存在性不等于事实正确性证明，真实模型小样本通过也不等于生产准确率。原始会话读取失败或 Hook 早于正文落盘时，本次任务保留不完整原因并转人工审核；当前没有持续监听外部文件或持久化补读任务。待处理批次只覆盖已进入 CaptureInbox 的证据，不能覆盖 Hook 未送达、读取过程中进程退出或磁盘不可写。原生来源身份缺失、同义陈述超出最近 30 条已有知识上下文，以及真实长任务的跨块覆盖仍需运行数据评估。

## Verification

`npx vitest run tests/unit/knowledge tests/unit/knowledge-transcript.test.ts tests/unit/transcript-reader.test.ts tests/unit/transcript-excerpt.test.ts --maxWorkers=2 --reporter=dot`：76 个文件通过，706 项通过，5 项按条件跳过。最后的会话恢复及同义归并检查使用 `npx vitest run tests/unit/knowledge/automation-service.test.ts tests/unit/knowledge/capture-extraction-pipeline.test.ts tests/unit/knowledge/agent-turn-recorder.test.ts tests/unit/knowledge/knowledge-models.test.ts --maxWorkers=2 --reporter=dot`：38 项通过。测试包含五种会话格式、重启与重放、分块、整批引用拒绝、提纯丢弃与改写、无效归并、外部模型切换和个人数据展示。

`tests/unit/knowledge/extraction-live.test.ts` 在 `JANUSX_EXTRACTION_LIVE=1` 及 `JANUSX_EXTRACTION_CONFIG` 指定已有配置时使用真实外部模型，只发送合成证据。Mimo `mimo-v2.5` 样本在约 81 秒内完成：拼接引用经一次纠正变为连续原文，独立提纯移除测试计数和临时状态，开发环境缓存与七天备份/恢复校验和两条决策通过审核入库，重复运行没有新增候选或模型调用。这是单个纠错场景的机制检查，不是准确率基准；空产出、引用伪造和状态混入都由测试断言显式检出。

`npm run typecheck:strict-unused`、本次源文件 ESLint、`npm run build:check`、`npm run i18n:check`、`npm run check:package-boundary` 与 `npm run exclusions:check` 通过。桌面验证设置 `NO_PROXY=127.0.0.1,localhost`、`JANUS_E2E_PORT=42783` 和 `JANUSX_DESKTOP_ENTRY=artifacts/build-check/main/index.js` 后运行 `npx playwright test tests/e2e/knowledge-pipeline.spec.ts --project=desktop --workers=1`，真实 Electron IPC 的采集、审核、truth、搜索及上下文链路通过。测试应用使用独立临时数据根，不关闭用户正在运行的便携实例。

`npm run check:notes` 校验 245 个 Note，0 个错误，27 条已有外部链接诊断；本次文件的 `git diff --check` 通过。
