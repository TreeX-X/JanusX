---
{
  "schema": "harness-note/2",
  "id": "c0b4743b-71be-462a-97da-27e40bc5d67a",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-29",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/636764b9-0105-4944-91f7-72fcbd3c4869",
  "class": "feature",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/5a07c410-1f0c-5a72-bec0-1e48fc4acdfc"}
  ],
  "tags": ["motion","modal","worktree","settings"],
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662"
}
---

# 弹窗统一走共享 ModalFrame 唤出动效

## Problem

`WorktreeComposer`（新建任务盘）是一次性挂载的 portal：打开时直接以终态尺寸和位置画出，没有任何进场；关闭时 `onClose` 立刻让 Sidebar 卸载它，连退出动画的余地都没有。用户点完"新建任务盘…"看到的是"闪出"。同一层壳里的其他弹窗各写各的：设置中心有自己的 `settings-card-rise/descend` 与 320ms 预算，运行配置弹窗用 `globals.css` 的 `island-expand-modal`（`scale(0.92) translateY(-8px)` 配 overshoot 曲线），两者时序和几何都不同，读起来不像同一个产品。更低一层的成因是：即使给面板加上 CSS `animation`，浏览器也会在动画启动前先画出终态计算结果，动画随即被跳过，于是"加了动画却还是闪"。

## Decision

新增 `shared/ModalFrame.tsx` + `shared/ModalFrame.css` 作为壳层弹窗的唯一进出场出口，设置中心、任务盘弹窗、运行配置弹窗三者都迁到它上面。框架自带遮罩、透视升起、首帧揭示门控（`data-reveal-ready` 未置位时面板 `opacity: 0; animation: none`）、单一 `requestClose` 关闭路径、焦点归还和 `role="dialog"` 语义；面板自身只通过 `panelClassName` 提供几何与配色，motion 全部留在框架里。统一时序为面板 240ms 升起、退出 300ms（240 + 60ms 缓冲）、遮罩 300ms 淡入淡出，沿用 `cubic-bezier(0.16, 1, 0.3, 1)` 与 `cubic-bezier(0.7, 0, 0.84, 0)`。

迁移中修掉三处既有缺陷。运行配置弹窗原先只有标题栏 ✕ 一条关闭路径，没有 Esc、没有点遮罩关闭、没有 `role`/`aria`、没有焦点管理；迁移后三条关闭路径统一。任务盘弹窗原先 Esc 只在名称输入框聚焦时生效，提到 `window` 级。`z-index` 三个界面原本是 1000/1000/9999，框架不猜，默认走侧栏浮层（1000），设置中心显式传 9999 保持压在工作台之上。

面板默认外观用 `:where()` 包裹（零特异性），这样各界面自己的 `box-shadow`/圆角/配色一定赢过框架默认，不依赖样式表加载顺序；揭示门控和关闭态规则保留真实特异性，因为它们必须压过这个默认值。

透视深度是唯一主动偏离工作台的地方：弹窗宽度在 420–1180px，沿用工作台的 `translateZ(-56px) scale(0.94)` 会缩到 0.90 以下，读起来像塌陷而不是落位，所以统一用 `translateZ(-28px) scale(0.96)`。三个弹窗共用这一套几何是刻意的——一个弹窗一种开法正是壳层显得没做完的原因。

遮罩同样刻意不做主题分支。框架的 `rgba(8, 8, 10, 0.62)` + `blur(10px)` 是所有壳层弹窗的唯一遮罩；设置中心、LLM 配置独立弹窗、团队挡板此前各自在 `[data-theme='planche']` 加法层里把遮罩翻成 0.18 的淡墨罩并去掉模糊，而「新建任务盘」不碰遮罩、照常吃框架默认。planche 是默认主题，于是同一层遮罩出现两种结果：新建任务盘背后压到中灰，设置中心背后几乎全透明，工作台直接透出来。根因是"纸面化"这条加法层纪律被套用到了遮罩上——它本来该只翻面板自己的表面与投影。三处覆写已删除，遮罩回到单一来源。

## Alternatives considered

- 只在 CSS 上给现有面板挂 keyframes 而不动生命周期——最强的理由是改动最小。规则它的是首帧终态问题：不开揭示门控，浏览器在动画启动前就画完终态，动画被跳过，这正是"闪出"的根因，改 CSS 治不了。
- 复用 `globals.css` 里现成的 `island-expand-modal` 统一三个弹窗——最强的理由是完全不新增 CSS，且不用动设置中心。规则它的是几何不匹配：那是 `scale(0.92) translateY(-8px)` 配 overshoot 曲线，属于"弹窗弹入"族，与设置中心/蓝图卡片的透视升起是两种读法；用户点名要的是和设置界面一样。
- 在 `CardFrame.tsx` 里加一个 `useModalReveal` hook 而不是建 `ModalFrame` 组件——最强的理由是不引入新组件、每个界面继续自己写 portal JSX。规则它的是重复：三个界面都要复制一遍 portal + backdrop + panel + 事件接线，正是这次要消灭的东西。
- 三处各自改一遍、各自留一份 keyframes——最强的理由是每处 diff 都最小、互不影响。规则它的是它保住了问题本身：三份时序三份几何，下次新增弹窗还要再抄一遍。
- 给任务盘弹窗提交加按钮内转圈等待创建完成——最强的理由是用户能在弹窗内看到进度。规则它的是既有提案语义：创建是 Orca 模式，提交即关、进度/取消/重试都挂在侧栏行上，弹窗锁死会和它冲突（见 `2026-09-21-worktree-create-delete--636764b9.md` 已记录的否决项）。本次只动进出场，不碰提交语义。

