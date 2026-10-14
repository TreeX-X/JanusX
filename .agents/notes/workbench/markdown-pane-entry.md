---
{
  "schema": "harness-note/2",
  "id": "658f6a13-21ad-40b6-ade0-29c3eed3f923",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-13",
  "updated": "2026-10-14T09:10:00Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Markdown 独立 pane 与顶栏工具分组

## Intent

用户要求把现有底部 Markdown 功能提升到顶部入口，作为中央工作区的独立 pane 使用，底部不再承载 Markdown；浏览器、Docker、Markdown 三个入口组成一组，与蓝图入口隔开。本文分析现有 `QuickNote` 的迁移，不表示 UI 已实现。Docker 的工作台承载由 [Docker 面板入口](./docker-management-entry.md)拥有；该文 2026-10-14 起改为自研方向，不再接入 Portainer，其顶栏图标与环境下拉已随之移除。

## Current behavior

`TerminalArea.tsx` 在底部抽屉中切换上下文监控与 Markdown。`QuickNote.tsx` 只在存在 `activeTerminalId` 时呈现，否则显示“无活动终端”。`Ctrl/Cmd+Shift+N` 的监听也在 `TerminalArea` 内，空 pane 树时不能靠它打开编辑器。

`stores/draft-card.ts` 已使用 DraftCard 命名，但正文和选中草稿仍按 `terminalId` 分组，只存在 renderer 内存中。主动删除终端会经 `applyTerminalDraftLifecycle('kill-removed', terminalId)` 清掉对应草稿；切换工作区或自然退出本身不会清掉它们。当前只有显式导出会写入用户选择的文件，重启后的草稿恢复尚未实现。

编辑器已有草稿列表、十五项格式动作、快捷键、原生撤销、列表续写、缩进、编辑/对照/预览三模式、字数统计及 md/txt/html 导出，可以复用这些能力。迁移前小于 520 px 会直接隐藏草稿列表，且没有替代入口——有草稿时连"新建"都点不到，因此迁移为可缩窄的 pane 时必须把折叠做成可操作的。

## Agreed direction

浏览器、Docker、Markdown 常驻 Titlebar，作为一组打开中央内容的工具入口；蓝图与知识库保留工作台分组。两组之间有独立间距和短竖分隔线，Markdown 不加入 `WorkbenchSwitcher` 或 `ActiveWorkbench`，也不画成与蓝图连续的同一组按钮。

```text
[窗口控制] JanusX/设置      灵动岛      [浏览器] [Markdown]    │    [蓝图] [知识库]
```

建议沿用顶栏 24 px 按钮和现有描边图标，组内间距 6 px，组间各留 12 px，分隔线约 14 px 高。Markdown 复用现有折角文件加 M 的 `MarkdownIcon`。两项均有名称提示与键盘焦点（Docker 入口随 Portainer 接入移除，自研面板的入口形态待该文另定）。没有可见工作台按钮时收起两组之间的分隔线。实现要给右侧两组预留宽度，避免现有居中灵动岛与新增入口重叠。

三个工具入口的主操作均为打开或定位已有 pane，重复点击保持内容打开。点击时切回工作区正面并收起遮挡中央区的工作台，打开成功后聚焦目标 pane；关闭内容通过工作区标签的关闭控件完成。蓝图和知识库保留原有工作台开关语义。

## Recommended pane interaction

首版每个工作区复用一个 Markdown 面板，内部保留草稿列表和当前文稿编辑器，避免迁移时同时重做多文档导航。顶部点击优先定位已有 Markdown 面板；没有则创建一个。中央无内容时占满工作区；已有内容时建议在当前 pane 旁并列打开，窄窗口可先进入当前 pane 的新标签。重复点击不重复建草稿或分屏。无文稿时显示“新建 Markdown”，已有文稿时恢复上次选中项。

Markdown 是新的 pane 内容类型，而非浏览器网页。整个面板可拖到上下左右边缘分屏、拖到中央合并为标签，并使用工作区分隔线调整比例。面板内的“对照”是源码与预览的局部布局，与工作区分屏分别控制；切换模式不改变外部 pane 树。草稿列表在窄 pane 中折叠为可打开的文稿选择入口，格式、模式、新建、导出及关闭控件保持可达。复用已修复的[标签滚动与固定操作区](./pane-tab-reorder.md)，内容多时只滚动标签区。

草稿列表折叠（2026-10-14 落地）：小于 520 px 自动折成 36 px 导轨，导轨上保留展开与新建两个一击可达的控件和草稿计数；展开后列表收窄到 160 px，别把编辑器挤得比工具栏还窄。导轨与工作区侧栏收起态同一套语言（`PanelLeftOpen` / `PanelLeftClose` + `aria-expanded` / `aria-controls` 指向真正被折叠的列表）。折叠是默认而非锁定：手动折叠/展开是显式选择，只在当前宽度区间内有效，pane 拖过 520 px 阈值时重新听该侧默认。宽 pane 里同样可以手动折叠，把 full width 让给编辑器。

折叠动画（2026-10-14 追加）：轨道宽度走 `transition: grid-template-columns 280ms cubic-bezier(0.16, 1, 0.3, 1)`，与蓝图/知识库工作台侧栏同一曲线和时长——点击后列表是滑出去的，不是闪掉的（用户原话“需要加载效果”，与[右导轨折叠控件](./right-rail-toggle-motion.md)当年“read as loading in rather than flashing”是同一诉求）。列表与导轨交叉淡入淡出而非二选一硬切：两侧都保持挂载，用 `opacity` + `visibility` 过渡，`visibility` 在淡出时延迟到透明度走完。因为两侧始终挂载，纯 CSS 就够，不需要 `useAnimatedOpen`——那个 hook 解决的是“freshly mounted 的元素跑不了 transition”，这里不适用。淡出侧用 `visibility: hidden` 而非只降 opacity，卡片按钮随之退出 tab 序（已实测 `.focus()` 不会移过去）。导轨 `position: absolute; inset: 0` 叠在列表上，不占弹性布局：这样两侧能同时存在完成交叉淡入淡出，且 `.sidebar` 的 1px 右边框始终贴在轨道边缘。拖分隔线改 pane 宽度不触发该 transition（计算值没变，只有 1fr 轨道在吸收），只有跨过 520 px 阈值的那次折叠才动画——否则拖动会一直被 280ms 拖着走。`prefers-reduced-motion: reduce` 下全部关掉。

折叠动画的坑（2026-10-14 实测后修正）：交叉淡入淡出看起来只是两边各加一条 transition，但**延迟加错一侧就会产生残影**。第一版给导轨的基础规则（=展开时的出场侧）也加了 120ms 延迟，结果旧内容在全透明度上多留 120ms，和新内容叠在一起——逐帧测下来展开时列表与导轨的同时透明度峰值达到 **0.95**，导轨的展开/新建/计数按钮像残影一样压在草稿卡片上。规则是：**延迟只加在进场侧，出场侧一律 0 延迟**，两个方向都是“旧的先走、新的再来”。修正后折叠峰值 0.017、展开峰值 0.137。另一半残留来自内容压扁：轨道从 200px 滑到 36px 时列表跟着重排，文字边淡边融化。修法是把内容宽度冻在展开态（`width: var(--note-list-width)`）+ `.sidebar { overflow: hidden }`，让列表是被裁出去的而不是被压扁的——截图上“Second draft”从中段截断（保留原有排版）而不是换行，即为生效。

Markdown 移走后，底部仅保留上下文监控，不保留第二个 Markdown 编辑器或入口。纯文稿与浏览器工作区可以隐藏空监控条。顶栏与 `Ctrl/Cmd+Shift+N` 均从全局调用同一打开逻辑，不依赖终端或底部抽屉已挂载。

无项目时使用全局临时 pane 与全局草稿作用域；选择项目不隐式把全局草稿归到该项目，也不丢失已有内容。已有项目时使用工作区作用域，切换项目恢复各自文稿。全局临时 pane 的承载需与浏览器、Docker 一起实现，当前 `buildWorkspaceTerminalSurfaces` 仍要求活动 workspace ID。

## Draft ownership and lifetime

建议把草稿归属从终端改为工作区或全局作用域，保留稳定 `draftId`，终端来源只作可选元数据。关闭 Markdown 标签表示关闭呈现；删除文稿是独立动作。删除或结束终端不能再删除文稿。选中草稿、编辑模式、选区与滚动位置需要独立于 pane 的挂载位置保存，分屏、合并和切换工作区后继续编辑同一正文；只有可见且被用户激活的编辑器取得焦点。

独立文稿应自动保存并支持重启恢复，建议复用应用自己的持久化边界保存按作用域组织的草稿。界面区分“保存中”“已保存”和失败后的重试，避免把内存更新称为耐久保存。导出仍写入用户选择的普通 md/txt/html 文件。应用草稿与蓝图的 repository Notes 保持各自数据身份；创建草稿不自动创建 `.agents/notes` 文档。普通仓库 Markdown 文件的打开和编辑继续走既有文件编辑器，本次只迁移底部编辑器。

迁移当前会话中还能取得的旧终端草稿时，保留 ID、标题、正文和时间，按终端所属工作区归入对应作用域；无法确认工作区的内容放到可恢复的旧草稿列表。原实现没有耐久保存，因此无法靠这次迁移恢复以前已随重启丢失的内容。取消终端清理钩子前先完成作用域迁移与保存，不能通过清空旧 store 完成改名。

当前“粘贴到终端”默认依赖活动终端，Markdown 获得 pane 焦点后 `activeTerminalId` 应与其他非终端内容一样为 null。推荐把“复制”作为通用动作，把“粘贴到终端”变成选择本工作区有效终端的可选动作，可记住上次目标但使用前重新校验；没有终端仍可正常写作，不替用户创建终端。

## Implementation implications

| 边界 | 必要调整 |
|---|---|
| 顶栏与全局打开逻辑 | 三项工具独立分组，与工作台分隔；统一切回正面和激活语义；快捷键移出底部组件 |
| pane 树与工作区 store | 新增 `markdown` 内容和按作用域定位；更新快照保留筛选、关闭、移动与边缘分屏；不能只加渲染分支 |
| Markdown 编辑器 | 从 terminalId props 解耦，复用编辑、格式、预览和导出；按 pane 可见性管理焦点，窄宽时保留文稿选择 |
| 草稿与持久化 | 工作区/全局作用域、稳定 ID、旧草稿迁移、自动保存和重启恢复；停止终端删除清理 |
| 底部监控 | 移除 Markdown tab、编辑器与打开快捷键，保留上下文卡片与调高能力 |

当前 pane 快照筛选只保留 browser 和本工作区 terminal，直接新增 Markdown 而不改筛选会在切换工作区时丢掉呈现。拖拽控制器按内容 ID 工作，但边缘落点的执行分派只识别 terminal/browser，因此也要加入 Markdown 处理；渲染、排序成功不代表分屏已接通。

## Validation to plan

实现应覆盖：无终端与无项目时打开；蓝图背面回正面；重复点击复用；纯 Markdown 和与浏览器/终端混合分屏；移动与关闭后正文保留；终端删除后文稿保留；项目切换及重启恢复；草稿保存失败；窄 pane 切换草稿和操作工具；编辑撤销、快捷键、导出回归。顶栏工具组与内置浏览器视图的命中和遮挡还需在真实 Electron 里验证（Docker 环境下拉已移除，不再属于验证面）。

## Open questions

顶部入口、与蓝图分组及移出底部是用户已确定的方向。首版按工作区复用一个 Markdown 面板、草稿持久化形式属于本文建议，可在实现时依现有布局与保存服务确定；窄窗策略已定为可操作折叠，不再是开放问题。单篇文稿各自占 pane、Markdown 独立窗口和仓库文件接入尚未纳入首版；浏览器支持弹出窗口不代表新的 Markdown 内容已具有独立窗口生命周期。

## Status

2026-10-14 已实现顶栏工具入口与 Markdown 独立 pane，实现记录见 [Docker 管理入口 Task](./tasks/docker-management-entry.md) 的 Progress；其中 Docker 一项已随 Portainer 转向移除，顶栏现余浏览器与 Markdown。当日并落地草稿列表的可操作折叠（见 Agreed direction）。仍未做的：草稿自动保存与重启恢复（当前纯内存）、单篇文稿各自占 pane、Markdown 独立窗口、仓库文件接入。原"未实现"表述作废。
