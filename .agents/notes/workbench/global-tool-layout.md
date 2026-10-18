---
{
  "schema": "harness-note/2",
  "id": "57c74036-6700-47ea-abcc-1710c3962b5e",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-18",
  "updated": "2026-10-18T04:33:20Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# 全局工具实例与跨工作区分屏

## Problem

浏览器和 Markdown 原来只在当前工作区内查找实例；CPA 虽为应用级扩展，切项目仍将标签插入目标项目的焦点 pane。目标项目已有分屏时，工具位置、比例和宿主随之变化，也可能挤掉原来可见的终端。多个工作区若各自挂载同一个浏览器 surface，会争用原生视图的 bounds。

## Decision

用户确认采用双层布局。外层分隔项目区与全局工具区，内层分别保留项目分屏树和工具分屏树。切到已有两个终端分屏的 B 项目时，显示为 `[B 终端一 | B 终端二] | 工具区`。B 的整棵树及内部比例保留，外层比例和工具树不进入项目快照。

`stores/global-tools.ts` 拥有工具树、焦点、收起状态、外层比例、用户浏览器身份和 Markdown 选中归属。`GlobalToolsLayout` 的项目与工具容器保持稳定，`TerminalArea` 将工具只渲染一次，位于热工作区缓存之外。普通浏览器与 CPA 专用会话仍为不同 surface。无项目、空项目和删除活动项目均不关闭工具。

工具之间可以排序、分屏和合并；项目内容在项目区内操作。指针会话限定在源区域，原生拖拽与 store 落点也校验所属区域，不支持工具与终端同 pane 混排。工具栏不提供创建或结束终端控件。外层分隔线支持指针、方向键、Home/End 和双击恢复默认比例，内层分隔线不受影响。

宽度不足时自动收起工具区并保留展开入口。项目最小宽度按分屏树计算（叶片 240 px，横分按既有比例反推所需宽度、纵分取最大），工具预留 320 px；外层按用户比例分配空间，目标项目在该比例下放不下时收起工具而不挪动比例；拖动分隔线时限制在当前可用范围。窄窗手动展开工具时，项目仍挂载但隐藏；窄窗切换项目或从侧栏选择终端时重新收起工具以显示目标项目。收起同步隐藏原生网页，恢复后复用内容。

顶栏条目带已打开标记但保持可操作：再次点击激活标签并展开工具区。浏览器创建中的重复请求共用同一 Promise，额外 URL 打开为网页标签。弹出浏览器后保留全局身份，再次打开恢复并聚焦原窗口；回嵌仅由持有身份的主 renderer 接管，无项目时也可回嵌。销毁通知清理身份与呈现，CPA 通知不影响普通浏览器。

Markdown 全局界面不合并文稿归属。首次打开选择当前项目或全局，此后切项目和关闭重开保持所选归属；通过“文稿归属”显式选择全局、项目或遗留文稿。关闭面板不删除草稿。CPA 关闭页面释放网页呈现，托管服务继续运行；切项目不卸载 CPA。禁用或注销扩展清除全局标签和项目快照中的对应视图。

## Alternatives considered

沿用项目树搬移标签改动最少，但不能同时保留目标分屏和工具原位。为各项目保存工具落点映射可保留自由混排，但切换会改变工具位置，也需要原生宿主移交。独立工具区明确所有权，并复用已有 pane 渲染和拖拽，因此选择双层布局。

## Consequences

跨区域混排不再是工具入口的能力；对照终端与工具使用外层分屏。持续挂载会保留编辑器和网页占用，关闭标签才释放呈现。跨工作区保留不包含重启恢复：工具布局和草稿仍在内存中，导出才写入文件。本次不增加 Markdown 独立窗口，不改变仓库文件编辑器。

以后若必须将全局工具嵌入任意项目 pane，需重新设计落点映射和原生宿主所有权，不能简单共享 surfaceId。若工具数量或极端嵌套分屏持续导致收起，再评估最小尺寸与导航方式。

## Verification

本次定向单元测试六个文件通过 116 项：global-tools、extensions、browser-surface-manager、workspace-pane、workspace-front-surface、global-tool-entry。global-tools.spec.ts 最终通过 4 项，覆盖 A→B→A、组件身份与非零 bounds、内外比例、文稿归属、跨区拒绝、工具内分屏、窄窗展开与项目导航，以及指针和方向键／Home／End 调整。extensions.spec.ts 通过 6 项，原 pane-tab-drag.spec.ts 通过 21 项。

使用 artifacts/build-check 的独立构建运行 desktop-cpa.spec.ts，Browser／Markdown 长按关闭重开、CPA 登录跨项目与重启保留共 3 项通过；新增浏览器弹出、最小化后定位同一窗口和无项目回嵌通过 1 项。最终响应式细节调整后重跑 4 项布局页面测试及构建。严格 unused 类型检查、局部 ESLint、i18n 检查通过；Notes 校验和 diff 检查随提交完成。

命令：`npx vitest run tests/unit/global-tools.test.ts tests/unit/extensions.test.ts tests/unit/browser-surface-manager.test.ts tests/unit/workspace-pane.test.ts tests/unit/workspace-front-surface.test.ts tests/unit/global-tool-entry.test.ts`；`npx playwright test tests/e2e/global-tools.spec.ts tests/e2e/extensions.spec.ts --project=island --workers=1`。桌面以 `JANUS_E2E_MAIN_ENTRY=artifacts/build-check/main/index.js` 和隔离用户目录启动；相关日志、截图和 traces 位于 artifacts/global-tools 及 artifacts/global-tools-*.log。已检查纸面、深色和窄窗截图；未打包、替换或重启用户正在使用的便携版。

相关事实：[Markdown 入口与草稿](./markdown-pane-entry.md)、[标签拖拽](./pane-tab-reorder.md)、[CPA 服务集成](./service-integrations.md)、[浏览器原生视图](../desktop/browser-surface.md)。
