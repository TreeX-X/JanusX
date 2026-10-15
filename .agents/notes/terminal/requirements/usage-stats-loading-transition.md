---
{
  "schema": "harness-note/2",
  "id": "21e6602b-2dbe-4f68-aea3-f2c49f19383f",
  "kind": "requirement",
  "lifecycle": "accepted",
  "created": "2026-10-14",
  "class": "simplification",
  "tags": ["usage-stats", "chart", "loading", "transition", "settings"],
  "updated": "2026-10-14T11:30:00.000Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---

# 用量统计筛选切换的加载过渡

## Problem

2026-10-14 用户实测：设置页用量统计在切换终端类型（或时间范围）时，图表与数字先清空再回填，出现明显闪断。代码定位：`UsageStatsPanel.tsx` 的数据 effect 在查询键变化时立即 `setLedger({ records: [], sessions: [] })`，随后才发起 `loadUsageLedger` IPC；新数据到达前整板处于空状态，`useAnimatedNumber` 从 0 开始动画，环形与曲线从空态过渡——即使用户要的只是换一个引擎筛选。

[日期与明细展示](./usage-stats-custom-range-detail.md) 的 AC-3 只覆盖了**状态间过渡**（旧值→新值的动画），没有覆盖**加载中间态**：查询进行中面板应该是什么样。当前实现把中间态当作空态处理，于是每次筛选切换都伴随一次全板闪烁。非 custom 范围的 effect 依赖含每 10 秒更新的 `now`，查询会周期性重发（当前不清空，无闪断，但同样缺少加载中的可见反馈）。

## Expected behavior

- 筛选切换时**保留上一份数据** visible（stale-while-revalidate），面板不落入空状态；查询进行中给出轻量刷新指示（如整体降透明度或顶部细进度发丝线，不引起布局位移、不遮挡读数）。
- 新数据到达后由既有的数字动画与图表过渡完成交换；`prefers-reduced-motion` 下刷新指示即时出现、数据即时替换，无位移动画。
- 空状态仍然真实：上一份数据存在但新筛选确认为空时，先显示刷新中再落到空态文案，不把"加载中"假装成"无数据"。
- 查询失败时保留上一份数据并显示错误提示，不清空。
- 10 秒周期查询（非 custom 范围）不产生可见闪烁。

## Scope

仅渲染层：`UsageStatsPanel.tsx`（必要时含 `services/usage.ts` 的查询去重）。不改动账本查询契约、聚合口径与 e2e 覆盖的日期/类型/键盘读数行为。

## Acceptance criteria

- [x] AC-1: 切换终端类型与时间范围时面板不清空，上一份数据保持可见直至新数据到达；`tests/e2e/usage-stats.spec.ts` 补充或改用不依赖空态闪烁的断言。
- [x] AC-2: 刷新指示在 `prefers-reduced-motion` 下为即时样式，布局无位移；深浅主题下可见且不引入新色块（遵循既有发丝线/透明度语言）。
- [x] AC-3: 新筛选确认为空、查询失败两种路径都有明确定义的行为（空态文案/错误提示），不与加载中混淆。
- [x] AC-4: 单测覆盖查询键变化不清空、周期 `now` 触发不闪烁的状态机。

## Implementation

2026-10-14 实施。`UsageStatsPanel.tsx` 的数据 effect 不再清空账本：筛选切换时保留上一份数据，仅用户发起的筛选变化置 `refreshing`（周期 `now` 重查同键静默）。刷新指示为汇总卡顶部 2px 不定进度发丝线（复用 `--usage-input`，无新色块）+ 汇总与趋势区降透明度（0.55，160ms 过渡）；`prefers-reduced-motion` 下发丝线静态满宽、过渡即时。

曲线图的切换效果（形变，非重画）：形态变化（换范围/粒度，桶结构改变）时，把新旧两条曲线重采样到同一 48 点网格后补间，旧曲线平滑变成新曲线；同形态的数值变化走更短的 280ms 值补间（曲线形变）；落到空结果时曲线先沉到基线再显示空水印。形变期间不画数据点（重采样网格会产生几十个飞点），日期标签按目标范围网格定位（不随形变抖动）。`prefers-reduced-motion` 下补间即时、虚线复位。
关键设计：**光保留 records 不够**——聚合按过滤器派生，旧 records 配新过滤器会闪零（浏览器测试先抓到这个）。实现为“数据落地时快照聚合视图”（`settled` 状态带查询键），当前键无数据时（含查询失败、非法区间）持续展示上一份快照，新数据到达即交换；这同时满足了 AC-3 的失败不清空。

## Validation evidence

`tests/unit/usage-stats-loading.test.ts`（浏览器组件测试，Playwright + esbuild，可延迟的 `listUsageLedger` stub）5 项通过：① 切换引擎时旧总数保持可见、`data-refreshing` 置位、透明度低于 1、发丝线动画名含 `usage-refresh-slide`，释放门控后换成新值且指示消失；② `page.clock` 快进 10 秒的周期重查不置指示、不闪烁；③ `reducedMotion: 'reduce'` 下动画名为 `none` 且发丝线静态满宽。`tests/e2e/usage-stats.spec.ts` 3 项通过（既有切换断言为最终值，自动重试不受 stale 影响）。`tests/unit/usage-stats.test.ts` 与新测试共 22 项通过；`typecheck:strict-unused` 与定向 ESLint 通过。曲线形变两项通过：形态变化后 path 的桶段数离开旧形态并落位到新形态、同一节点未被重挂（data-morph-witness 存活，证明是形变而非重画）、数据点在落位后恢复；reduced-motion 下补间即时且无残留虚线。已查看 `artifacts/usage-loading-browser/curve-draw.png`（曲线绘制中段）。

已查看 `artifacts/usage-loading-browser/refreshing.png`：切换引擎后旧数据（总数、图例、双会话、趋势曲线）完整保留并整体降透明度，汇总卡顶部可见 2px 发丝线。尚未在 live Electron 中由用户目验过渡手感。
