# Agent Note: 灵动岛一级展开重设计为通用通知胶囊

Status: implemented

## Problem

灵动岛一级展开（单击折叠胶囊后的 peek 态，300×74 胶囊界面）与全局 UI 风格割裂，且内容分发不可扩展：

1. **风格割裂**：peek 用 `janus-peek-sigil + halo + 双眼` 的人格化神眼语言与近黑不透明底，不消费 `--shell-*` 令牌，也没有全局浮层统一的玻璃磨砂质感（`docs/ui-style-guide.md` §6/§8.7），排版不符 §3 的 kicker 层级规范。
2. **动效平淡**：形变用 `cubic-bezier(0.16,1,0.3,1)` 纯 ease-out，无 iPhone 灵动岛式的弹性加载观感。
3. **内容硬编码**：`JanusIsland.tsx` 中 `peekTitle/peekSubtitle/statusText` 三条 if-else 链（maintenance → product → knowledge）串行判断，每新增一种通知都要改 Island 主组件。
4. **空态死路**：知识召回无命中时单击只显示"Knowledge / 无知识匹配 / KNOWLEDGE // NO MATCH"，无行动出口。
5. **二级展开通知缺口**：`double-activate` 时 `hideKnowledgePeek` 直接丢弃通知；`stage === 'expanded'` 期间新通知被 `receiveKnowledgeTrace` 静默吞掉，无任何展示面。

同时需适配"产物工作区"（Note: `implemented/feature/2026-09-13-product-workspace.md`）与知识库两条已上台链路；一级展开后续将承载更多通知来源，必须先建立通用模型。

**术语约定**：**一级展开** = 单击折叠胶囊后的 `peek` 态（`janus-peek-shell`），保留胶囊形态；**二级展开** = 双击后的 `expanded` 态（`JanusIslandExpandedShell`，monitor/chat/roundtable 三视图）。

## Decision

**A. 通用通知模型**：`src/renderer/src/components/janus/islandNotifications.ts` 是纯内容模型层（可单测）。`IslandNotification { id, kind, severity, copy, actions, createdAt }`，kind 封闭集（knowledge/product/maintenance/agent），action 为纯 id 描述符（open-knowledge/open-product/open-blueprint/open-maintenance），执行绑定在渲染层。`assembleNotifications` 按 severity rank（failed > attention > success > info）降序、同秩按 createdAt 降序、同秩同刻保持插入序稳定排序，并按内容寻址 id 去重。三个投影函数（`knowledgeNotification/productNotification/maintenanceNotification`）从既有 props 派生通知，`capsuleTier` 决定胶囊档位，`mayAutoBanner` 决定二级到达行为。id 内容寻址（`knowledge:{requestId}` / `product:{relPath}`）保证新内容天然重新上台。

**B. 一级展开视觉与动效（iPhone 灵动岛式）**：保留胶囊形态与三态宿主 morph 骨架，内部重构为 `.janus-capsule-*` 结构——玻璃磨砂底（`rgba(18,18,20,.88)` + blur 16px + 顶部 1px 内高光 + 大投影）、左侧 severity LED 状态点（attention/failed 呼吸发光，info/success 静息）、kicker 9–10px uppercase + title 13px/650 + 路径类 subtitle 用 SF Mono、宽度 `min(380px, calc(100vw - 48px))` 自适应、圆角保持 28px。CSS 落新文件 `styles/08-janus-peek-capsule.css`（编号缺 08 正好补位），并删除 01/02/07 中随旧 sigil/copy/statusline DOM 退役的死规则。动效：宽高同时形变 0.38s 换用 §7.1 弹性回弹曲线（overshoot），内容层延迟 70ms 后 `scale(0.85) → 1` + 淡入 0.24s 同曲线（内容从胶囊里长出来），内容按通知 id 作 React key 使变更重放入场动画，收起反向由既有 stage 过渡承接；`prefers-reduced-motion` 降级为 0.01ms。

**C. 一级展开三档形态**（`data-capsule-tier` 驱动同一胶囊的身高）：single ~48px（LED + kicker + title + mono meta）、double ~74px（加 subtitle，通知标准档）、action ~96px（加常驻行动行，空态舱专用）。通知态主行动按钮 hover/focus-within 才显现（静息克制），空态舱行动行常驻。空态舱（无任何通知时单击）：kicker `JANUS` + "一切就绪" + 副行提示 + `知识库/产物/蓝图` 三个直达按钮。

**D. 二级展开通知面**（全部复用 expanded 面板语言，均在 `JanusIslandExpandedShell.tsx`）：

