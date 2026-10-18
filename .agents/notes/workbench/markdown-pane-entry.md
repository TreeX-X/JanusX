---
{
  "schema": "harness-note/2",
  "id": "658f6a13-21ad-40b6-ade0-29c3eed3f923",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-13",
  "updated": "2026-10-18T04:33:20Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Markdown 独立 pane 与顶栏工具分组

## Intent

记录 Markdown 独立工具入口、文稿归属及窄 pane 行为。全局布局已实施，草稿耐久保存仍为后续需求。

## Current behavior

Markdown 已从底部抽屉迁到顶栏工具箱，与浏览器及声明 tool-menu 的扩展共用菜单，与蓝图／知识库分组隔开。底部只留上下文监控。工具箱重复点击定位原实例，已打开条目带标记但不禁用；无项目和无终端时同样可用。

Markdown 使用[全局工具区](./global-tool-layout.md)的单个入口实例，内部承载草稿列表和编辑器。面板在工具区内排序、分屏与合并，不与项目终端混排。切项目不改变工具布局、当前文稿或所选归属。编辑／对照／预览属于编辑器局部布局，不改变外部 pane 树。

首次打开选择当前工作区或全局归属；之后由“文稿归属”显式选择项目、全局和遗留文稿。删除工作区后，旧文稿仍可从归属列表访问。全局面板 ID 与 scopeId 分开，关闭重开保留上次归属及选中文稿。关闭标签只移除呈现，删除文稿是独立动作；结束或删除终端不删除文稿。

QuickNote 复用格式动作、快捷键、原生撤销、列表续写、缩进、字数统计及 md/txt/html 导出。切项目时全局组件保持挂载，编辑选区、模式及滚动不因项目缓存替换而丢失；工具分屏／合并可能重挂载编辑器，正文和选中文稿由 draft store 保留，局部模式与选区不承诺跨重挂载恢复。

## Narrow panes

小于 520 px 时草稿列表折成 36 px 导轨，保留展开、新建和计数；展开列表宽 160 px。手动选择在当前宽度区间内有效，跨过 520 px 阈值后重新采用区间默认值。宽 pane 也可手动折叠。

列表和导轨均保持挂载，轨道宽度使用 280ms 过渡，文字通过裁切避免压扁重排。淡入淡出延迟只加在进场侧，出场侧立即淡出；不可见内容通过 visibility 退出焦点序列。减少动态效果偏好下关闭动画。整个工具区空间不足时可另外收起和展开，不会摊平项目分屏。

## Draft ownership and lifetime

draft-card store 按工作区／全局 scopeId 保存文稿，terminalId 仅作可选来源。旧终端草稿按仍可找到的终端所属项目迁移，无法确定归属的内容保留在 legacy-terminal 分组；不通过清空 store 迁移。MarkdownPane 可选择遗留分组。

草稿只在 renderer 内存中，更新正文不等于耐久保存。导出写入用户选择的文件；重启恢复、保存状态及失败重试尚未实现，不属于本次全局布局范围。仓库 Markdown 仍由文件编辑器打开，草稿不会自动创建 repository Notes。单篇文稿独立 pane、Markdown 独立窗口和仓库文件接入仍在本次范围之外。

## Verification

全局化测试与约束见[全局工具实例与跨工作区分屏](./global-tool-layout.md)。global-tools.test.ts 验证关闭重开、项目切换与草稿保留；global-tools.spec.ts 验证归属不随项目变化、工具内部拖拽和窄窗恢复。早期编辑器能力与折叠动画的记录见[Docker 管理入口 Task](./tasks/docker-management-entry.md)，其 Docker 项后续改为自研方向，与 Markdown 生命周期无关。
