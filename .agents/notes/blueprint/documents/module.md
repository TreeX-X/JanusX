---
{
  "schema": "harness-note/2",
  "id": "bd612cd8-0676-4c46-98ba-81d1dc008505",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-15T10:26:11.296Z",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd",
  "moduleState": "partial",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/notes/note-provider.ts",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/blueprint/NoteWikiPanel.tsx",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/shared/note-wiki.ts",
      "role": "implementation"
    }
  ]
}
---

# 工程文档读取与 wiki

## Responsibility

复用 agentX 的 NoteReadSnapshot，提供工程正文、元数据、引用、反链和 wiki 目录。共享包维护解析、索引与身份；本模块维护 Janus 的读取适配和文档阅读入口。

## Design

同一快照供 wiki 与蓝图投影消费，正文按需读取并保留原始来源哈希。文档命名空间、历史迁移和机械检查在此归档；共享编辑事务由 agentX 提供，蓝图交互见 [职责入口](../navigation/module.md)。旧工程知识 Wiki 生成已退出；原始 Note 是当前工程正文来源，内容审核与建议由[蓝图维护模块](../maintenance/module.md)负责，个人记忆的来源与审核继续归[个人记忆模块](../../knowledge/module.md)。

模块和其他 Note 正文中的内部跳转链接使用轻量标签：继承所在段落的字体、字号和字重，与正文基线对齐，左右各留 0.3em 间距，内部留白与上下间距避免边框贴字或邻行相碰。标签采用主题强调色的细边框和淡底；悬停与键盘聚焦时使用已定义的 `--accent-mid` 淡色底、正文文字色和强调色边框，避免未定义主题变量回退为深棕底。颜色以 140ms 过渡，减少动态效果设置下取消过渡；键盘焦点另保留外轮廓。长标题在标签内换行，最大宽度为相邻标点预留空间；样式只覆盖正文链接，目录、关系列表和操作按钮保持各自布局。链接解析、锚点和跨模块导航沿用原机制。

## Note 阅读面板

左侧提供“正文”和“关联笔记”两个下划线页签。正文读取当前 Note 原始字节，提供预览、完整源文和复制原文；不再显示底部元数据 JSON 或终端状态。索引诊断集中在蓝图“数据来源”，解析与结构问题仅在存在实际问题时显示，正常来源信息与有效 Note 总数仍可查看。

阅读区优先呈现正文：紧凑模式不重复完整扫描说明，来源与字段移至正文下方。完整源文与复制收进页签右侧“原文操作”，选择操作、点击外部或 Escape 关闭；键盘关闭及执行后焦点返回入口。审核摘要常驻正文之前，显示折叠入口、建议数量、状态和审核动作；收起只隐藏详细内容，摘要不会消失。吸顶状态入口仍能展开并定位详情，建议直达自动展开，审核状态持续接收更新。

预览使用单棵 Markdown 语法树组织章节，保留跨章节引用定义、代码围栏、表格和原文行号；主要章节可分别折叠、全部展开/折叠，目录跳转会展开目标所在章节。章节目录使用原生 Popover 浮层，不推挤正文，可滚动并适配窗口边界；选择章节、点击外部、Escape、外部滚动或窗口尺寸变化时关闭，键盘关闭后焦点返回入口。全部展开/折叠使用紧邻目录的图标按钮并保留可访问名称。标题按层级呈现，原文、关联预览和审核引用继续使用实际来源与 hash。代码块保留自身横向滚动，正文不再套一层固定高度的纵向源文滚动框。

“关联笔记”分别展示所属模块、依赖、实现、约束、来源、替代和正文引用的双向关系，以标题和完整方向说明呈现，保留验收项、范围和理由。UUID/URI 收进引用详情；缺失、不可读取、多重身份和无效引用明确说明。harness-note/2 的 module 归属同时生成所属模块和下属笔记入口。关联页不批量读取全文；展开单篇预览时才读取原始 Note，失败可重试，预览中的内部链接仍按被预览笔记解析。原“上下文”独立页签已合并为章节阅读和关联预览，不把有界上下文摘录当成全文。Agent 使用的有界上下文接口保持原职责。

内容审核与关联笔记共用边框、圆角、标题行、状态说明和内容分隔样式。折叠箭头位于左侧，与标题垂直居中；标题本身可展开，右侧图标分别承担重新审核/取消和打开关联笔记。章节标题清除原有上下边距，图标操作统一 28px 点击区域并提供悬浮与键盘反馈。蓝图节点子树折叠入口也放在节点头部左侧；原生详情使用相同的左侧箭头。

卡片采用固定标题及关闭按钮、独立内容滚动区；内容稳定预留滚动条宽度。只有页签和紧凑审核状态入口吸顶，完整审核面板随正文滚动。审核状态区分未审核、进行中、待复审、覆盖不足、失败、过期、有建议和通过，点击入口只定位并展开详情。建议直达、已读规则、引用定位和返回阅读位置沿用导航流程，返回时同时恢复章节折叠。详细状态规则见[更新与建议导航](../navigation/note-updates-and-suggestion-navigation.md)。

## Verification

