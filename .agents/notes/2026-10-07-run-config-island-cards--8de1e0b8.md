---
schema: harness-note/1
id: 8de1e0b8-22da-4a82-87c6-5622d8de4d8e
kind: decision
lifecycle: implemented
created: 2026-10-07
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c
class: architecture
---

# 设置与运行配置对齐分体卡片与主题令牌

## Problem

三类界面的卡片语言分叉。蓝图工作台是分体卡片：透明壳上每张卡独立悬浮（1px 框 + 8px 圆角 + 卡间缝隙），按 `--card-index` 错峰升起（`src/renderer/src/components/blueprint/blueprint.css` 的 `blueprint-workbench-shell` / `blueprint-workbench-card`）；会话坞是框线折叠卡 + 浅纸面内卡（`src/renderer/src/components/SessionPanel.module.css`，见 [Session surfaces derive from the chrome token](2026-09-29-session-card-surface--764d5d26.md)）。而设置中心（`AppSettingsModal.module.css` 的 `generalRow`）与运行配置（`ProjectSettings.module.css`、`ProjectConfigForm/QuickConfigForm.module.css` 的 `configSelector` / `fieldList` / `diffList` / `taskOutput`）是「整块面板 + 填充灰卡」：`background: var(--shell-card)` + 10px 圆角靠填充分组。`AppSettingsModal.module.css` 头注写着「分组靠发丝线和留白，不靠嵌套的圆角容器」，实现与纪律相反。dark 下 `--shell-card` 填充块正是石板浅色风格要消灭的色块；planche 下 `--shell-card` 恰好等于纸面，填充无效果、只靠一根淡发丝线定界，卡与地几乎分不开。圆角也不统一：设置/运行配置 10px，蓝图节点卡与会话卡 6px。

运行配置另有两个缺陷。其一，主题字面量失控：`ProjectSettings.module.css` 约 60 处硬编码色值（`#ececef`、`#d7d7da`、`#76767e` 等 dark 白灰字与 `rgba(255,255,255,…)` 边框），主列（contextBar、tabs、diffList、taskOutput、commandBar）与左栏没有 planche 覆写，纸面主题下白字看不清；planche 加法层只覆盖右助手列和按钮 hover。`QuickConfigForm.module.css` 另有 15 处字面量（含 `rgba(0,0,0,0.28)` 沉底输入框、`#ff6b6b` 必填星号）且完全没有 planche 层。这些颜色不走 `src/shared/theme/definition.ts` → `themes.generated.css` 的令牌管道，游离在主题统一管理机制之外；`tests/unit/planche-theme.test.ts` 现有钉只断言「存在 planche 层」和「无 #151517」，钉不住主列白字。其二，运行配置左侧项目类型 tab（`ProjectTypeSelector.module.css` 的 `typeItem`）的选中/悬停态与设置导航不一致：带可见 1px 边框、hover 用 `rgba(255,255,255,0.02)` 填充、6px 圆角，且无 planche 层；而设置导航（`AppSettingsModal.module.css` 的 `tabButton`）与知识工作台（[assistant-persona-layout](2026-10-04-assistant-persona-layout--6e9c114d.md)）已确立「透明底 + hover 微亮 + 选中主题底色与左 2px 强调条 + focus 向内 1px 描边 + 160ms 过渡」的同一套状态规则。

## Decision

分体卡片语言按三层落到设置与运行配置，信息架构不动：运行配置仍是「左类型 / 中表单 / 右助手」三栏，设置仍是主窗口抽屉（见 [settings-workbench-transition](2026-09-18-settings-workbench-transition--5a07c410.md)）。

