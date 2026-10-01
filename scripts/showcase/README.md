# JanusX 演示录制工具链（showcase v3）

真实应用实录：打包前 `out/` + Playwright 驱动真实鼠标，只产出 raw 帧 + manifest；合成时叠加米色 1080P 虚拟背景 + 标准虚拟鼠标 + 步骤字幕，输出 `wiki/assets` 成品。

旧链路（`scripts/capture-product.mjs` / `scripts/encode-product-gifs.mjs` / `showcase-pilot*.mjs`）已按需求直接删除，不归档。

## 文件

| 文件 | 用途 |
|---|---|
| `showcase-lib.mjs` | 合成公共库：米色 1080P 虚拟背景（纸面渐变 + 网格 + 印章点缀）、墨线卡片 + 硬阴影、标准虚拟鼠标（白箭头 + 点击红圈）、字幕条、双线性重采样、共享调色板 GIF 组装。画布 `1920×1080`，应用卡 `1760×884`，底部字幕区 |
| `showcase-caption.html` | 字幕条模板（Chromium 实渲染，保证中文清晰），分屏用 c1…c5 |
| `record-split-quad.mjs` | 分屏正式录制：左侧工作区展开 → claude/codex/opencode/pi 四终端 → 拖拽田字格 → 调分隔线。只产出 `.cache/showcase-split-quad/session-*/frames` + `manifest.json`（含鼠标轨迹） |
| `compose.mjs` | 统一合成：读 manifest（默认 `.cache/showcase-split-quad/latest.json`），输出 `wiki/assets/<out>.gif/png`（`--out`，默认 `terminal-split`） |
| `probe-models.mjs` | 工具：opencode `/models` 探针，查模型 ID 用 |

## 前置条件

- 构建：`out/main/index.js` 可启动（需 sibling `janus-agentX` 完整；否则用 `release/<ver>/win-unpacked/JanusX.exe` 并改 record 脚本的 launch）
- Playwright 浏览器已安装（`npx playwright install chromium`，字幕渲染用）
- GIF 工具装在仓库外：`%TEMP%\opencode\giftools`（`pngjs gifenc`），**禁止在仓库内 npm install**
- 四 CLI 已安装且本机有登录态：`claude / codex / opencode / pi`（录制复用登录态到一次性 fixture，**零模型调用**，跑完删除 fixture）

## 录制规范（v3）

- 输出：`1920×1080` 满幅；视口 `1760×884` 与应用卡 1:1，免重采样最清晰
- 帧率：运动段约 12fps（delay 8–10）；静止段单帧长延迟（delay 100–150），不占体积
- 缓动：指向 `easeOutExpo`；拖拽 `easeInOutQuad`；打字不用于演示（零模型调用）
- 节奏：建立定格 1.0s → glide → 悬停 0.45s → 点击（红圈）→ 结果定格 1.2–1.8s
- 字幕：底部干净区，Chromium 实渲染 chip，单条 ≤16 字
- 左侧工作区全程展开：侧栏 + 终端列表不许收起，c1 定格需同时看到工作区与四终端
- 终端就绪：先过首屏（claude 主题→文件夹信任 `↓+Enter`；codex 信任 `Enter`；opencode 等 logo；pi 等 prompt），`textContent` 轮询 settle（`innerText` 对隐藏 pane 返回空）
- 模型 pin 死：fixture `opencode.json` 写 `"model": "opencode-go/gpt-6-luna"`
- 凭证：仅复用本机登录态到一次性 fixture，跑完删除；凭证文件永不提交
- 已知噪音：PowerShell 会在仓库下写 `Microsoft/ModuleAnalysisCache`，录制前删掉

## 运行

```powershell
node scripts/showcase/record-split-quad.mjs
node scripts/showcase/compose.mjs            # --manifest <dir> --out terminal-split
```

## 新增演示

1. 复制 `record-split-quad.mjs` 为 `record-<功能>.mjs`，按「建立 → 指向 → 悬停 → 点击 → 定格」写节拍，鼠标轨迹写入 manifest
2. 字幕加进 `showcase-caption.html`
3. `compose.mjs --out <功能>` 出成品，逐张验货