- **托盘**：topbar 右侧通知徽标（LED + 计数，count=0 不渲染），点击展开 340px 玻璃托盘；行 = LED + kicker + 相对时间（复用 `formatRunAge`）+ title + mono subtitle + action 药丸；新行 `message-in` 入场；"全部清除"将当前 id 批量记入 `clearedIds`。
- **钉条 banner**：peek→expanded 携带的通知（T1）与 attention/failed 新到达（T2）钉在 topbar 与 body 之间成 banner 细条，action 执行或 ✕ 关闭才撤；替代旧 `hideKnowledgePeek` 的丢通知行为。
- **到达规则**：`info/success` 仅徽标脉冲（0.9s pop 动画 ×2）；`attention/failed` 额外自动亮 banner；永不自动打开托盘；ESC 优先关托盘再收岛。
- **收起双向连续性**：expanded 收起后未消费通知仍由活跃 props 派生，下次单击 peek 重现（TTL 由 Titlebar 既有 timeout 机制接管）。
- **桌面 Toast 分工**：岛在场（peek/expanded）→ 岛内各形态；岛不在场 → 桌面 Toast 兜底（既有 Toast 链路未动，分工语义由岛内呈现的排他性保证）。

**E. 交互规则**：peek 态胶囊单击维持收起（`isInteractiveIslandDescendant` 守卫 + 按钮 `stopPropagation` 保证 action 点击不冒泡成收起）；非产物 action 执行后调用 `onDismiss` 让岛让位，产物 action 走 Titlebar `openProductFile` 自带的消费+收拢流程；TTL 档位 A/B 维持 4.2s，action 档（空态舱）无 TTL 依赖（其出现本身来自显式单击）。

状态机（`islandController.ts`）与 Titlebar 派发协议未动——通知模型是 Island 渲染层的投影，控制器状态机保持原测覆盖。

## Alternatives considered

- **保留现有 peek 结构，仅换 CSS 皮肤**——最强理由是改动最小。否决驱动是三条硬编码 if-else 链不解决，每加一种通知仍要改 `JanusIsland.tsx`；视觉重做和模型抽象是同一刀。
- **复用桌面 Toast 栈做岛内通知（同一 store 双渲染）**——最强理由是零新增模型。否决驱动是 Toast 生命周期（右上角栈、自动消失、无 action 模型）与胶囊语义（栈顶单条、TTL 可常驻、可点击直达工作台）不匹配。
- **通知面板嵌入 monitor 右列（与产物/运行时面板并列）**——最强理由是复用面板栅格。否决驱动是仅 monitor 视图可见，chat/roundtable 下通知不可达；topbar 层托盘对三视图通用。
- **神眼微缩保留在 peek + LED 共存**——最强理由是保签名。否决驱动是神眼发光色承载 mode 语义、LED 承载 severity 语义，合并会打断 mode 色读取通道；微缩神眼在 48–96px 高度内辨识度不足。
- **Do nothing**——风格割裂永久存在，产物/知识之外每个新通知源都放大 `JanusIsland.tsx` 的耦合，空态死路损害单击手势的可发现性。

## Consequences

新增 `islandNotifications.ts` 模型层 + `08-janus-peek-capsule.css` + `tests/unit/janus/island-notifications.test.ts`（10 测试）；`JanusIsland.tsx` 退役三条文案链改为订阅投影栈顶并新增托盘/banner/pulse 状态；`JanusIslandExpandedShell.tsx` 新增徽标/托盘/banner 三块渲染与对应 props；01/02/07 的旧 peek 样式随之删除；i18n 双语新增 `janus:island.capsule.*` 键组并重生成 `types.ts`。获得：新增通知源只需在 `islandNotifications.ts` 加一个投影函数并入列 `assembleNotifications`，Island 组件零改动；一级/二级共用同一套令牌，读作同一系统的两级。

代价与边界：知识"无相关召回"特化空态暂以通用空态舱替代——`receiveKnowledgeTrace` 本就只上台 eligible 命中，零命中 trace 不留存，特化空态需先让空 trace 上台（重访信号：产品需要区分"没查"与"查了没有"时）。通知列表由活跃 props 派生而非累积 store，跨会话历史不存在（托盘"全部清除"只作用于当次会话 id）；`clearedIds` 只在组件生命周期内持久，岛卸载后清空。桌面 Toast 链路本次未加 `isIslandPresenting` 守卫——当前桌面 Toast 与岛通知的事件源无重叠（Toast 走 agent 完成事件，岛走知识/产物/维护），双发风险未兑现；两链路事件源出现交集时须先落守卫（明确的重访信号）。`main/office` 命名与 `product:` 通道拆分沿用产物工作区 Note 的既定重访信号，本次未触碰。