## Consequences

- **Gains**: 三个弹窗共用一套进出场、遮罩、关闭路径和 dialog 语义；运行配置弹窗从"只有 ✕ 能关"补齐到三条路径。`npx tsc --noEmit` 无报错，四个改动文件 `npx eslint` 干净，`npx vitest run tests/unit/knowledge/card-frame-phase.test.ts` 9 passed，`npm run build` 通过且产物里 `modal-frame-*` 全部关键帧与 `data-reveal-ready` 门控都在。
- **Costs and limits**: 框架的 children 支持函数式与节点式两种签名，函数式是为了把 `requestClose` 交给界面自己的按钮/表单，这条路径目前只有任务盘弹窗在用。`ModalFrame.css` 靠 `import './ModalFrame.css'` 自带，不在 `main.tsx` 的全局导入列表里——这是刻意的，避免为一个可选组件拖动全局样式顺序。同文件的删除弹窗、ship 弹窗，以及 Sidebar 的工作区删除确认、GitPanel 的推送确认仍是硬切或旧 keyframe，尚未收敛。`dismissable` 已就位但当前无人使用，留给将来持有未保存状态的弹窗。构建产物中的 Electron 实机观感未在本轮验证；仓库内 `planche-theme` / `theme-registry` / `task-contract-adoption` / `agent-notes-check` 四个测试当前失败，已在回退本次改动后复现，属既有问题。

## Scrim follow-up

第一轮只处理了走 `ModalFrame` 的三个弹窗，理由是遮罩单一来源属于本决策的组成部分；第二轮把蓝图与知识库也拉进来。它们不走 `ModalFrame`——各自手写 portal，`z-index: 12000`，靠 `CardFrame` 的 `useWorkbenchPhase` 驱动，卡片式逐步唤出（`--card-index` 错峰）是刻意设计，保留不动。改的只有全屏遮罩本身：`blueprint.css` 的 `.blueprint-workbench-backdrop` 与 `KnowledgeWorkbench.module.css` 的 `.backdrop` 从 `rgba(5,5,7,0.55)` + `blur(6px)` 提到 `rgba(8,8,10,0.62)` + `blur(10px)`，并删掉各自的 planche 淡罩覆写。

这里有一处刻意不统一：蓝图内的 `prompt-dialog__overlay`（`PromptDialog` 的次级弹窗，`z-index: 2000`）保留较淡的浓度。它嵌在已经压暗的父遮罩之上，再叠一层 0.62 会把父层内容压死；嵌套越深，遮罩越应该比父层轻。契约测试也据此把断言限定在全屏遮罩规则上，而不是整份文件里禁掉 0.18 这个色值。

契约测试 `tests/unit/planche-theme.test.ts` 的 `keeps one shared modal scrim, un-themed` 断言 `shared/ModalFrame.css` 的 `rgba(8, 8, 10, 0.62)` + `blur(10px)`；禁止设置中心、LLM 配置、团队挡板、蓝图、知识库以及作为参照的 `WorktreeDialogs.module.css` 在加法层里翻遮罩；并断言蓝图/知识库虽不接入 `modal-frame-backdrop`，但各自的 scrim 规则与共享值逐字相同。另加 `puts the knowledge workbench close light at the top-left, like blueprint` 钉住关闭红灯的位置。

## Knowledge close light: right → top-left

知识库工作台的关闭红灯原先挂在 `.headerActions` 末尾（顶栏右侧），蓝图工作台的同名红灯是 `.blueprint-workbench-topbar` 的第一个子节点（顶栏左侧）——两个同源工作台互为镜像。红灯移到 `.header` 首位，`.headerActions` 只留刷新一类动作，`.closeButton` 补 `flex: 0 0 auto` 与蓝图对齐。

位置约束来自 `2026-09-21-workbench-close-hit-slop--8688b5ab.md`：14px 圆点靠 `::before { inset: -8px }` 拿到约 30px 命中区，贴边点击要留得住。移位后左侧靠 `.header` 的 `padding-left: 14px` 提供 14px 净空，比 8px 外扩多 6px 余量；`.header` 的 `gap: 12px` 负责与面包屑的间距。红灯的 `::after` 叉号仍是 `color: transparent`（悬浮不冒叉），14px 命中区与双主题交互约定未动。

原先钉住 `TeamSetupGate` 必须覆写遮罩的那条断言已删除（它锁的正是这次要去掉的行为）。`npx eslint src/renderer/src/components/knowledge/KnowledgeWorkbench.tsx` 0 error（1 条 `exhaustive-deps` warning 在 Esc 处理 effect 上，与本次无关）；`npx vitest run tests/unit/knowledge` 55 files / 473 tests 全过；`npx vitest run tests/unit` 304 files 中 4 个失败（`planche-theme` 的 2 条 janus island 选择器、`theme-registry`、`feishu-settings-ipc`、`agent-notes-check`），全部在 stash 掉本次改动后复现。`npx tsc --noEmit` 另有 4 处 `candidateHash` 缺失报错（`KnowledgeWorkbench.tsx:268-269`、`MemoryReviewTool.tsx:56`、`NoteWikiLinks.tsx:70-71`），同样 stash 后复现，属工作树中既有的在途改动。本轮未在 Electron 实机目视确认两处观感。



