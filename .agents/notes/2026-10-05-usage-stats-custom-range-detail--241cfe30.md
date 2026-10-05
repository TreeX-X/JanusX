---
schema: harness-note/1
id: 241cfe30-fca9-40db-955f-8747b797c885
kind: requirement
lifecycle: draft
created: 2026-10-05
class: feature
tags: [telemetry, usage-stats, terminal]
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/61b5d05c-e1ad-4f7a-a3e9-57982fb78c4e
---

# 用量统计自定义日期与明细展示

## Problem

设置用量视图只支持今日、本周、本月三档预设，`src/renderer/src/lib/usage-stats.ts` 的 `UsageRange` 与 `rangeStartFor` 均无起止日期概念，`src/renderer/src/components/UsageStatsPanel.tsx` 的 `RANGES` 硬编码三个按钮。用户无法回看任意日期区间，跨月对账与活动复盘均被阻塞。

展示维度不足以支撑成本判断。`aggregateUsageStats` 已经按 preset 累加 `inputTokens` 与 `outputTokens`，`TimeBucket.output` 与趋势图第四条 `output` 曲线也已落地，但汇总区只展合计与缓存命中率，整体环形只按 `row.totalTokens` 切终端占比，底部分组每行只展合计与命中率。`row.inputTokens` 与 `row.outputTokens` 算出后即被丢弃，用户看不到输出侧消耗。

类型与范围切换为硬切。`OverallDonut` 与 `CacheDonut` 直接重算 `strokeDasharray`，`TrendLines` 对 `path d` 直接重算，且外层以 `key={activeType-range}` 强制整图卸载重建，`activeIndex` 清零。`UsageStatsPanel.module.css` 仅按钮有 120ms 过渡，SVG 无任何过渡，切换时数字与曲线同步闪变。

## Expected behavior

设置用量视图支持自定义起止日期，输入输出拆分进入汇总与分组展示，类型与范围切换具备克制的过渡动效，且 DSH 缺数状态保持可解释。

- 自定义日期接受本地起止日历输入，起止均含当日，非法区间（开始晚于结束、未来日期、跨度超限）拒绝并提示，不发起聚合。
- 自定义区间与三预设共用同一终端类型筛选，两个环形、趋势图与底部分组随所选区间一起切换。
- 汇总区在合计之外展示输入与输出拆分，底部分组每行在合计与命中率之外展示该 preset 的输入与输出，输出曲线保留在趋势图中并可读数。
- DSH 在无解码能力前一律显示未知，不以零值冒充真实用量，自定义区间与明细列均不为例外。
- 过渡动效覆盖环形占比变化与曲线形状变化，`prefers-reduced-motion` 下退化为即时切换，键盘聚焦读数行为不变。
- 空状态以原因感知 hero 呈现（类型筛选、无遥测终端、日期错误分别给文案，配回到今日动作），汇总卡置灰而非藏起。

## Scope

In scope：`usage-stats.ts` 的自定义区间类型、起止边界、分桶策略与聚合复用，`UsageStatsPanel` 的日期输入、输入输出展示列、环形与曲线的过渡实现，`settings.json` 中英文文案，对应单测与 e2e。

Out of scope：`session.v4.jsonl.zstd` 解码、pid 到会话挂载匹配、无 hook 自动绑定、dsh 成功结束与审批与数值解析在无样本时落地、历史增量账本的持久化采样。后者为自定义区间的长期解法，本需求仅以前端过滤口径交付，并在文案中明示快照口径。

## Proposal

自定义区间以前端过滤口径先行，不改遥测合并语义。`UsageRange` 新增 `custom` 分支并附带 `rangeStart/rangeEnd` 入参，`bucketKeysFor` 按跨度动态分桶（短跨度按小时，长跨度按日或周），`aggregateUsageStats` 在现有 `observedAt < rangeStart` 之外增加 `observedAt > rangeEnd` 拒绝。日期输入采用原生 date 输入加本地时区换算，保持无图表依赖。

明细展示复用已聚合字段，不新增终端私有协议解析。汇总与分组直接读取 `view.inputTokens/view.outputTokens` 与 `row.inputTokens/row.outputTokens`，缓存命中口径保持 `cacheSplitFor` 的输入侧定义不变，输出不计入命中与未命中。

动效去掉 `TrendLines` 的强制重挂载 `key`，改为受控更新，环形以 `stroke-dasharray/offset` 过渡、曲线以受控插值或淡变过渡，时长控制在 200ms 内。

## Alternatives considered

- Do nothing：维持三预设与合计展示，零成本，但日期回看与输出成本判断继续缺失，终端增多后缺口放大。
- 自定义区间连同历史增量账本一起做：可给出真正的逐日新增消耗，代价是新增持久化采样、有界读取与幂等去重，投入大且需先确认 schema，本需求先以快照过滤交付并明示口径，账本另立需求。
- 引入图表库做动画与日期选择：开发快，但打破现有无依赖 SVG 与键盘聚焦实现，增加包体积与主题适配成本，否决。
- 输出计入缓存命中分母：将输出混入 `cacheSplitFor` 可让单环形同时表达两件事，代价是混淆输入侧缓存语义，否决，输出独立展示。

## Acceptance criteria

- [x] AC-1: 自定义起止日期可选择并驱动聚合，非法区间被拒绝并提示，三预设行为不变。`tests/unit/usage-stats.test.ts` 覆盖起止边界与分桶，`tests/e2e/usage-stats.spec.ts` 覆盖日期切换与空状态。
- [x] AC-2: 汇总区与底部分组展示输入与输出拆分，数值与 `aggregateUsageStats` 的 `inputTokens/outputTokens` 一致，缓存命中率口径不变。
- [x] AC-3: 切换终端类型与时间范围时环形与曲线具备过渡效果，`prefers-reduced-motion` 下为即时切换，键盘聚焦读数与悬停行为不变。
- [x] AC-4: DSH 在自定义区间与明细列中无真实用量时显示未知，不显示 0 或 0%，不参与输出合计的虚假拉低。

## Risks

当前聚合为按终端最近更新时间归入的累计快照，不代表逐时新增消耗，自定义区间选得越久远，空结果越多，必须在图表旁保留 `snapshotHint` 口径说明，否则用户会误读为空闲。过渡动效需避免与键盘聚焦冲突，大时间范围仍走按需计算。

DSH 真实用量缺失为硬限制，来源见 [DSH 接入决策](./2026-09-30-dsh-terminal-integration--b28d07a3.md) 与 [DSH 信号与日志补全需求](./2026-10-03-dsh-telemetry-completion--8795ab54.md)：`session.v4.jsonl.zstd` 无解码器，不能据此报告真实用量，带 `startedAt` 的零值只是启动基线；conpty 中间层 pid 与 `session-mounts.json` 内层 pid 不一致，不能据 pid 自动绑定；无 hook 且无外部 `sessionId` 时扫描不生效。任何展示细化均不得将上述缺失数值或启动零值当作真实用量，DSH 在本需求的自定义区间与明细列中保持未知态。