2026-10-15 收起行为修正：首次进入不再自动展开 Janus，左侧审核面板收起后保留摘要。修复前 `blueprint-workbench.spec.ts` 的 fresh launch 与 `blueprint-attention.spec.ts` 的 suggestion summary 在两种尺寸/入口的 4 项场景均复现失败；修复后连同建议交接共 6 项通过。扩展回归使用 `NO_PROXY=127.0.0.1,localhost`、`JANUS_E2E_PORT=52689`，执行 `npx playwright test tests/e2e/blueprint-workbench.spec.ts tests/e2e/blueprint-attention.spec.ts tests/e2e/blueprint-reader.spec.ts tests/e2e/blueprint-module-focus.spec.ts tests/e2e/blueprint-workspace-init.spec.ts --project=island --workers=2 --output=artifacts/blueprint-collapse-regression`：57 项通过，1 项在新打开 Janus 的初始适应动画完成前捕获视口。该测试补充等待图谱就绪及入场动画完成后，`JANUS_E2E_PORT=52690` 单独重跑 module-focus 的 2 项均通过，共覆盖 58 个场景。类型检查、应用构建和两个变更组件 ESLint 通过；亮暗截图人工检查摘要及建议数量可见、右侧关闭，位于本地 `artifacts/blueprint-collapse-fixed/summary-{planche,dark}.png`。未运行 Electron 桌面验收。

2026-10-15 阅读区与蓝图工具栏精简由 Main 实施和自检：`NO_PROXY=127.0.0.1,localhost`、`JANUS_E2E_PORT=52686` 下运行 `npx playwright test tests/e2e/blueprint-workbench.spec.ts tests/e2e/blueprint-reader.spec.ts tests/e2e/note-wiki.spec.ts tests/e2e/blueprint-module-card.spec.ts --project=island --workers=2 --output=artifacts/blueprint-refinement-acceptance`，30 项通过。覆盖 1440×900 与 1280×720 三列、菜单键盘/外部关闭、原文复制反馈、审核入口、正文返回、布局恢复/撤销/拖动以及亮暗主题三档节点缩放。另有 attention 19 项、module-focus 2 项通过；相关 review/layout/status/history 四份 Vitest 共 64 项通过。`npm run typecheck`、`npm run build:app`、`npm run i18n:check` 通过；变更组件 ESLint 0 错误，保留 19 条既有中文字符串警告。Note 检查 309 篇、0 错误、17 项跨仓链接诊断。浏览器截图位于本地 `artifacts/blueprint-refinement-verified/preview-{planche,dark}.png`；未运行 Electron 桌面验收。

提交前从暂存区导出独立源码，复跑修复、审核引擎、模型端口和实际聊天调用的 91 项 Vitest，以及阅读面板、目录与模型容量界面的 18 项 Chromium 场景，全部通过；独立源码构建和中英文键检查通过。类型检查仍仅有上述 expectedHash/readPage 依赖错误。独立源码的 Note 检查保留原 HEAD 已存在的 sessions/module.md → workbench/experimental-preview-features.md 缺失链接，目标仍是其他工作的未跟踪文档；跨仓引用在隔离目录不可解析，本轮不纳入其他模块文档来掩盖该基线问题。

2026-10-12 阅读面板调整由 Main 实施和自检。最终分组运行 Chromium：`note-wiki.spec.ts` 7 项、`blueprint-reader.spec.ts` 4 项、`blueprint-attention.spec.ts` 19 项、`blueprint-source-info-reference.spec.ts` 2 项通过；`blueprint-note-focus.spec.ts` 以 `--grep 'folded read|reveals a folded'` 运行的 2 项通过，共 34 个场景。验证目录浮层不改变正文位置、390px 边界、Escape/外部关闭、章节展开与返回恢复、两种入口关闭按钮位置稳定、按需关联预览，以及建议修复交接和状态同步。早期一项关联预览测试选择器匹配到折叠内容，已按关系分组限定并复跑通过。

Vitest 受影响文件共 63 项取得通过结果，最终再运行 `blueprint-review-ui.test.ts` 与 `note-repair-ui.test.ts`，49 项通过。构建、双语检查通过；改动组件 ESLint 0 错误、16 个既有中文字面量警告。全局类型检查仍仅受 `src/main/blueprint/note-mcp-server.ts:48` 的 expectedHash/readPage 依赖类型错误阻断。已查看亮暗主题的阅读、关联和目录截图，证据保存在 `artifacts/blueprint-reader/`。额外运行 `.cache/blueprint-reader-visual.mjs`，实测审核/关联标题图标在两主题下的垂直中心差为 0，节点图标中心差小于 0.001px；关联卡片右侧打开按钮可跳转正文。Note 校验为 296 篇、0 错误，保留 17 项既有外部链接诊断；22 个本轮改动文件增量空白检查通过。未调用真实模型、未修改 dev 数据、未做桌面安装包验收；本轮提交包含蓝图功能及必要依赖，共享文件按功能拆分暂存，其他模块代码保留在工作区。

2026-10-09（北京时间）正文标签样式由 Main 自检。`npx playwright test tests/e2e/note-wiki.spec.ts tests/e2e/blueprint-v2.spec.ts --project=island --workers=1` 最终 14 项通过；首轮首次双击 Reader 模块场景出现一次超时，本次未修改导航代码或该测试。临时检查 `node artifacts/inline-note-links/verify.mjs` 覆盖两种入口、两种窗口宽度和亮暗主题共 8 个组合，核对正文两侧实际间距、字号继承、长标题无横向溢出、焦点可见及 Enter 跳转。截图人工检查中英文混排、连续链接和长标签；本地证据保留于 `artifacts/inline-note-links/`，未纳入版本库。本次未做 Electron 打包验收。

悬停修正后，`npx playwright test tests/e2e/note-wiki.spec.ts --project=island --workers=1` 两项通过。`node artifacts/inline-note-hover/verify.mjs` 的 8 个组合分别检查普通、纯鼠标悬停和键盘焦点状态；样本文字悬停对比度最低 8.20:1，Enter 跳转及减少动态效果设置通过。截图人工确认悬停底色融入亮暗主题；本地脚本、测量和截图位于 `artifacts/inline-note-hover/`，未纳入版本库。
