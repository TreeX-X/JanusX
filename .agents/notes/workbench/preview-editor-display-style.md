---
{
  "schema": "harness-note/2",
  "id": "dfdaad8f-cf1b-40f5-8509-9a5d97bfb876",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-20",
  "updated": "2026-10-20T16:45:45Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# 预览编辑窗口显示风格与外壳 UI 对齐方向

## Intent

用户认可 opencode 的文件编辑显示风格，希望双击预览编辑窗口（`StandaloneFileEditor` 双宿主）的编辑器与差异显示向其靠拢；同时窗口外壳自身的 tab 与控件设计和应用整体语言有出入，届时一并 UI 优化。本文记录 2026-10-21 的调研结论、差距清单与落地映射；实现尚未开始，不改动 [文件编辑窗口与预览体验](./file-editor-experience.md) 与 [统一文件窗口与内嵌／浮窗路由](./unified-file-window.md) 的已确认设计。

调研对象为 anomalyco/opencode（GitHub，dev 分支源码）的双端文件编辑显示实现：TUI 侧 `packages/tui/src/component/patch-diff.tsx` + `@opentui/core` 的 `DiffRenderable`；Web/Desktop 侧 `@pierre/diffs` + `packages/session-ui/src/pierre/index.ts` 风格覆写 + `packages/ui/src/data-display/diff-changes/`；主题推导在 `packages/tui/src/theme/system.ts`。

## opencode 文件编辑显示风格

| # | 特征 | 细节 |
|---|---|---|
| 1 | 行号列是独立色带 | gutter 有自身背景（added/removedLineNumberBg），重于正文行底色；正文行底色极淡（亮 5% / 暗 10% alpha） |
| 2 | 2px 变更指示条 | pierre `diffIndicators: "bars"`，行号列前 2px 竖条（绿/红），是主变更信号而非大面积填充 |
| 3 | 词级高亮 | `lineDiffType: "word-line"`，词强调底色约为行底色 4 倍（20%/40%） |
| 4 | 行号文字着色 | 默认 text-faint；增删行号分别染绿/红（亮 green-900 / 暗 green-400 系） |
| 5 | 不变区折叠 | `expansionLineCount: 20` + `hunkSeparators: "line-info-basic"`，超阈值未变上下文折叠为可展开分隔行 |
| 6 | +N/−N 计数徽标 | `DiffChanges` 组件 mono 小字（11–14px），绿 +N 红 −N，配 A/D/M 16px 状态字母 |
| 7 | 分栏/统一双模式 | 默认 unified 可切 split；TUI 分栏时每栏各自单列行号 |
| 8 | 主题由调色板推导 | `tint(bg, green/red, alpha)`：暗 0.22 / 亮 0.14 行 tint，gutter 在 context bg 上再 tint 一层 |
| 9 | 排版 | mono + font-feature-settings、行高 24px、tab 2、行号最小 3ch、hover 双高亮、无 minimap |

## JanusX 现状对照

链路：`StandaloneFileEditor` → `FileViewerContent` → `MonacoViewer`（Monaco 0.55.1；普通编辑默认，显式"与 HEAD 比较"才进 DiffEditor）。

已对齐（[Monaco diff single line number](../terminal/monaco-diff-single-line-number.md) 已明确"matching the opencode split/unified view"）：分栏单行号 + 窄容器真 inline 回退（`renderSideBySideInlineBreakpoint: 800` + `useTrueInlineView`）、`lineNumbersMinChars: 3`、minimap 关闭、差异视图为显式选择。

差距：

| 差距 | JanusX 现状 | opencode |
|---|---|---|
| 底色权重 | 正文行 ≈18%、gutter ≈20% 两者接近 | 正文 5–10%、gutter 明显更重，色带在 gutter 不在正文 |
| 2px 指示条 | `renderIndicators` 仅小三角 | 竖条是主变更信号 |
| 行号着色 | 单色（`#444`） | 增删行号染色 |
| 不变区折叠 | 无 | 20 行阈值折叠成分隔行 |
| +N/−N | 无 | 文件头/tab 常显 |
| 词级强调 | 有（33%） | 行:词 = 1:4 层级 |
| 行高/tab | 默认（~20px / tab 4） | 24px / tab 2 |

## 落地映射

- **A 纯主题 token**（`src/shared/theme/definition.ts`）：`diffEditor.inserted/removedLineBackground` 降至约 8%，`diffEditorGutter.*` 提至约 25–30%，形成"色带在 gutter、正文薄纱"；词强调按 1:4 微调。
- **B Monaco 选项**（`MonacoViewer.tsx` diffOptions）：`hideUnchangedRegions`（contextLineCount/minimumLineCount/revealLineCount 取 20）对齐 hunk 折叠；diff 模式 `lineHeight: 24`、`tabSize: 2`。
- **C CSS/装饰注入**：增删行 2px 竖条（`linesDecorationsClassName` + 伪元素）、行号文字染色。
- **D 组件层**（`StandaloneFileEditor`）：diff 激活时 tab/工具栏显示 +N −N（基线已在内存，计数现成）。

与无色块方向同构：opencode 的 bars 指示条 + 行号色带 + 超淡行底色，正是"选中/变更 = 文字 + 2px 强调条、不靠加深填充"的 diff 表达。JanusX 现在的 diff 反而填充偏重、条缺失，此轮学习同时是把 diff 显示收敛进既有视觉语言。不搬的：TUI tree-sitter 虚拟化 PatchDiff（Monaco 自带虚拟化）、pierre 的 `!important` 语法色覆写（破坏主题语法一致性）、文件树 + reviewed 勾选的多文件审阅套件（属另一产品决策）。

## 外壳 UI 出入（tab 与控件）

窗口外壳当前与应用整体语言的断层，UI 优化时按既有规则收敛：

1. **tab 形态（已裁决）**：`StandaloneFileEditor` 的标签是 `rounded-t-md` 折页形 + 激活填充 `--shell-canvas` + 底部 1px 强调线，是 VS Code 折页隐喻；折页填充正是无色块方向要消灭的色块。用户已裁决收敛到**滑动指示块体系**：工作台 pane tab 的浮动 pill + 滑动指示块（`TerminalArea.module.css` 的 `.tab`/`.tabIndicator`，指示块随选中项平移，激活项仅文字提亮加粗），不采用 configTab 的 2px 强调条方案。
2. **控件选中态**：比较开关、钉住、保存按钮的激活态用 `--shell-accent-soft` 填充块表达，同样违反"选中 = 文字 + 2px 强调条"；图标钮统一 `h-7 w-7` + `rounded`（4px）描边盒，与卡片 6px/7px 圆角体系不一致，且 28px 无 hit slop，弱于 [Workbench close controls keep a stable 30px hit area](./workbench-close-hit-slop.md) 的 30px 命中策略。
3. **主题字面量**：`MonacoViewer.tsx` 的加载态与容器硬编码 `#0a0a0a`/`#555`/`#d4d4d4`/`#202024`/`#45454d`，不走 `definition.ts` → 生成 CSS 的令牌管道；planche 浅色下会闪黑底深浮层，与运行配置当时记录的"主题字面量失控"同类缺陷。
4. 一致的部分可保留：标题栏 38px 与主 `Titlebar` 同高、发丝线底边、`--shell-pane-chrome` 令牌用法正确。

## Open questions

- C 档 2px 竖条与行号染色用 Monaco decoration 还是注入 CSS 覆写 `.monaco-diff-editor`，需在 planche 下分别验证。
- +N/−N 放 tab 内还是工具栏；是否随普通编辑常态显示 HEAD 差异计数，还是仅比较模式内显示。
- 显示风格学习是否延伸到会话流里的文件改动卡（[Post-turn changed-file card across external CLIs](./turn-change-card-external-cli.md)）与 TurnChangeIsland，保持两处 diff 呈现同源。
- A/B 档先行、C/D 视觉确认后排期的顺序是否作为实施拆分。
