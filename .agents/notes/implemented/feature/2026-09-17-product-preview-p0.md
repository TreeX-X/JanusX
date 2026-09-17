# Agent Note: 产物工作区 P0 预览格式扩展

Status: implemented

## Problem

产物工作区只索引并渲染 `office/markdown/html`，`src/shared/product.ts` 把其余扩展一律判为 `unsupported`，`src/main/office/office-artifact-index.ts` 的跟踪集合与 `publicFileEntry` 守卫随之丢弃图片与数据文件，`ProductWorkspacePanel` 对 `unsupported` 只显示占位文案。AI 会话高频产出 `png/svg` 类图形与 `json/yaml/csv/txt/log` 类数据，中央编辑器经由 `file-classification.ts` 与 `ImageViewer` 可以手动打开这些文件，产物列却无法自动上台，生成即找的循环依然存在。

## Decision

`src/shared/product.ts` 拥有全部本地产物映射。`PRODUCT_IMAGE_EXTENSIONS` 覆盖 `png/jpg/jpeg/gif/svg/webp/ico/bmp`，`PRODUCT_TEXT_EXTENSIONS` 覆盖 `txt/log/json/jsonc/yaml/yml/xml/csv/tsv/toml`，`PRODUCT_LOCAL_EXTENSIONS` 是 `markdown/html/image/text` 四组的并集。`ProductKind` 增加 `image` 与 `text`，`productKindForPath` 按 `office > markdown > html > image > text` 的优先级判定，未命中者仍为 `unsupported`。主进程 `office-artifact-index.ts` 的 `isTrackedExtension` 与 `office-handlers.ts` 的 `publicFileEntry` 不改代码，经由 `isProductLocalExtension` 自动放行新增扩展，扫描预算与忽略目录保持原样。

`stores/productWorkspace.ts` 把 `image/text` 与 `md/html` 同等视为本地零端口 Tab，`openPreview` 不申请 `previewLease`，`reloadTab` 与 `watch` 覆盖只递增 `revision`。`ProductWorkspacePanel` 不分支新增种类，`unsupported` 以外的本地种类统一落入 `LocalFileStage`。`LocalFileStage` 按加载器分支：`image` 经由 `window.electron.file.readBinary` 取 `base64/mimeType` 并复用中央 `ImageViewer` 渲染，`svg` 以 `<img data:>` 承载且脚本永不执行；`text/markdown/html` 经由 `window.electron.file.read` 取文本，`text` 在 `PreviewScrollArea` 内以等宽 `<pre>` 只读呈现并在 512KB 处截断，`markdown/html` 走既有渲染链路且行为不变。产物列保持只读预览定位，编辑仍由中央编辑器拥有，`在编辑器打开`是跨列的唯一写入口。

## Alternatives considered

- 产物列 `text` 复用 `MonacoViewer` 只读编辑器——最强理由是与中央 `code` 观感完全一致。否决驱动是窄列无需游标、查找与模型生命周期，`<pre>` 足以承载只读浏览且无额外内存开销。
- 图片自写一套产物专用渲染——最强理由是可定制缩放工具条。否决驱动是用户明确要求两列同底层机制，复用 `ImageViewer` 让加载、空态与样式只有一个实现。
- Do nothing / reuse 手动打开——维持文件树手动寻找，零新增 IPC 与 store。成本是图片与数据产物的自动上台承诺落空，产物工作区退化为 Office 专用列。

## Consequences

- **Gains**: 产物索引、岛通知、监控分区与预览列对 P0 格式端到端打通，新增格式只需在 `src/shared/product.ts` 加一行映射并在 `LocalFileStage` 注册已有加载器组合，无需触碰索引、store 与面板。
- **Costs and limits**: `text` 预览不支持语法高亮与表格语义，`csv/tsv` 按纯文本呈现；图片无缩放平移，大图依赖浏览器原生滚动；`pdf/audio/video` 仍为 `unsupported`，`main/office` 目录名与 `office:files:changed` 通道名的历史包袱保留。`csv` 表格化、`pdf` 嵌入与 `shared/preview.ts` 单一映射是明确的后续重访信号，触发条件是 P1 需求立项。
