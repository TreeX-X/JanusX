---
{
  "schema": "harness-note/2",
  "id": "670abb8a-4665-41cf-a3de-9429cd67027d",
  "kind": "requirement",
  "lifecycle": "accepted",
  "created": "2026-10-14",
  "updated": "2026-10-14T05:24:00.000Z",
  "class": "simplification",
  "tags": ["usage", "context", "panel", "interaction"],
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---

# 底部用量面板直接展示内容

## Expected behavior

2026-10-14 用户确认底部统计面板的产品名称为“用量”，单纯对话场景也使用此名称。主要内容为“上下文”“最近缓存命中率”“缓存读取”“缓存写入”“token 总数”“输入/输出”。

- 将面板中的“更新时间”调整为“运行时间”。运行时间为本次终端实例从 `telemetryStartedAt` 到当前的时长，每秒刷新；异常退出且保留的终端以退出时的 `updatedAt` 为结束时间，启动时间缺失时显示“–”。它不是遥测数据的更新时间，也不是外部会话历史的累计活跃时长。
- 取消再次点击才进入详细界面的交互；打开用量面板即直接展示内容，无需二次点击查看详情。
- 移除用户不关心的“遥测状态”展示区及其内部诊断信息。用户讨论中称为“遥感状态”，现有代码文案为“遥测状态”。

本需求只调整底部用量面板的名称、信息层级与交互。现有上下文和用量数据契约由[会话源单源化](./usage-telemetry-single-source.md)维护；设置中的全局统计页继续由[日期与明细展示](./usage-stats-custom-range-detail.md)维护。

最近缓存命中率来自原生源最近一次请求，分母为该请求的新鲜输入、缓存读取与缓存写入之和，不含输出。Codex 的原生输入已含缓存，计算前只扣除一次缓存读取；Claude、OpenCode 和 Pi 使用各自最近请求的独立分量。Pi 取当前活跃分支。缺少最新请求的输入或缓存字段时显示“–”，明确的零命中显示 `0.0%`，不以累计缓存量代替最新请求。缓存读取、缓存写入、Token 总数和输入/输出仍沿用会话累计投影；输入为现有契约中的新鲜输入。Janus/DSH 缺少原生用量时保持未知。

底部抽屉及普通对话的上下文入口统一显示“用量”。用量卡片直接呈现统计内容，点击卡片只切换活动终端。原预览/详情状态、详情浮层、诊断行、更新时间格式化与专用翻译已移除。抽屉默认高度由 210px 调整为 320px，保留按视图拖拽、键盘调整及终端最小空间；短窗口或更多终端仍可滚动。普通对话入口保留原有模型额度配置能力。

2026-10-14 后续修复恢复了底栏上下文徽标及卡片上下文区域的悬浮提示。提示展示精确占用/窗口、运行窗口、模型容量、剩余上下文及已确认的压缩次数；未知显示”–“，明确的零保留为零。提示复用主题 tooltip 并通过 portal 避免抽屉裁切；卡片直接展示的统计和点击切换终端行为保持一致。

2026-10-14 同日迭代：悬浮提示与展开卡片内容对齐，卡片布局重设计。悬浮提示改为左对齐结构面板（ThemedTooltip 新增 `variant=”panel”` 与 ReactNode 标签），展示 提供商 · 模型 标题、运行时间、上下文明细（精确占用/窗口与占比、剩余、运行窗口、模型容量、压缩次数）及五项统计；五项统计由 `TerminalUsageDetails.tsx` 的 `usageStatEntries` 单一定义，卡片（2 列网格，末项通栏）与悬浮（标签/数值行）共用，两边内容不会漂移。卡片去掉模型徽章填充与整卡填充，改为透明底 + 1px 发丝线（`--shell-border`/`--shell-border-soft`，修复计划主题下白色边框不可见的问题）；选中态 = 左侧 2px 强调条 + 提供商名着色，不再加深填充；统计标签/数值/模型行形成三级字重层次。展开态一律精确值（8,000 / 20,500），紧凑值（8.0k）只属于折叠徽章。

## Acceptance criteria

- [x] AC-1: 底部统计面板称为“用量”，单纯对话场景名称一致。
- [x] AC-2: 打开面板即可看到主要统计内容，不再通过二次点击进入详情界面。
- [x] AC-3: 原“更新时间”位置调整为“运行时间”，实际数值与明确后的计时口径一致。
- [x] AC-4: 面板中不再展示“遥测状态”分区及其内部诊断信息。

## Implementation status

已在当前工作树实施。界面入口为 `src/renderer/src/components/TerminalArea.tsx`，统计行与运行时间由 `TerminalUsageDetails.tsx` 提供；最近命中率通过 history、共享 IPC 契约和 renderer 合并层传递，不影响持久账本的累计口径。

## Validation evidence

悬浮恢复回归：`tests/e2e/terminal-usage.spec.ts` 三项通过，覆盖抽屉收起时徽标、卡片悬浮、移开关闭、实时值变化、零与未知、中英文和 480px 提示边界。已查看 `artifacts/terminal-usage-narrow.png`。本轮同时运行的遥测单测三文件 42 项通过；严格类型、定向 ESLint、翻译一致性及 `build:check` 通过。测试使用 renderer fixture，尚未确认用户当前运行实例中的 Codex 会话是否已精确绑定。

`npx vitest run tests/unit/runtime-telemetry-history.test.ts tests/unit/runtime-telemetry.test.ts tests/unit/runtime-telemetry-coordinator.test.ts tests/unit/usage-stats.test.ts tests/unit/draft-card/quick-note-view.test.ts --maxWorkers=2 --reporter=dot`：五文件 70 项通过，覆盖四种原生源最近请求、零与缺失缓存字段、非单调命中率及原统计/抽屉行为。

`tests/e2e/terminal-usage.spec.ts` 两项通过，验证一次打开直接显示内容、运行时间增长及退出后停止、未知值、终端切换、中英文名称、480px 无横向溢出及首张卡片末行无需滚动；`tests/e2e/janus-context.spec.ts` 七项通过，验证普通对话和蓝图对话的"用量"名称，以及原模型额度配置与压缩流程。浏览器检查使用真实 renderer 组件和 Electron API fixture，不代表 live Electron 或所有 CLI 版本的实测。已查看 `artifacts/terminal-usage-narrow.png`。

`npm run typecheck:strict-unused`、本次修改组件和遥测文件的定向 ESLint、`npm run i18n:check`、`npm run build:check` 均通过。初次普通对话回归中的精确文案断言因新增"Usage"前缀失败，更新为确认后的名称后七项全部通过。

2026-10-14 同日迭代（悬浮/卡片一致 + 布局重设计）验证：`tests/e2e/terminal-usage.spec.ts` 三项通过（断言改为按标签行取父级校验数值，并新增悬浮提示包含五项统计的一致性断言）；`tests/e2e/janus-context.spec.ts` 七项通过；遥测与 hook 单测五文件 90 项通过（含新增的 stdin BOM 解码回归）；定向 ESLint、`i18n:check`、`typecheck:strict-unused` 与 `build:check` 通过。已查看浅深两主题截图（`artifacts/terminal-usage-narrow.png` 及临时深色检查），卡片透明 + 发丝线、选中 2px 强调条、统计 2 列网格在两主题下均成立。此前"尚未确认用户当前运行实例 Codex 绑定"的遗留结论已定位并修复，见[会话源单源化](./usage-telemetry-single-source.md)的 Codex 绑定实证。
