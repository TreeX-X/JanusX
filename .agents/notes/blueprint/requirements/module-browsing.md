---
{
  "schema": "harness-note/2",
  "id": "810fe6d0-a765-48f1-b89e-b0b3dd7048a8",
  "kind": "requirement",
  "lifecycle": "accepted",
  "created": "2026-10-08",
  "updated": "2026-10-08T06:29:34.779Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---

# 蓝图统一浏览、模块预览与模块内导航

## Problem

此前蓝图保留“系统结构 / 全部 Note”切换，模块单击展开分类文档、双击打开正文详情。用户要求统一蓝图入口，并区分两个目的：单击阅读模块说明，双击进入模块内部浏览。模块和普通文件节点也需要有清晰的外观差异。

本需求已实施并通过 Main 自检，是 [实施顺序](../workflowx-v2-adoption.md#后续实施顺序)的第一项。[v2 接入记录](../workflowx-v2-adoption.md)描述当前行为；[旧模块视图需求](module-structure-requirement.md)的既有验收保留为历史记录，新交互替代其中的双视图切换要求，不回写旧 Task 或执行证据。跨仓最终独立评审仍待完成。

## Expected behavior

| 操作或对象 | 目标行为 |
| --- | --- |
| 进入蓝图 | 使用统一的蓝图浏览入口，移除“系统结构”“全部 Note”的二选一模式切换。 |
| 单击模块 | 选中模块，在左侧预览该模块 module.md 的真实正文、职责与相关信息；保持当前浏览范围，主要动作不再是展开或收起文档。 |
| 双击模块 | 进入该模块的浏览界面，内容范围收敛到该模块下的文件和模块入口；双击不再仅打开 module.md 正文详情。 |
| 模块内浏览 | 当前模块节点保留在画布上方，作为本页父节点，下方显示直属文件和子模块；不混入其他模块文件。沿用文档类型分组，分组不跨所属模块。空模块也保留自身节点。 |
| 返回 | 提供明确返回入口，恢复进入前的浏览层级、选中对象、左侧预览和画布视口，不跳回全仓默认状态。 |
| 模块节点 | 使用带页签的容器轮廓、文件夹图标和进入按钮；普通文件使用文档图标与较直的矩形轮廓。缩小时仍保留模块页签。 |

左侧预览和模块内浏览分别承担阅读与导航。模块说明直接来自共享 Note 来源，不另存一份摘要作为真源。双击事件中的单击预览可以保持一致，但不得额外触发旧的展开/收起或把模块浏览替换成正文详情。

“模块下相关文件”首先按 module 归属识别，模块层级按 parent 识别。跨模块引用可在关联信息中访问，不因被引用就列为本模块拥有的文件。本层展示当前模块自身及其直属文件、直属子模块入口；当前模块是页面根节点，直属内容在其下方连接。深层内容通过继续进入或定位访问。概览显示根模块和其直属模块，正文从共享来源按需读取。关联信息与来源字段默认折叠，使左侧正文保持可见。

移除模式切换时同步维护搜索与 Chat 定位：检索完整文档来源，选择目标后进入其所属模块并定位、预览；不能继续依赖切到“全部 Note”，也不能只搜索当前可见节点。未归属旧文档、历史内容、解析诊断及尚无模块声明的仓库仍需可访问的文档或初始化入口。

## Scope

本轮实施覆盖蓝图工具栏、选中预览、模块浏览范围、返回导航、搜索与 Chat 定位，以及模块/文件节点样式。沿用共享解析、文档身份和写入边界，不创建第二份内容来源。

模块职责和目录的继续细分属于 [模块层级整理](../workflowx-v2-adoption.md#模块层级现状与后续整理)。本交互应支持已有和未来的子模块，但本次记录不执行目录迁移，也不修改用户原有样式文件或其他未提交改动。

## Acceptance criteria

- [x] AC-1: 内嵌和工作台蓝图均移除“系统结构 / 全部 Note”切换；搜索与定位不再自动进入旧模式。
- [x] AC-2: 单击模块在左侧显示对应 module.md 的真实内容，保持当前浏览范围；切换选中模块后预览随之更新。
- [x] AC-3: 双击模块进入以该模块为边界的浏览界面，显示所属文件并保留子模块浏览入口，不混入兄弟或无关模块文件；当前范围可辨认。
- [x] AC-4: 模块内浏览可返回进入前的层级，并恢复选中、预览和视口；连续进入子模块后仍能逐层返回。
- [x] AC-5: 模块节点与文件节点具有可辨认的结构或轮廓差异，不只靠颜色或名称；模块可进入的含义清晰，具体视觉方案经交互检查确认。
- [x] AC-6: 完整来源搜索、Chat 文档定位、未归属与历史文档访问、解析诊断和无模块仓库入口保持可用；选择已归属文件能进入正确模块并预览，双击没有旧展开动作的副作用。
- [x] AC-7: 进入模块后，当前模块自身作为本页父节点保留在画布上方，并连接直属内容；进入更深子模块时同样保留该子模块，空模块也显示自身。重复双击本页父节点不增加返回层级。

## Verification

2026-10-08 初次交付 Main 自检通过，未调用独立 evaluator。浏览器样例包含项目、子模块、孙模块、跨模块引用、空模块及历史文档；内嵌和工作台均覆盖单击预览、双击进入、逐层返回的选择/正文/视口恢复、完整来源搜索和 Chat 定位。检查了浅色与深色截图；正文在左侧首屏可见，模块容器和文件轮廓可区分。

| 检查 | 命令与结果 |
| --- | --- |
| 模块投影、真实语料、Chat 关注与旧画布回归 | `npx vitest run tests/unit/workflowx-v2.test.ts tests/unit/blueprint-architecture.test.ts tests/unit/note-focus.test.ts tests/unit/blueprint-graph-controller.test.ts tests/unit/blueprint-canvas-navigation.test.ts`：43 项通过。真实来源 260 份文档、9 个模块，所有文档均可通过归属页面或未归属列表访问，来源对象未修改。 |
| 交互与旧入口回归 | `npx playwright test tests/e2e/blueprint-v2.spec.ts tests/e2e/blueprint-architecture.spec.ts tests/e2e/note-wiki.spec.ts tests/e2e/blueprint-workspace-init.spec.ts tests/e2e/blueprint-workbench.spec.ts --project=island --workers=1`：35 项通过；测试端口 `JANUS_E2E_PORT=41837`，本地代理清空。模块浏览不写回布局，旧画布的拖动、重置、撤销仍通过 IPC 持久化。 |
| 类型、构建、语言资源 | `npm run typecheck:strict-unused`、`npm run build:check`、`npm run i18n:check` 均通过；针对变更文件的 ESLint 为 0 error，保留既有布局状态中文字符串的 1 项 warning。 |
| 文档语料 | `node scripts/verify-note-corpus.mjs`：257 份维护中的 v2 文档，254 份已迁移来源、3 份保护文件；0 error，23 项已允许的读取诊断。 |

本轮没有创建 Task、执行全仓目录迁移或改写历史迁移哈希。真实子模块职责设计、README 演示和最终独立评审按后续顺序继续。

父节点保留的补充验收 AC-7：`npx vitest run tests/unit/workflowx-v2.test.ts tests/unit/blueprint-architecture.test.ts` 14 项通过；`npx playwright test tests/e2e/blueprint-v2.spec.ts tests/e2e/blueprint-architecture.spec.ts --project=island --workers=1` 7 项通过（端口 41839，本地代理清空）；`npm run typecheck:strict-unused` 通过。核对浅色内嵌与深色工作台截图，当前模块位于直属内容上方；空模块仍显示自身，重复进入本页父节点不会多出返回步骤。此补充保留原分组和来源归属，页面父子连线不改写 Note。
