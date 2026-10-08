---
{
  "schema": "harness-note/2",
  "id": "f013beaa-bff7-4656-b086-d4816608f905",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-30",
  "class": "feature",
  "tags": ["blueprint","janus-chat","terminal","dispatch","maintenance"],
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---

# 蓝图左侧控件阉割，改为右侧会话派发到工作终端

## Problem

上一轮把上下文改成跟随画布焦点成批注入之后，左侧画布剩下的控件全都成了中转站，没有一个是自己该做的事：

- 「维护此节点」——只是把一个 nodeId 塞进 store，让面板能读到它。上下文已经不需要这个中转了
- 「开始工作」——只调 `focusNode` 记一个 `activeSession`
- 「进入终端」——门判断看 `node.workspaceId`，而 Note 投影节点该字段恒为 null，所以按钮是**永久灰的**；真正决定能不能开终端的是 checkout 路径
- 「复制实施 prompt」——把 `buildImplementPrompt` 那段死文本塞进剪贴板
- 工具栏「在对话中变更」——和「维护此节点」重复

更要紧的是：这些控件让「先讨论、再写 Note、再开工」看起来像三个独立的按钮，实际上后两步之间没有任何连接。用户点「进入终端」拿到的是一段静态 prompt，终端里的 Agent 完全不知道右侧聊过什么；干完了也没有任何回写，只有 `boundTerminalId` 让 analyzer 在终端关闭时更新一下状态。

派发缺少的那根线不是 UI 问题，是**缺少一次真实的交接**：把对话结论变成终端能读的东西。

## Decision

### 画布只做检视

删除全部左侧动作控件及其死代码：详情面板的动作区与终端操作区（含终端类型选择器、进入终端、复制 prompt）、右键菜单除「节点详情」外的全部项、内嵌工具栏的「开始工作」、工作台顶栏的「在对话中变更」、FocusView 的「Open Terminal」。

终端那一行保留，但降级为纯只读状态，未绑定时提示去右侧派发。随之删除 `activateWorkSession`、`focusOrCreateTerminal`、`buildImplementPrompt`、`copyImplementPrompt`、`warmTerminalPreset` 及其 import，以及 17 个不再可达的 i18n 字面量。

### 派发是宿主动作，不是变更集操作

**不**新增 `BlueprintOperation` 变体。`changeset.ts` 有六处对 10 个操作字面量的穷举 switch，`service.ts` 的 `isAuditRecord` 用 `default: return false` 校验，`changeSetSnapshot` 已作为 JSON 落盘——加一个副作用操作会同时炸掉审计记录校验和旧记录的向前兼容，而且「撤销一次终端启动」本身没有意义。

派发因此是面板上的独立动作，走 [dispatch-brief.ts](../../../src/main/janus/maintenance/dispatch-brief.ts)：

- `composeDispatchBrief` 复用提案的同一套授权闸门（抽出 `authorizeTurn`：会话归属 + 授权工作区根路径必须与已挂载的 agent session 一致）
- 模型只产出散文：目标 / 步骤 / 验收 / 约束 / Note 引用
- **`noteRefs` 与授权集合取交集**，模型编造的引用到不了终端
- 简报文本由宿主渲染成唯一函数，不在渲染进程拼模板
- `dispatchAnchorNodeId` 选出要绑定的节点

### 闭环复用已有的回执

派发时绑定终端到 anchor 节点（复用 `bindTerminal`），于是既有的 `analyzer.analyzeTerminal` → `findNodeByTerminal` → `scheduleAnalyze({trigger:'terminal-close'})` 整条链自然生效：关闭终端仍会触发该节点的最终分析。**没有新增任何回执机制**，只是让派发走上原来「进入终端」那条已经能闭环的路。

`focusNode` 也从画布移到这里——派发本来就是「对这个节点开工」，`activeSession` 归它记录更诚实。

### 简报预填不提交

用户明确选择：简报生成后可编辑，派发时只写入 PTY 不追加换行，由用户自己按回车。这与 `buildContinueHandoff` 的自动提交不同，是刻意保留的一次人工确认。

派发不强制先写 Note：维护任务从 `ensureTask()` 按需创建，所以「讨论完直接派发、Note 一个字不动」是完整可走的路径。写 Note 仍需提案审批，两件事解耦。

## Alternatives considered

- 把派发做成 ChangeSet 里的操作类型：见上，六处穷举加已落盘审计 JSON，且撤销语义不成立
- 让 Agent 用 `janus.blueprint.view` 之类的工具触发终端：该工具是画布 overlay 专用（`applyViewPatch` 只产出 layout/collapse/focus），与终端无关；且它至今未被接线
- 复用 `continueAgentSession` 的自动提交交接：那是给「恢复会话」用的，带 6 秒延时自动发送；派发需要人工确认
- 简报由宿主确定性拼接（goal + 对话尾 + Note 列表）：更快更省，但丢掉模型从对话里提炼结论的能力；用户选择让 Janus 现场写
- 保留「进入终端」但修好禁用判断：仍是一个与对话无关的中转按钮，且继续让用户以为派发和讨论是两件事

## Consequences

画布不再有任何写操作或派发入口，唯一的控制面是右侧 Janus 面板，顺序即语义：讨论 → 整理为提案 → 审批写 Note → 写实施简报 → 派发到工作终端。

新增 `blueprint:dispatch:*` 一组 i18n 字面量与 `JANUS_COMMAND_CHANNELS.dispatchComposeBrief` 一个频道（命令频道 32 → 33）。维护任务的创建时机从「点整理为提案」提前到「点写简报或整理为提案」，两者共用 `ensureTask`。

`buildImplementPrompt` 随画布一起删除，实施交接的唯一来源变成模型生成的简报。

## Verification

2026-09-30 落盘验证：简报模块 9 条单测；e2e 覆盖「画布无控件」「简报→预填不提交→绑定 anchor」「失败不启动终端」「手改简报按原样发送」。

```text
npx vitest run tests/unit/blueprint-dispatch-brief.test.ts tests/unit/blueprint-context-scope.test.ts tests/unit/janus-ipc-contract.test.ts
npx vitest run tests/unit
npm run typecheck
npm run lint
npm run i18n:check
```

```powershell
$env:NO_PROXY='127.0.0.1,localhost'
$env:JANUS_E2E_PORT='41872'
npx playwright test tests/e2e/blueprint-maintenance.spec.ts tests/e2e/blueprint-workbench.spec.ts tests/e2e/blueprint-composition.spec.ts --workers=2
```

e2e 23 项全通过。`npx vitest run tests/unit` 剩余失败均为存量：`agent-notes-check` 的 4 条是 debug-mode-plan 缺 Proposal/Risks、worktree-composer-entry-motion 缺 supersedes 范围字段、dsh-integration 路径不合规；`experimental-features`、`planche-theme`、`theme-registry` 为存量开关与主题漂移；`feishu-settings-ipc` 仅在并行负载下偶发。

复查点：若日后要让派发记录进入 Janus island 的 run 轨道，应填 `SubAgentRun.nodeId`/`terminalId`（`src/shared/subAgentRun.ts`），而不是再加一条蓝图侧的绑定。