**布局层（仅运行配置）**：三栏是三张浮岛卡。`ProjectSettings.module.css` 的 `.container` 吃 `--shell-canvas` 地色，卡间留 12px 缝隙与内边距；`.sidebar` / `.main` / `.assistant` 共用浮岛卡规则（1px 框 + 6px 圆角 + 错峰升起）。入场动画 `projectIslandRise` 为 380ms `cubic-bezier(0.16, 1, 0.3, 1)` 的 `translateZ(-56px) scale(0.94)` 升起，延迟 `calc(var(--card-index) * 180ms)`，时长与曲线对齐 `blueprint-workbench-card-rise` 的既有参数；`--card-index` 由 `shared/CardFrame.tsx` 的 `cardIndexStyle` 在 `ProjectSettings.tsx` 注入（0/1/2），`ProjectLaunchAssistant` 接受 `style` 透传到 `aside`。`prefers-reduced-motion: reduce` 时动画关闭。≤980px 窄窗保留「隐藏助手列」规则，loading 态横跨整行。

**表面层**：设置中心的 `generalRow`、`lsCard` 与 NotificationSettingsPanel、KnowledgeSettingsPanel、LlmConfigModal 的 `section` 使用 1px `--shell-border-soft`、6px 圆角与 `color-mix(in srgb, var(--shell-chrome-raised) 12%, var(--shell-canvas))` 底色。轻微底色与发丝线共同界定分组，控件与窗口外壳保持更强边界。两个主题共用这条规则，planche 内卡不另加墨框；最后一张分组卡也不额外加深底边。通知共享样式同时覆盖 Agent、托管、个人记忆与实验设置的分组。双层卡片如果都采用实色墨框，会让分组与输入控件争夺注意力，因此设置的内层分组不照搬工作台独立浮岛的外框。

运行配置的 `configSelector`、`fieldList`、`diffList`、`taskOutput` 使用透明底、1px `--shell-border`、6px 圆角，planche 加法层使用 `--line` 墨框。dark 浮岛卡保留 `--shell-card` + 阴影；planche 浮岛卡纸面墨框、零阴影。

**控件层**：选中态维持「文字提亮 + 2px 强调条」。`QuickConfigForm` 的 `configTab` 选中从白色填充块改为文字提亮 + 底部 2px 强调条（`::after`），planche 强调条走 `--planche-red`。输入类控件吃 `--rc-field`（解析到 `--shell-void`，planche 层覆写纸面）与 `--control-border` 令牌，focus 边框走 `--shell-accent-border`（planche 朱红），`removeBtn` 悬停改 diff-del 描边语言。

**左侧 tab 对齐设置导航（补充 A）**：`ProjectTypeSelector.typeItem` 的悬停、选中、焦点态与 `AppSettingsModal.tabButton` / 知识工作台 `navButton` 相同的状态规则：透明底、无可见边框、hover 微亮（`rgba(255,255,255,0.045)`，planche 覆写 `--paper-deep`）、选中 `--shell-active` + 左 2px `--shell-accent` 强调条（planche 朱红）、focus 向内 1px 描边、160ms 过渡；`autoBadge` 改 `--shell-diff-add`。状态规则继续留在各自 CSS 模块内复写。

**主题统一管理收编（补充 B）**：`ProjectSettings.module.css`、`QuickConfigForm.module.css`、`ProjectTypeSelector.module.css`、`JsonEditor.module.css` 的色值字面量全部收编进令牌——常规色走 `--shell-*`，planche 特有物性（纸、墨、朱红）走 `:global([data-theme='planche'])` 加法层引用 `--paper` / `--ink` / `--line` / `--planche-red`。主列白字、输入框黑底、白 alpha 边框三类字面量清零。`planche-theme.test.ts` 的钉扩展到主列与表单。

## Alternatives considered

