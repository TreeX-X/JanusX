---
{
  "schema": "harness-note/2",
  "id": "034fb695-ff94-5476-b085-9818bcbef5c1",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-13",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-13-agent-note--034fb695.md",
      "sourceHash": "0bd18ce08a79210135bd8a8bfefa0882eb25db9c485276095d30601ebe437ea4",
      "originalBodyHash": "81582fef1879c468739e17fb58cbe8c460cfbdee4e180480358fd5aabf5f8764",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents 产物工作区彻底重构. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-13-product-workspace.md",
        "sourceHash": "0bd18ce08a79210135bd8a8bfefa0882eb25db9c485276095d30601ebe437ea4",
        "originalBodyHash": "81582fef1879c468739e17fb58cbe8c460cfbdee4e180480358fd5aabf5f8764"
      }
    }
  },
  "updated": "2026-10-15T02:45:34.347Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---
# 产物工作区彻底重构


## Problem

JanusX 的生成文件预览是一条只为 Office 写的特例链路。中部终端列与右侧 `RightDock` 之间插着一列写死的 Office 预览列，类型锁死在 `docx/xlsx/pptx`，文件监听遇到 `md/html` 直接丢弃，`useOfficeStore` 的 Tab 容纳不下本地直读的种类。灵动岛一级展开与监控界面的产物分区同样只认识 Office 文件，外部六终端（`shell/claude/codex/opencode/janus/pi`）没有统一的上台协议。不重构的代价是每加一种文件类型就要复制一条 Office 链路。

## Decision

正交模块“产物工作区”（代码标识 `productWorkspace`）是生成文件唯一的中间展示列，UI 名统一为“预览”。`src/shared/product.ts` 拥有种类映射（`office/markdown/html/unsupported`），`stores/productWorkspace.ts` 拥有 Tab 与工作区级产物列表，`components/product-workspace/` 拥有面板、文件列表、本地渲染与发现逻辑。Office 种类经由 office 引擎租用 `watch` 端口渲染（`OfficePreviewFrame` 复用），`md/html` 经由 `window.electron.file.read` 从磁盘直读渲染，零端口。主进程改动只放开产物索引的扩展名集合（`office-artifact-index.ts` 与 `publicFileEntry`），`startPreview` 的 Office 守卫、`watch` 租约池、安装器、`buildPrompt` 后端保持原样。

触发协议以文件落盘为唯一事实源，不解析任何终端输出。索引产出统一事件经由既有 `office:files:changed` 通道，隐式自动上台沿用基线加增量通知语义。记录粒度只到工作区，不做终端级归因。产物工作区打开时中央终端列压缩至下限，`RightDock` 进入强制收起态（`getRightDockLayout` 的 `stageRendered` 条件），列宽 `320~640px` 可拖拽。灵动岛一级展开（`product-notice/product-consume`）单击直接打开产物工作区并触发两侧收缩。监控界面的 Office 分区改名为产物工作区，按工作区列出生成文件，点击加载链路与灵动岛单击一致。

预览面形态（同日同步）：产物目录的唯一展示位是灵动岛一级提醒与监控界面产物分区，预览列顶部不再重复全量文件列表——预览列只承载用户点开过的文件，水平 tab 即开即显，空态提示前往岛/监控打开（`editor:product.emptyStage`）。监控界面与岛通知点击文件即直接加载预览：tab 创建与文件读取和舞台挂载在同一提交内完成，无延迟队列。md/html 直读 iframe 沙箱放开 `allow-forms/allow-modals/allow-popups` 允许页内点击交互，仍禁 `allow-top-navigation` 防劫持主窗口；预览滚动条改走黑灰谱系（thumb 亮灰、track 近黑微透），与岛通知胶囊同调，弃用橙色。

旧 UI 壳（`OfficePreviewPanel`、`OfficeFileList`、`officeDiscovery`、`stores/office`、`officeResize`、`OfficePromptPreview`）随本次删除，不保留兼容分支。`json` 暂不纳入范围。

预览界面的标题、关闭提示、岛入口与监控分区统一显示“预览”（英文 Preview），内部 productWorkspace 标识保留。Markdown／文本底色和文字、加载／错误状态、Office 外层按钮、滚动条与加载圈读取语义主题变量；HTML 与 Office iframe 的页面底板保留白色，生成文档自身的样式不被应用主题覆盖。共享 Markdown 复制反馈使用已定义的 --accent-mid。

主题资源仍由 src/shared/theme/definition.ts 集中管理；npm run theme:audit 输出 renderer 的硬编码颜色、主题专属 CSS 和无法找到静态定义的变量的文件／行／列，历史项按文件、种类和值计数保留为迁移清单，必要固定色登记次数和原因。npm run theme:check 校验生成 CSS 与新增扫描项，已接入 verify。静态扫描不证明变量作用域、每种主题的对比度或外部文档适配，新增主题仍需完整性与实际界面验证；维护说明见 [主题系统](../../../src/shared/theme/README.md)。

验证：`npx vitest run tests/unit/theme-audit.test.ts tests/unit/product/product-workspace.test.ts tests/unit/theme-registry.test.ts tests/unit/planche-theme.test.ts` 49 项通过。`npx playwright test tests/e2e/product-preview.spec.ts --project=island --workers=1 --output=artifacts/product-preview` 3 项通过，使用真实预览组件与替身文件 IPC，覆盖双主题底色和文字、打开文档后切换主题、复制反馈、加载圈、Office 错误按钮及 HTML 自身背景；截图已人工查看。CLI 负向探针验证新增颜色／缺失变量与过期生成 CSS 均被拒绝。`theme:check`、类型、构建、翻译、Note 校验及改动组件 ESLint 通过；未运行完整 verify 或 Electron 实机 Office 渲染，Note 校验保留 17 条既有外部链接诊断。

## Alternatives considered

- 在 Office 链路上打补丁（加 `md/html` 分支，保留 `office:` IPC 与 `useOfficeStore`）——最强理由是零删除、风险最小。否决驱动是类型与布局全部写死，每加一种类型都是一次特例复制，维护成本随类型数线性增长。
- 把预览做进右侧 `RightDock` 新 tab，而非中间独立列——最强理由是复用宽度持久化与收起逻辑。否决驱动是文档类内容需要 `480px+` 宽度，`RightDock` 上限 `420px` 且与 `files/git` 共用单活 tab，打开文档会挤掉用户正在看的上下文。
- Do nothing / reuse 手动打开——维持文件树手动寻找，零新增 IPC 与 store。成本是生成即找的循环永久存在，外部终端与 `janus-cli` 的生成物依然不可见。

## Consequences

产物侧新增一个 store、一个面板目录与一个共享类型模块，旧 UI 壳的六个文件被删除，`App` 布局、`Titlebar` 发现订阅、灵动岛、`RightDock` 布局参数随之改名。预览列改为纯 tab 形态时 `ProductFileList` 与列表骨架屏一并退役，`editor:product` 的 `refreshHint/selectFromList/noProducts/fileListUnavailable` 键同批移除。获得的是单一展示列与按工作区的自动上台，所有六终端与外部 MCP 终端走同一条文件事件通道。代价是主进程 `office:` 通道名与 `main/office/` 目录名保留了 office 字样，`buildPrompt` 后端无人调用但继续维护；`md/html` 的索引复用了 Office 产物索引的扫描预算。`main/office` 改名与 `product:` 通道拆分是明确的后续重访信号，触发条件是 `janus-agentX` 原生事件落地或 MCP 产物工具需要独立版本时。`json` 纳入同样走新增 `Renderer` 一行映射，不碰现有结构。
