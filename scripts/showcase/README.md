# README 功能演示录制

一个功能对应一个 `record-*.mjs`：示例数据、操作步骤、断言和字幕都放在该脚本里。所有功能共用启动、鼠标、背景和 GIF 合成逻辑。脚本驱动真实 Electron 应用，截图中保留真实界面；虚拟鼠标和字幕在合成阶段叠加。

## 功能与入口

运行 `npm run showcase -- list` 可查看完整映射。成品位于 `wiki/assets/showcase/`。

| 功能 ID | 独立脚本 | GIF / PNG 文件名 |
| --- | --- | --- |
| `hero` | `record-hero.mjs` | `hero-planche` |
| `worktree` | `record-worktree.mjs` | `feature-worktree` |
| `session` | `record-session.mjs` | `feature-session` |
| `filetree` | `record-filetree.mjs` | `feature-filetree` |
| `split` | `record-split-quad.mjs` | `feature-split` |
| `browser` | `record-browser.mjs` | `feature-browser` |
| `markdown` | `record-markdown.mjs` | `feature-markdown` |
| `blueprint` | `record-blueprint.mjs` | `feature-blueprint` |
| `island` | `record-island.mjs` | `feature-island` |
| `product` | `record-product.mjs` | `feature-product` |

`hero` 是总览，其余九项对应 README 基础功能。`probe-models.mjs` 是手动诊断工具，不是功能录制入口。

## 准备与运行

先按根 README 安装项目依赖，再执行 `npm run build`，确保 `out/main/index.js` 是需要录制的版本。合成还需要 Playwright Chromium，以及安装在仓库外的 `pngjs`、`gifenc`：

```powershell
npx playwright install chromium
npm install --prefix "$env:TEMP/opencode/giftools" --no-save pngjs gifenc
```

默认从系统临时目录的 `opencode/giftools` 读取编码工具；其他位置可设置 `SHOWCASE_GIFTOOLS` 为包含 `node_modules` 的目录。录制应用本身不依赖这些编码工具，浏览器演示的原生视图截图合成除外。

```powershell
# 只更新一个功能：录制并合成
npm run showcase -- build product

# 多个功能按顺序独立运行
npm run showcase -- build browser markdown

# 分开执行，调整背景或鼠标后无需重录
npm run showcase -- record product
npm run showcase -- compose product

# 直接使用独立脚本也会更新该功能的 latest 指针
node scripts/showcase/record-product.mjs

# 指定录制目录、另存成品；参数支持空格或等号
node scripts/showcase/compose.mjs --manifest .cache/showcase/product-xxxxxx --out showcase/product-review --tempo 0.8
```

原始帧和包含字幕、鼠标位置的 `manifest.json` 保存在 `.cache/showcase/<功能>-<随机后缀>/`。成功录制才更新 `.cache/showcase/<功能>-latest.json`；失败返回非零退出码，`build` 随即停止，不会拿旧帧合成。合成只写指定功能的 GIF 与末帧 PNG。旧版缺少字幕的 manifest 需重新录制，已提交 GIF 不受影响。

各录制实例使用独立的临时用户目录。涉及 CLI 的脚本需要对应 CLI 已安装；`split` 需要 Claude、Codex、OpenCode、Pi，`session` 需要 Claude。现有 `seedFixture` 会复制本机 Claude / OpenCode 登录文件到临时目录，结束后清理。`product` 只用本地文件和 Shell，不复制登录文件，也不调用模型。蓝图默认只输入和悬停；显式设置 `JANUSX_LIVE_MAINTENANCE=1` 才会借用本机模型配置并发送真实请求。

## 调整公共参数

修改 [showcase-config.mjs](showcase-config.mjs)：

| 参数 | 控制内容 | 是否需要重录 |
| --- | --- | --- |
| `style.background` | 背景上下颜色、光晕、网格、暗角 | 否，重新合成 |
| `style.cursor` | 鼠标尺寸、填充、描边、点击圈半径 | 否，重新合成 |
| `style.ink / accent / misprint` | 外框、字幕与强调色 | 否，重新合成 |
| `style.theme` | 应用主题 | 是 |
| `timing` | 运动帧时长、悬停、点击、定格、逐字输入、移动步数 | 是 |
| 合成参数 `--tempo` | 整段播放延时倍数，`0.8` 更快，`1.2` 更慢 | 否 |

画布采用固定的 `1920×1080` 排版，应用视口 `1760×884`。`layout` 集中保存尺寸和落点；改变比例还需同步背景装饰与字幕区域布局。

`record-motion.mjs` 的延时参数以 **百分之一秒** 为单位，`timing.motion=4` 表示 40ms（运动约 25fps），`timing.hold=120` 表示 1.2 秒。manifest 的 `delay` 与 GIF 编码器统一使用 **毫秒**。应用等待用真实毫秒，等待界面就绪不会自动变成视频停顿。脚本里的显式节奏参数是该功能的局部覆盖；单独覆盖整套默认值可传 `snapper(page, rawDir, frames, shot, { hold: 160 })`。

## 修改一个功能

在对应脚本修改 `captions` 和操作序列。字幕与原始帧一起写入 manifest，重合成不读取别的功能脚本；`showcase-caption.html` 只负责字幕样式。

共享的 `snapper` 提供：

- `clickSnap(locator, caption, { double: true })`：移动、悬停、点击、退去点击圈；省略第三个参数为单击。
- `typeSnap(locator, text, caption)`：聚焦后逐字输入，支持中文。
- `dragTo(x1, y1, x2, y2, steps, caption)`：连续移动到起点、按下、缓动拖拽、释放。
- `rest(caption)`：在当前位置定格，保留鼠标。
- `glideTo(...) / snap(...)`：需要特殊镜头时使用；后续移动从上一帧的实际鼠标位置开始。

按「定位 → 操作 → 等待真实结果 → 定格」编排；关键步骤用 Playwright 断言验证，避免录到空面板仍报告成功。浏览器脚本通过 `shot` 参数补拍 WebContentsView，其他功能默认使用 renderer 截图。合成按时间线采样共享调色板，并逐帧编码，避免同时保留所有 1080p 原始图。

新增功能时创建一个 `record-<功能>.mjs`，在 `demos` 注册唯一脚本与产物文件名，然后补 README 引用。保存 manifest 时必须提供匹配的 `name`、`captions`、`frames`；`saveManifest` 校验字幕与功能映射，并补齐尺寸、数量和单位。

## 验证

```powershell
npm run test:showcase
npm run showcase -- build product
```

第一条验证鼠标连续性、点击拼接、中文输入、拖拽释放和延时单位；第二条在真实应用中验证文件提醒、HTML 交互、拖宽预览、JSON 结果、多标签切换和重新加载，并生成 GIF / PNG。录制后仍需查看成品，检查文字可读性与节奏。
