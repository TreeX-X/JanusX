---
{
  "schema": "harness-note/2",
  "id": "c28b6fb3-5cb4-4ebc-895d-0e8dab6c1725",
  "kind": "requirement",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T15:06:16.136Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/17bbe20e-f05c-470c-aee1-3f92a86369ab"
}
---

# 关注工具与模块浏览适配

## Problem

[模块浏览](./module-browsing.md)提供预览、进入模块、保留父节点和逐层返回。原关注工具只表达 auto、explicit、none，不能区分预览与进入，定位视口可能遗漏父节点；其他模块的条目仍称为“隐藏、可展开”。原右侧上下文从完整图谱和选中节点推导，没有显式接收当前浏览模块。

本需求统一工具契约、模型上下文与 UI 行为，修正原工具说明与实际选中、预览行为不一致的问题。实施属于普通 xdo，由 Main 直接完成；[实施计划](../../workflowx-v2-adoption.md#后续实施顺序)维护后续顺序。此前已通过的浏览验收不作为本需求的完成证据。

## Expected behavior

note_scope 维护对话关注集合，记录目标、参考、依赖及原因，遵守用户固定和移除；集合更新不换页或抢走预览。note_focus 的 action 为 preview、enter 或 locate，分别表达预览、进入模块和定位。沿用完整 Note URI 与所属 checkout 校验，模块归属、路径、布局和坐标由共享来源与 UI 导航解析。首个 target 是主目标；没有 target 时使用首项，其他文档通过右侧列表逐项访问。enter 仅接受当前有效模块。

| 场景 | 目标行为 |
| --- | --- |
| 普通读取与更新后的访问记录 | 更新右侧记录并高亮当前页可见对象，保持浏览范围、选中与预览。 |
| 查看模块说明 | 左侧预览真实 module.md；模块已在当前页时保持范围，位于其他模块时按既有定位规则到其所在页面。 |
| 进入模块内部 | 进入模块页面，保留该模块为父节点，展示直属内容。 |
| 定位文件 | 进入所属模块并预览；适应视口时兼顾目标与模块父节点。 |
| 跨模块多文档关注 | 右侧按所属模块组织，明确主目标并可逐项定位；其他模块中的文档与缺失、无投影文档分别说明。 |
| 返回与历史定位 | 所有跳转复用同一导航历史；返回恢复范围、选择、预览和视口。浏览与历史定位不改写对话关注集合。 |

当前浏览模块、当前选中对象、对话关注集合分别表达。向右侧会话提供当前模块身份与路径，允许讨论同模块其他文档；点击某文件不能让模型误以为页面只剩该文件。浏览上下文来自 UI，正文仍按需读取，不复制 Note 内容或扩大编辑、执行权限。空模块、未归属文档和无模块仓库保留现有入口。

关注高亮适配节点形状：模块沿卡片本体与顶部页签的原有边框显示主题强调色，target、reference、dependency 分别使用实线、虚线、点线，不再叠加矩形外框或矩形选中光晕。保留模块尺寸、圆角和缩小时的页签几何；普通文件仍使用原有外轮廓。两种蓝图入口共用此样式，关注不改变选中、预览与导航语义。

兼容旧调用时，note_scope 接受原 focus 参数但始终不导航；note_focus 缺少 action 时按 locate 解释，缺少明确展示意图的 auto 调用只高亮。用户请求预览、进入或定位后，明确 action 或 focus: explicit 才可发出导航；focus: none 仍保持页面不动。scope/access 事件在接收端再次限制为不导航。工具返回 validated 与 requested/not-requested，不把事件发送冒充 UI 完成。

导航沿用[单根首页与模块历史](./module-browsing.md)：预览当前页可见模块保持范围与视口，进入模块展示本页直属内容，定位文件适应父节点和目标，不再由稍后的整页适应覆盖。当前页、其他模块、未归属及不可用条目分别标明；主目标不可用时不以参考文档代替跳转。拖动或编辑期间的定位请求会被消费并抑制，不留延迟跳转；重新激活会话只恢复高亮，不重放历史导航。当前模块上下文仅在对应蓝图和已附加 checkout 内提供，选中文件仍保留模块页面的上下文范围，原编辑目标约束不扩大。

## Scope

覆盖 JanusX 的 note.focus/note.scope 定义与提示、NoteFocusEvent、画布关注/导航适配、右侧上下文与关注/访问列表，以及相关测试和语言资源。复用现有导航、共享 Note 来源和身份解析，不创建新 Task、持久关系索引或另一套布局；不执行模块目录迁移。旧调用的默认行为与新展示意图需明确兼容，具体参数命名在实施中保持最小改动。

本需求细化并替代[连续对话需求](../../maintenance/requirements/blueprint-conversation-development.md)第二阶段中“新主目标自动聚焦”“全部目标适应同一视野”“隐藏节点定位展开”等旧画布规则；固定/移除、普通读取不跳转、来源校验和执行边界继续有效。旧验收与运行证据保持原样。

## Acceptance criteria

- [x] AC-1: 工具契约能区分模块预览、进入模块和文件定位；模型提示、参数、返回说明与 UI 行为一致。已校验或已请求不能误报为画布已完成跳转。
- [x] AC-2: note_scope 与普通访问只维护关注/记录和高亮，不自动切换模块、选中或预览；固定、移除与历史引用保留既有语义。
- [x] AC-3: 模块进入与文件定位复用现有导航；模块父节点和目标能同时进入适当视野，连续跨模块定位后可逐次返回并恢复状态。
- [x] AC-4: 右侧多文档列表显示所属模块和主目标，支持逐项定位；位于其他模块、未归属和不可用状态不混用“隐藏待展开”。跨模块参考不会阻止主目标定位。
- [x] AC-5: 会话可分别获得当前浏览模块/路径、选中对象和关注集合；文件选中、页面切换与关注更新互不冒充，不改变读写授权或执行目标。
- [x] AC-6: 内嵌和工作台通过三级模块、跨模块多目标、空模块、无模块仓库及会话隔离回归；后台读取、重复关注、拖动和编辑期间不出现非用户发起的跳转，原有浏览与返回验收继续通过。

## Verification

2026-10-08 Main 自检完成，未调用独立 evaluator。新增 `blueprint-module-focus.spec.ts` 在临时真实 v2 仓库调用 `attachNoteChatTools` 的 note.scope、note.focus 和 note.read；保留主进程校验与共享读取，只替换 Electron 传输边界，将真实工具事件送入生产 Chat、画布和列表。两种入口都验证模块预览/进入、三级与跨模块定位、父节点和目标可见、逐项历史访问、固定/移除、空模块、错误 enter 拒绝，以及下一轮真实 Chat 请求分别携带模块路径、选中对象和关注集合。这不是外部模型质量或真实 Electron 传输的验收。

| 检查 | 命令与结果 |
| --- | --- |
| 工具、状态、上下文、语料与图谱 | `npx vitest run tests/unit/note-chat.test.ts tests/unit/note-focus.test.ts tests/unit/blueprint-context-scope.test.ts tests/unit/project-chat-context.test.ts tests/unit/workflowx-v2.test.ts tests/unit/blueprint-architecture.test.ts tests/unit/blueprint-graph-controller.test.ts tests/unit/blueprint-canvas-navigation.test.ts`：86 项通过。 |
| 模块与关注交互 | `npx playwright test tests/e2e/blueprint-module-focus.spec.ts tests/e2e/blueprint-v2.spec.ts tests/e2e/blueprint-note-focus.spec.ts tests/e2e/blueprint-architecture.spec.ts --project=island --workers=1`：19 项通过；主目标不可用的补充边界再次运行 module-focus 和 note-focus 两文件，10 项通过。端口 41843，本地代理清空。 |
| 旧画布回归 | 联合回归中的 `blueprint-workbench.spec.ts` 15 项通过，覆盖拖动持久化、恢复布局/撤销、筛选和孤立节点折叠。与上项共 34 个不同浏览器场景。 |
| 类型、构建与语言 | `npm run typecheck:strict-unused`、`npm run build:check`、`npm run i18n:check` 通过。变更源码 ESLint 为 0 error，保留既有布局状态中文字符串的 1 项 warning。 |

回归发现快速进入再返回时，同 ID 节点的尺寸会在重建中丢失，未变化的 DOM 不再触发 ResizeObserver，导致节点和连线持续隐藏。现保留复用节点的测量值；两种入口各重复三次，共六项返回检查通过。截图核对了右侧模块分组、主目标与逐项操作，以及父节点和选中文件的视口。`node scripts/verify-note-corpus.mjs` 报告 258 份维护文档、0 error、23 项允许的读取诊断；八份保护文件哈希不变。无全仓目录迁移、新 Task 执行或独立评审。

模块关注轮廓修复由 Main 自检：`npx playwright test tests/e2e/blueprint-module-focus.spec.ts tests/e2e/blueprint-note-focus.spec.ts tests/e2e/blueprint-v2.spec.ts --project=island --workers=1` 共 22 项通过。临时浏览器检查 `node artifacts/module-focus/verify.mjs` 覆盖两种入口 × 亮暗主题 × 三种关注角色的 12 个组合，确认模块本体与页签线型、颜色一致，关注前后尺寸不变，普通文件外轮廓、选中状态和极简缩放正常；截图人工核对页签轮廓。脚本、结果和截图保留在本地 `artifacts/module-focus/`，未纳入版本库；本次未做 Electron 打包验收。
