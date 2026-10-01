---
schema: harness-note/1
id: 350594c4-3e53-4645-aeab-57e4adeffc36
kind: decision
lifecycle: implemented
created: 2026-09-30
class: simplification
tags: [blueprint, janus-chat, maintenance, dispatch, ux]
---

# 右侧面板收敛为一条主动作栏

## Problem

派发链路建好之后，右侧面板反而更挤了。根因是位置：`discussionFooter` 渲染在 `.janus-chat-messages` **内部**（`JanusChat.tsx`），所以整堆操作跟着对话一起滚走——审批卡滚走了，简报编辑器也滚走了。而需要人做决定的东西滚走是最坏的性质。

堆里同时有 12 件事：节点标题、policyHint、任务阶段、两个动作、一张可能很高的审批卡、一份审计日志、一个终端选择器、两个派发按钮、一个 180px 编辑框。两个动词（改需求 / 开工）被五个常驻控件稀释成了一道选择题。

范围声明也是同样的毛病：它是有价值的信息（删掉画布显式入口后，这是用户唯一能看到「Janus 读了什么」的地方），但常态占一整行，且 `role="status"` 会在每次搜索词变化时反复播报。

## Decision

### 位置：composer 上方，钉住

给 `JanusChat` 新增 `aboveComposer` 插槽，渲染在消息滚动区**之外**、输入框正上方。不放右侧顶部：那里是面板 chrome（模型、资源、清除），而「写 Note / 开工」不是设置，是打完字的下一步；距离输入框也更远。

`BlueprintMaintenanceActions`、`BlueprintDispatchActions` 及其 CSS 合并为单个 `BlueprintActionBar`，三组件变一组件——它们共享同一份 target/task 状态，拆开只是把状态举过头顶。

### 三个主动动作，其余都是状态

```
[整理 Note]  目标终端 [codex ▾]  [派发]   读 12 篇  [更多]
```

讨论在输入框里发生；用户主动发起的只有这三个。「更多」折叠任务生命周期与应用历史，不常驻。

派发收敛为**一次点击**：Janus 整理涉及 Note → 写实施简报 → 打开或复用目标终端 → 预填。上一轮的面板内简报编辑器删掉了，因为终端本身就是审阅面——预填不发送的语义下，用户在终端里读、改、回车，比在面板里读一遍再去终端粘贴更短。

### 范围声明降级为计数片

常态折叠成 `读 12 篇` 的小片，信息挪到了你真想核对时才会盯的位置。异常（跨 checkout / 超限丢弃 / 读不到）保留为显眼的一行——这三种情况直接改变模型能看到什么，静默才是错的。`role="status"` 从常驻声明上撤掉。

### 审批：一次点击 vs 部分通过

原来的快速路径是三步：勾「全选」→ 逐条勾删除确认 → 点批准。删除被刻意排除在批量之外是对的默认，但不该让它把批量也拖成仪式。

新增 `bulkApproval()`：一次点击覆盖全部非删除操作，走依赖闭包。**关键约束**——非删除操作可能依赖删除（先删后建），闭包会把删除拖进来。所以 `blockedDeletes` 显式返回，栏上直接说明「N 项删除是其他操作的前置，无法批量批准」，并禁用批量按钮转而展开逐项视图。这不是理论风险，`bulkApproval` 的第三条单测就是它。

删除要进批量时，只勾一个带计数的不可逆确认（`同时删除这 N 项`），替代原来的 N 个逐条 checkbox。

`MaintenanceApproval` 的 `key={JSON.stringify(changeSet)}` 保留：提案换版后必须丢弃旧的勾选状态，否则会把上一版的勾带到新提案上。

### stale 任务禁用整理

源 Note 基线失效后，任务状态转 `stale`。此时「整理」与「派发」都禁用——继续生成提案等于对着宿主已经否决的事实做提案。

## Alternatives considered

- 操作栏放右侧顶部：语义错位（动作不是设置），且离输入框远，见上
- 审批卡整体进折叠栏、默认展开：审批卡高（分组 + 删除确认），长期挤占消息区；折叠默认态让「快速全部」失去意义——快速路径本就不需要看见卡片
- 保留面板内简报编辑器作为二次审阅：与「预填不发送」重复。用户要在两处读同一段文本
- 批量批准包含删除：删除不可撤销，且 `apply` 本身也要求 `confirmedDeleteOperationIds`。批量默认覆盖它等于把高危门变成默认值
- 用 `discussionOnly` 之类既有插槽复用位置：那个插槽会连输入区一起藏掉，操作栏需要两者共存

## Consequences

面板稳定态从 12 行降到 1 行 4 个控件。审批默认折叠，「全部批准并应用 N 项」一次点击；需要精细控制时才展开逐项视图。任务生命周期与应用历史退到「更多」后面。

`JanusChat` 多一个 `aboveComposer` 插槽，`discussionFooter` 保留（蓝图不再使用，但它是通用宿主插槽）。新增 `maintenance.actionsAria` 供工具栏与测试定位；`scope.*` 三个字面量、`dispatch.compose/composing/briefAria/recompose` 与「复制实施 prompt」等一并删除，`types.ts` 由 `npm run i18n:types` 重新生成而非手改。

顺带修掉一个此前无人断言的 bug：`Select` 的 `aria-label` 是 JSX 属性，而组件解构的是 `ariaLabel`，标签从未落到触发按钮上。

## Verification

2026-09-30 落盘验证：批量审批 5 条单测（含删除被闭包拖入的关键用例）；e2e 覆盖「一次点击派发」「批量批准不含删除」「删除需一次确认」「部分通过仍能展开」以及栏的常态四控件 + 计数片。

```text
npx vitest run tests/unit/blueprint-bulk-approval.test.ts
npx vitest run tests/unit
npm run typecheck
npm run lint
npm run i18n:types && npm run i18n:check
```

```powershell
$env:NO_PROXY='127.0.0.1,localhost'
$env:JANUS_E2E_PORT='41890'
npx playwright test tests/e2e/blueprint-workbench.spec.ts tests/e2e/blueprint-maintenance.spec.ts tests/e2e/blueprint-composition.spec.ts --workers=2
```

e2e 25 项全通过。`npx vitest run tests/unit` 剩余失败均为存量：`agent-notes-check` 的 4 条是 debug-mode-plan 缺 Proposal/Risks、worktree-composer-entry-motion 缺 supersedes 范围字段、dsh-integration 路径不合规；`experimental-features`、`planche-theme`、`theme-registry` 为存量开关与主题漂移；`feishu-settings-ipc` 单跑亦失败，`pi-hook-extension` 仅在并行负载下偶发。

复查点：若日后要让「更多」承载撤销以外的批量操作，先确认它没有重新变成第二个常驻动作区——那正是本轮要消除的形态。