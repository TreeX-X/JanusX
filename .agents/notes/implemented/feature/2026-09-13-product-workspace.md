# Agent Note: 产物工作区彻底重构

Status: implemented

## Problem

JanusX 的生成文件预览是一条只为 Office 写的特例链路。中部终端列与右侧 `RightDock` 之间插着一列写死的 Office 预览列，类型锁死在 `docx/xlsx/pptx`，文件监听遇到 `md/html` 直接丢弃，`useOfficeStore` 的 Tab 容纳不下本地直读的种类。灵动岛一级展开与监控界面的产物分区同样只认识 Office 文件，外部六终端（`shell/claude/codex/opencode/janus/pi`）没有统一的上台协议。不重构的代价是每加一种文件类型就要复制一条 Office 链路。

## Decision

正交模块“产物工作区”（代码标识 `productWorkspace`）是生成文件唯一的中间展示列，UI 名固定为“产物工作区”。`src/shared/product.ts` 拥有种类映射（`office/markdown/html/unsupported`），`stores/productWorkspace.ts` 拥有 Tab 与工作区级产物列表，`components/product-workspace/` 拥有面板、文件列表、本地渲染与发现逻辑。Office 种类经由 office 引擎租用 `watch` 端口渲染（`OfficePreviewFrame` 复用），`md/html` 经由 `window.electron.file.read` 从磁盘直读渲染，零端口。主进程改动只放开产物索引的扩展名集合（`office-artifact-index.ts` 与 `publicFileEntry`），`startPreview` 的 Office 守卫、`watch` 租约池、安装器、`buildPrompt` 后端保持原样。

触发协议以文件落盘为唯一事实源，不解析任何终端输出。索引产出统一事件经由既有 `office:files:changed` 通道，隐式自动上台沿用基线加增量通知语义。记录粒度只到工作区，不做终端级归因。产物工作区打开时中央终端列压缩至下限，`RightDock` 进入强制收起态（`getRightDockLayout` 的 `stageRendered` 条件），列宽 `320~640px` 可拖拽。灵动岛一级展开（`product-notice/product-consume`）单击直接打开产物工作区并触发两侧收缩。监控界面的 Office 分区改名为产物工作区，按工作区列出生成文件，点击加载链路与灵动岛单击一致。

预览面形态（同日同步）：产物目录的唯一展示位是灵动岛一级提醒与监控界面产物分区，预览列顶部不再重复全量文件列表——预览列只承载用户点开过的文件，水平 tab 即开即显，空态提示前往岛/监控打开（`editor:product.emptyStage`）。监控界面与岛通知点击文件即直接加载预览：tab 创建与文件读取和舞台挂载在同一提交内完成，无延迟队列。md/html 直读 iframe 沙箱放开 `allow-forms/allow-modals/allow-popups` 允许页内点击交互，仍禁 `allow-top-navigation` 防劫持主窗口；预览滚动条改走黑灰谱系（thumb 亮灰、track 近黑微透），与岛通知胶囊同调，弃用橙色。

旧 UI 壳（`OfficePreviewPanel`、`OfficeFileList`、`officeDiscovery`、`stores/office`、`officeResize`、`OfficePromptPreview`）随本次删除，不保留兼容分支。`json` 暂不纳入范围。

## Alternatives considered

- 在 Office 链路上打补丁（加 `md/html` 分支，保留 `office:` IPC 与 `useOfficeStore`）——最强理由是零删除、风险最小。否决驱动是类型与布局全部写死，每加一种类型都是一次特例复制，维护成本随类型数线性增长。
- 把预览做进右侧 `RightDock` 新 tab，而非中间独立列——最强理由是复用宽度持久化与收起逻辑。否决驱动是文档类内容需要 `480px+` 宽度，`RightDock` 上限 `420px` 且与 `files/git` 共用单活 tab，打开文档会挤掉用户正在看的上下文。
- Do nothing / reuse 手动打开——维持文件树手动寻找，零新增 IPC 与 store。成本是生成即找的循环永久存在，外部终端与 `janus-cli` 的生成物依然不可见。

## Consequences

产物侧新增一个 store、一个面板目录与一个共享类型模块，旧 UI 壳的六个文件被删除，`App` 布局、`Titlebar` 发现订阅、灵动岛、`RightDock` 布局参数随之改名。预览列改为纯 tab 形态时 `ProductFileList` 与列表骨架屏一并退役，`editor:product` 的 `refreshHint/selectFromList/noProducts/fileListUnavailable` 键同批移除。获得的是单一展示列与按工作区的自动上台，所有六终端与外部 MCP 终端走同一条文件事件通道。代价是主进程 `office:` 通道名与 `main/office/` 目录名保留了 office 字样，`buildPrompt` 后端无人调用但继续维护；`md/html` 的索引复用了 Office 产物索引的扫描预算。`main/office` 改名与 `product:` 通道拆分是明确的后续重访信号，触发条件是 `janus-agentX` 原生事件落地或 MCP 产物工具需要独立版本时。`json` 纳入同样走新增 `Renderer` 一行映射，不碰现有结构。