- 只补 planche 加法层补丁、不动布局与表面 —— 最强理由是改动面最小、风险最低。否决原因是根因是「每个界面手写一套色值与卡片」，补丁式覆写会随界面继续膨胀；且分体卡片与主题收编是既定方向，只修白字不解决卡片语言分叉。
- 设置界面也拆成浮岛瓦片 —— 最强理由是全局形态最一致。否决原因是设置被刻意设计成「主窗口的一个抽屉」（侧栏吃 `--shell-chrome`、内容吃 `--shell-canvas`，与主窗口同构），拆岛等于重写该概念；密集表单纵向滚动被瓦片切断后填写节奏受损。设置只做表面层与控件层，布局层留给运行配置。
- 表面层直接照搬会话卡的牛皮卡/浅纸面三阶 —— 最强理由是与会话坞同料。限用原因是设置与运行配置是软件工作面而非内容卡列表，其地色应吃 `--shell-canvas` 与软件底一致；设置内卡只混入 12% 主题抬升底色，避免形成大片填充色块。
- 设置内卡直接复用外壳墨框：优势是边界明确且实现简单；代价是密集表单中所有层级同样醒目。内卡使用已有柔和边框令牌，控件与外壳保留更强对比。
- 三个界面提取共享 CardFrame 组件一次性统一 —— 最强理由是消灭重复。否决原因是三者生命周期不同（工作台 portal、抽屉 modal、整窗视图），共享抽象要同时兼容三种宿主，成本高于在各自模块内按同一规则复写；先对齐规则，出现第三个同类需求再提取。
- Do nothing / reuse 现状 —— 零成本、零回归风险。代价是 planche 下运行配置主列白字不可读的缺陷持续存在，卡片语言继续三套并行，字面量继续游离在主题机制之外。

## Consequences

- **Gains**: 运行配置三栏读作三张可独立抬升的浮岛卡，错峰入场与蓝图工作台同节奏；设置内卡以低对比轮廓和极浅底色分组，运行配置以独立卡框定界；运行配置四个样式文件的色值全部经令牌解析，planche 主列/表单/助手列文字为墨字可读，左侧类型 tab 与设置导航、知识工作台共用同一套选中/悬停/焦点反馈。

设置卡片验证：`npx vitest run tests/unit/planche-theme.test.ts tests/unit/laya-settings-ui.test.ts tests/unit/feishu-settings-ui-contract.test.ts --maxWorkers=2` 为 21 项通过、1 项跳过。浏览器加载真实通用设置组件，1280×900 下目检 planche 与 dark；分组框分别计算为 `rgba(28,52,59,0.14)` 与 `rgba(255,255,255,0.043)`。截图位于本地 `artifacts/settings-cards/`，不作为分发资源。浏览器夹具报告 `Electron API is unavailable`，因此目检不证明桌面接口功能；桌面端全量验证未运行。
- **Costs and limits**: 浮岛卡的 12px 缝隙与内边距吃掉小窗口的表单空间，≤980px 只保留了「隐藏助手列」单条兜底，更窄窗口未实测；dark 浮岛卡仍引用 `--shell-card` 阶（`#1c1c1f`）而非全透明，因为透明 + 发丝线框在深色底上分界不足，这是卡阶的既有授权，不是新增填充色块。导航状态规则第三处复写（设置、知识工作台、类型 tab），后续调整交互规范需三处同步，出现第四个同类需求应提取共享样式。`cardIndexStyle` 的返回类型从字面量对象改为 `CSSProperties` 以便直接挂到 `style`，未改变取值。
- **Verification**: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` 退出干净；`npx eslint src/renderer/src/components/ProjectSettings.tsx src/renderer/src/components/ProjectLaunchAssistant.tsx src/renderer/src/components/shared/CardFrame.tsx` 仅存量 hooks 警告、零 error；`npx vitest run tests/unit/planche-theme.test.ts tests/unit/assistant-ui.test.ts tests/unit/knowledge/workbench-selection.test.ts --maxWorkers=2` 三文件 30 项通过，含新增钉点（浮岛错峰入场、四表无色值字面量、类型 tab 选中态、configTab 无填充块）。浏览器/桌面端双主题目检与窄窗实测未做；变更文件 `git diff --check` 通过。
