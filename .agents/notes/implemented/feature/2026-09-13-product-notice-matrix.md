---
schema: harness-note/1
id: c4b9de4e-36f2-5b20-b7e0-4227835253a4
kind: decision
lifecycle: implemented
created: 2026-09-13
class: feature
---
# Agent Note: 产物通知矩阵（新增/覆盖/基线修改三分）

Status: implemented

## Problem

产物通知目前只认「本会话新增文件」（`added`），两类修改事件完全静默：本会话产物被覆盖、基线文件（历史会话产物）被修改。其中基线文件被改后已会进入监控区列表（`mtime > baseline` 过滤器放行）却不发通知——列表与通知口径分裂；用户未开预览时对覆盖事件无感。同时用户确认了分级需求：修改不应抢屏（写入中间态会连续触发，弹岛即噪音），但需要可发现的最低限度提示。

## Decision

通知矩阵（用户确认版）——**不变量：每个文件每个会话只通知一次**：

| 事件 | 一级胶囊（弹岛） | 托盘/徽标 | 已开预览 |
|---|---|---|---|
| 本会话**新生成**文件 | ✅ 上台（sticky，点击直达右侧） | 通知行「已生成」 | — |
| 本会话产物被覆盖（无论通知是否已消费） | ❌ | ❌ 不通知 | revision++ 自动刷新 |
| 基线文件**首次**被修改 | ❌ | ✅ 托盘「已更新」行 + 徽标脉冲 | revision++ 自动刷新 |
| 基线文件再次被改（已入列） | ❌ | ❌ | revision++ 自动刷新 |

一句话规则：**一级胶囊只属于「本会话新生成的产物」；托盘承载「本会话内一切产物落盘变化」；每个文件只通知一次，此后静默刷新。**

实现要点：

1. **三态分类**（`reconcileProducts`）：`lastKnown = previousByPath.get(path)?.mtimeMs ?? baseline[path]`；`path ∉ lastKnown` → `added`；`entry.mtimeMs > lastKnown` → `modified-first`（基线首改）或 `modified-subsequent`（已入列，仅 revision++）。注意不能用 baseline 单独判——连续写入会丢中间态。
2. **notice 槽带 kind**：`ProductNotice` 增加 `kind: 'added' | 'modified'`；`added` 优先——槽被未消费的 added 占据时 modified 不落位（不顶掉新生成通知）；槽空闲或槽内为 modified 时 modified 落位。
3. **上台只认 added**：Titlebar 上台判定（`shouldPresentProductNotice` + `presentedProductNoticeIdRef`）只对 `kind === 'added'` 弹岛；modified 仅进托盘投影。
4. **id 引入版本**：`product:{relPath}:{mtimeMs}`——同文件连续写在单槽内原位刷新（托盘行时间/文案更新），天然节流零重复行。
5. **文案分叉**：新增 `janus:island.peek.title.productUpdated`（zh「产物文件已更新」/en `Product file updated`）+ meta `PRODUCT // UPDATED`；`productNotification` 按 kind 切 title/meta，subtitle 仍为 relPath。
6. **生命周期**：modified 通知与 added 同构——进槽驻留，点击（`openProductFile` 消费）或被新事件覆盖才消失；托盘行被点击同样走 `onOpenProductFile` 直达。

## Alternatives considered

- 修改也弹一级胶囊——否决：终端写文件是 create→write→close 连续 mtime 变化，逐次弹岛即噪音，摧毁 sticky 通知的信任感。
- 完全不通知修改（现状）——否决：基线文件被改后用户未开预览则完全无感，跨会话迭代产物（agent 续作上一轮的 report）恰是高频场景。
- 区分写入方（agent 改 vs 用户自己保存）——不可行：落盘为唯一事实源、不解析终端输出是既定决策；区分需等 agent 原生文件事件落地（既定重访信号）。托盘级噪音是已接受取舍。

## Consequences

改动面：`reconcileProducts` 三态分类、`ProductNotice`/`productNotification` 带 kind 与版本化 id、Titlebar 上台判定加 kind 门、i18n 双语 +1 键组、单测覆盖四行矩阵。获得：列表与通知口径统一（基线修改可见）、跨会话迭代可发现、修改零抢屏。代价：`product:{relPath}` 的旧 id 语义作废（内容寻址升级为路径+版本寻址）；托盘可能出现「已更新」行与「已生成」行并存（同一文件先新增后修改的边界——added 未消费时 modified 不落位，已消费后 modified 落位，故同文件同时最多一行）。

## Split compact：多通知并列显示（同日落地）

托盘可能同时存在多条 alive 通知（product + knowledge + maintenance），而一级胶囊原先只显示栈顶一条。参照 iPhone 灵动岛的 split compact 模式落地：

- **触发条件**：知识面（召回/空态）**未**在场 且 `visibleNotifications.length >= 2` → `data-peek-layout="split"`，壳高 52px；知识面在场时维持既有让位规则（知识拥有胶囊，product/maintenance 只在托盘）——知识召回是用户刚发起的交互，优先占有胶囊。
- **渲染**：`.janus-capsule-split` grid 列布局（`grid-auto-flow: column; 1fr`），每列一个 `<button>` 单元 = LED + kicker(8.5px) + 标题(12px 截断)，列间 1px 中缝分隔线，hover 白 .05 底。subtitle/meta 在半区内不显示（空间不足）。
- **点击直达**：列单元是真实 button，被 `isInteractiveIslandDescendant` 从岛手势中排除，click 直接复用 `runNotificationAction`（open-product → `onOpenProductFile`，open-knowledge/maintenance → 各自工作台 + dismiss），点击后该通知入 `clearedIds`——裂位随之收敛（3→2→1 时退回单满宽形态）。
- **a11y**：split 时岛体 `role="button"`/`tabIndex` 摘除（避免 button 嵌套 button），焦点落在各列；`data-peek-kind` 置 `'split'`。
- **动画**：split 容器复用 `capsule-content-in` 入场，key 绑定通知 id 集合（集合变化重播）。

**刻意不移植**：iOS 的 minimal 退化位与 8s 自动轮换——JanusX 通知是 sticky 语义且并发上限为 3（product/knowledge/maintenance 各一），3 列并排即可全部容纳，轮换对 sticky 集合只机动效噪音。若将来出现非粘性活动流（实时状态类），轮换再议。
