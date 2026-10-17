---
{
  "schema": "harness-note/2",
  "id": "2665dc5e-c4fe-4a7f-a29a-7aac82af770b",
  "kind": "decision",
  "lifecycle": "draft",
  "created": "2026-10-17",
  "class": "architecture",
  "updated": "2026-10-17T09:55:00Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# 灵动岛下拉副黑板：卷帘格局、钉住语义与借调规则

## Problem

下拉拖拽手势（`src/renderer/src/components/janus/useIslandGesture.ts`，≥60px 阈值、弹性过阻尼 0.4/0.15、pull-hint 跟随）当前绑定 `setBlueprintMode(!blueprintMode)`（`JanusIsland.tsx` 的 `handleSwipeFlip`），把中央工作区整张卡片翻面到蓝图视图；`design/janus-island-hifi.html` S0 手势总表也把「下拉拖拽 ≥60px」定义为「翻转蓝图视图（flip）」。三个问题：其一，翻牌是一卡两面的互斥隐喻，看蓝图时终端区整体消失，参照与工作不能同屏，恰好加剧「所有东西挤在一个面板」的痛点；其二，蓝图入口冗余——`blueprintMode` 翻牌与右上 `WorkbenchSwitcher` 的 `activeWorkbench: 'blueprint'` 两套机制抢同一块地，动画语义分叉（`flipDuration`/`dragFlipProgress` 对工作台开关）；其三，翻牌有真实布局代价，`BrowserSurface` 在 `blueprintMode`/`isIslandDragging` 下要整体藏现原生视图。

## Decision

下拉手势改绑**副黑板（副工作区）**：从标题栏岛胶囊下拉 ≥60px 落下一条卷帘板，形成「上板下工」双带格局——板占顶带约 40–56% 高、下缘可拖，工作区在下带继续可见。

**格局取覆盖不取让位**。默认卷帘覆盖工作区顶带：被遮内容照常运行（遮视线不遮进程），内容几何（pty 列宽与滚动位置、页面布局）纹丝不动，上推收板零代价。板下缘 1px 发丝线作天际线，不做半透明纱帘——Electron 原生视图浮于 DOM 之上，带内必须物理遮挡，透明度救不回来。「让位」挤压模式（工作区压缩至下带、落定一次性布局结算）留作 v2 显式开关，不做下拉默认；产物工作区「中央列压缩至下限」的先例（[workspace 重构](./product-workspace.md)）属低频大切换，不套用到高频小手势上。

**判据取中断代价，不取能否交互**。收起时可 reload、可恢复的内容（原型、报告、预览）随便交互；中断有代价的内容（跑着的进程、未保存编辑、会话上下文）不上板。早期「黑板永不持有键盘输入」的规则作废——它与展开岛 chat composer 已收键盘输入的事实矛盾，且误伤交互原型这一核心场景。

**三种钉**：

| 钉型 | 内容 | 语义 |
| --- | --- | --- |
| 投影钉 | 蓝图活图（默认页签）、md 钉读、html/localhost iframe | 真身留工作区，板上是分身，双视图并存；收板卸载即可 |
| 借调钉 | 真浏览器 tab | WebContents 唯一实例换宿主矩形，工作区留占位卡；收板插值归还。iframe 盖不住通用网页（X-Frame-Options / CSP frame-ancestors），真网页只能借调 |
| 终端 | —— | 出局：不设交互终端，也不设输出 tail；盯输出走展开岛 monitor 与 RunOrb |

判定规则一句话：能造出廉价分身的走投影，造不出的走借调；两者都保证收板无代价。借调目前只有浏览器一个成员，规则通用——未来原生视图类内容（如 PDF 阅读器）直接套用。

**交互**：唤出走岛胶囊下拉 ≥60px（pull-hint 改「放下副板」语义）加键盘快捷键与标题栏微入口，布局按工作区持久化；单击 peek、双击控制台、长按启动、下拉黑板四手势正交，expanded 下复杂手势仍禁用。钉入口三种：拖文件/产物/对话引用到板上、文件树右键与产物卡「钉到黑板」、板内 `+` 选择器（过滤 html/md）；重复钉=聚焦已有。板内 1–2 大槽加板内小页签，不做自由拖窗（避免长出第二棵 pane 树）；钉头发丝线加悬停文字钮（刷新/跟随文件/打开真身/取消钉），遵守无色块与四级排版纪律（[运行配置分体卡片](./run-config-island-cards.md)的令牌管道）。iframe 内交互直通（点击、hover、输入、原型内导航）；`window.open`/`target=_blank` 拦截转发「浏览器真身」——打开真身即工作区浏览器 pane，板上钉保留。跟随文件开关 watch 源文件防抖刷新 iframe，串起「工作区改设计稿、黑板实时看」的设计迭代环。焦点与 Esc 分层：收板只走上推手势与板 chrome，绕开 iframe 焦点陷阱；焦点在 iframe 内 Esc 归原型，在板 chrome Esc 收板。借调 v1 限单槽；动画期原生视图走 freeze-frame 皮（`0770929` 已有），拖板高逐帧 setBounds；原生视图直角限制被「工作区直角加发丝线」纪律天然掩盖。

**入口收敛**：下拉不再翻牌后，`blueprintMode` 翻牌路径退役或并入黑板开关；蓝图完整入口只留右上 `WorkbenchSwitcher`（`activeWorkbench`），一入口一语义。蓝图不被丢弃——它是黑板的默认内容（活图页签），通知动作（打开蓝图/打开维护）可就地落到黑板。

## Alternatives considered

- 继续下拉翻牌放蓝图——最强理由是零改动且保住初衷。否决原因是互斥隐喻与双入口冗余正是痛点根源；问题不在蓝图内容，在「一面一内容」的格局。蓝图该做黑板默认内容，而不是手势的全部目的。
- 黑板做第二棵 pane 树、收交互终端/编辑器——最强理由是副工作区名副其实、真缓解 pane 拥挤。否决原因是两个焦点域、拖拽落点、快照恢复与 pty resize 全套成本，且卷帘可随手收起的自由会被「收起即打断工作」毁掉，痛点翻倍。
- 预览一律禁止交互——最强理由是保住零键盘输入不变量。否决原因是设计工作流的核心产出就是可点交互原型，不能点的原型等于截图；判据改为中断代价后不再需要这条禁令。
- iframe 冒充通用浏览器——大量站点 X-Frame-Options/CSP 拒绝嵌入，不可靠；本地页与 localhost 由 iframe 覆盖，真网页走借调。
- 默认让位挤压——最强理由是工作区 100% 可见。否决为默认是因为每次落板触发 pty resize、折行重排与页面 reflow，瞥一眼节奏下几何稳定优先；保留为 v2 显式开关，若用户长期开着再重议「工作区分屏目标」而非继续拧卷帘。
- 黑板改侧搭右列——最强理由是完全不遮工作区。否决原因是从顶部岛下拉的手势语义指向纵向卷帘，侧向属于右坞已有的另一套手势与布局语言。
- 终端给只读输出 tail 作为折中——用户明确砍掉；盯输出的需求由展开岛 monitor 与 RunOrb 承接，黑板边界因此更纯。

## Consequences

落地面：`useIslandGesture` 回调从 `setBlueprintMode` 改落板语义、卷帘板 chrome 与槽位、钉 store 与按工作区持久化、iframe 沙箱钉、md 钉读、蓝图活图页签、浏览器借调（占位卡 + freeze-frame + setBounds 归还）、跟随文件 watch、`blueprintMode` 收敛。视觉遵守 planche 纸底墨线、透明面板加 1px 发丝线、无色块填充（选中=文字+2px 强调条）与四级排版层次，板与主工作区同材质（[planche-theme](./requirements/planche-theme.md)）。`design/janus-island-hifi.html` S0 表「下拉拖拽 ≥60px → 翻转蓝图视图（flip）」一行由本决策取代。

修订条件：出现「板上要敲命令」的持续证据→重启终端议题（当前明确拒绝）；用户长期开让位模式→常驻共存改道工作区分屏，而非继续拧卷帘；出现第二个原生视图类内容→直接套借调钉规则。

**落地状态（2026-10-17，演示切片）**：手势已改绑——下拉 ≥60px 落卷帘板（`toggleBlackboard`），pull-hint 文案随 i18n；`IslandBlackboard` 组件落地钉头（页签/钉住/刷新/跟随文件/打开真身/取消钉/收起）、蓝图活图页签、html/md/text 投影钉（复用 `LocalFileStage`）、下缘 9px 拖高与 Esc 分层收板；浏览器原生视图按 `blackboardBottom` 让出顶带（`BrowserSurface` bounds 裁剪 + 订阅重报）。板高与钉布局持久化 localStorage。未做：借调钉、板内多槽、`blueprintMode` 翻牌路径退役、让位模式、从文件树/产物拖钉入口。
