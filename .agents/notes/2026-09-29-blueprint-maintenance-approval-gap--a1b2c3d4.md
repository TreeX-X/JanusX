---
schema: harness-note/1
id: a1b2c3d4-2990-4ec4-b1d2-c825b30fa9da
kind: decision
lifecycle: implemented
created: 2026-09-29
class: bug-fix
tags: [blueprint, maintenance, approval, janus-chat]
---

# 蓝图对话提案与宿主审批闭环

## Problem

蓝图右侧的普通项目聊天只拥有读取工具。模型文字中的修改建议和“确认”不产生维护任务或 changeSet，因此单凭聊天回复无法进入宿主批准、Note 事务和撤销链。[单会话工作区对话](./2026-09-25-blueprint-workspace-dialog--5480ef6d.md)要求保留简洁的消息区与输入框；把维护入口全部移除会使用户找不到模型回复要求的应用操作。

## Decision

[维护动作](../../src/renderer/src/components/blueprint/BlueprintActionBar.tsx)作为宿主内容位于聊天消息末尾，普通发送继续走只读项目聊天。用户点击“整理为提案”后，界面通过现有 startMaintenanceTask 创建绑定会话、工作区和节点范围的任务，再由共享聊天控制器携带 maintenanceTaskId 发起结构化提案。模型回复本身不能触发写入。

“维护此节点”和工具栏入口将 Note URI、当前 sourceHash 与 checkoutPath 交给同一个项目会话。节点范围通过来源 checkout 的 projectGraph 回源解析，组合图中的显示 ID 不冒充本地 Note ID。来源过期、缺失或歧义阻止提案；目标在另一个已登记工作区时，用户可点击切换。切换沿用单会话的清空及重新绑定规则，下一次请求只携带目标工作区的运行会话。未结束的其他范围或会话任务必须先结束，不能挪用其权限继续生成。

审批复用 MaintenanceApproval 的分组、依赖闭包与逐项删除确认。组件以完整 changeSet 内容为 key，替换正文即清空原选择；宿主继续校验当前提案身份、来源哈希、版本、工程证据及授权。批准成功通过已有 store 刷新蓝图和详情。历史记录来自实际审计，用户结束维护后可生成反向提案，逐项选择撤销。失败保持可见，读取错误不能显示为空历史；“刷新”重新读取来源及任务。

创建任务期间关闭面板、切换节点或工作区、清空或改变对话会撤销该次尚未发起模型请求的任务。操作锁防止同一界面的重复提交；后台已发起的聊天继续沿用共享控制器的停止、重试和单轮互斥。侧栏重新挂载能够读取当前主进程中的任务；任务与未应用提案仍使用既有进程内存储，完整应用审计使用既有磁盘存储。

面板绑定与控制器配置分属两个 effect。只有控制器 ID 与已绑定会话一致时，面板才设置工程上下文、工作区和审批模式，避免新控制器尚未发布时配置到个人会话。工作台胶囊通过 registry 的项目视图查询取得临时面板会话；公开会话列表继续排除这些临时会话。任务列表读取采用请求序号，读取期间到达的任务事件与完成的操作结果优先于列表快照，较早请求的失败不能覆盖较新读取的成功。

## Alternatives considered

- 让每条普通聊天自动生成维护提案：无需额外按钮，但探索和追问会反复触发结构化模型请求，并混淆讨论与可执行修改。显式“整理为提案”保留用户选择时机。
- 从模型自然语言中解析“已确认”并直接写文件：交互步骤少，但文字不能可靠绑定变更范围、旧版本和删除确认；采用已有结构化提案与宿主事务。
- 恢复完整设置、任务和历史控制台：操作集中，但挤压用户要求的简洁聊天。消息末尾的提案卡片与折叠历史只展示实际维护所需动作。
- Do nothing / reuse：继续使用普通聊天及现有未挂载的审批组件无需改代码，但维护入口仍无法抵达应用服务。

## Consequences

用户可以在同一个蓝图对话中完成讨论、提案、批准、刷新和撤销。通用 JanusChat 仅增加可选的宿主消息尾部插槽，维护状态继续由专用组件和原 store/service 持有，不引入第二套提交协议。

代价是用户需要显式整理提案，跨 checkout 维护需要切换当前工作区，结束任务后才可撤销。模型输出不符合已有 Note 变更约束时，服务仍会拒绝；该交互修复不扩展可修改字段或提供多仓原子事务。主进程重启丢弃尚未应用的任务，应用审计继续可查询。

## Verification

2026-09-30 的机器验证覆盖 7 个单元测试文件、74 个不同用例。以下分组运行均通过；最后一组包含任务列表竞态的两个用例。真实临时 Note 覆盖部分应用、源哈希冲突、审计和撤销，模型边界使用固定输出。

```text
npx vitest run tests/unit/blueprint-maintenance-harness-routing.test.ts tests/unit/blueprint-maintenance-history-ui.test.ts tests/unit/blueprint-maintenance-scope-ui.test.ts tests/unit/blueprint-maintenance-service.test.ts --maxWorkers=2 --reporter=dot
npx vitest run tests/unit/llm/chat-turn-guard.test.ts tests/unit/maintenance-harness-apply.test.ts tests/unit/blueprint-maintenance-changeset.test.ts --maxWorkers=2 --reporter=dot
npx vitest run tests/unit/blueprint-maintenance-history-ui.test.ts --maxWorkers=2 --reporter=dot
```

浏览器验证位于 [维护交互测试](../../tests/e2e/blueprint-maintenance.spec.ts)、[工作台测试](../../tests/e2e/blueprint-workbench.spec.ts)与[会话测试](../../tests/e2e/project-conversation.spec.ts)，20 项均有通过结果。生产 React、样式和聊天控制器运行在 Chromium 中，IPC 和供应商为测试替身。组合运行提供其中 19 项的通过结果，单独运行提供未关联节点用例的通过结果；后者按画布虚拟化行为检查显示节点、35 个来源节点的完整性及再次折叠。

```powershell
$env:NO_PROXY='127.0.0.1,localhost'
$env:JANUS_E2E_PORT='41843'
npx playwright test tests/e2e/blueprint-maintenance.spec.ts tests/e2e/blueprint-workbench.spec.ts tests/e2e/project-conversation.spec.ts --workers=2
npx playwright test tests/e2e/blueprint-workbench.spec.ts --grep 'additional edgeless' --workers=1
```

`npx playwright test --config playwright.desktop.config.ts tests/e2e/blueprint-janus-capsule.spec.ts --output artifacts/blueprint-maintenance-desktop-results`：1 项通过。真实 Electron 构建在隔离配置目录中读取临时 Note，验证画布、详情和对话布局，以及无模型或讨论时禁用的“整理为提案”按钮。测试在打开工作台前显式启用目标实验功能。

`npm run typecheck:strict-unused`、`npm run build`、`npm run i18n:check` 与本次文件的 `git diff --check` 通过。修改的生产文件 ESLint 无错误；JanusChat 中有 4 条修改范围外的中文文本警告。`npm run check:notes` 仍报告其他文档的 4 个问题：debug-mode-plan 缺少 Proposal 和 Risks 两节，worktree-composer-entry-motion 的关系含非法字段，dsh-integration 使用旧路径布局；本决策没有结构错误。

人工查看完整工作台的提案截图，消息区内的分组、删除确认和输入框可见。真实模型供应商的提案生成未验证。
