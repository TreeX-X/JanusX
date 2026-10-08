---
{
  "schema": "harness-note/2",
  "id": "95ec5f71-33e3-4f71-aa05-d3e725c33b10",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-09-26",
  "class": "architecture",
  "tags": ["agent","harness"],
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/4f9cb92a-9bf8-55be-b2a5-bf65e5124bee"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/82db94eb-97de-5c31-a47f-0723e8c4a9d3"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/10bb564c-beff-486e-8ba3-368da1017652"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/939f0bcf-10ec-555f-bd6c-7fdf041c8047"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/dec987d8-570e-57f0-9694-3e2475a5a532"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/90af6e6c-526e-58a8-b0c1-f524a24af92b"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/4ffa1606-df23-5880-a1a5-003ab5fac9e3"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/d9f1d453-d9cc-5fba-8655-6ac51f3cb75c"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/1645e12c-3b5f-4035-99ac-ba1fb8d02836"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/350594c4-3e53-4645-aeab-57e4adeffc36"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/f013beaa-bff7-4656-b086-d4816608f905"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/3efc89cf-3aa2-4e1e-829f-a0abc4319691"},
    {"type":"governed-by","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/11d8826d-52d7-58bb-99bd-49b6ba04dfaf"}
  ],
  "codeRefs": [
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/main/harness/execution-adapter.ts","role":"entry"},
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/llm/janus-agent-ports.ts",
      "symbol": "buildJanusChatTurnPorts",
      "role": "implementation"
    }
  ],
  "updated": "2026-10-08T04:35:16.603Z",
  "moduleState": "partial"
}
---

# Agent 对话与执行

## Responsibility

WorkflowX v2 中，普通 xdo 直接使用工程工具，不要求建立 Task。Task 绑定执行由 Main 掌握整份文档，子执行上下文只读并返回实现摘要与 Note 草稿。交接在同一 Task 中更新；xdel 只自审，既有独立评审义务保留待办，xflow 和绑定该义务的 xdo 按固定 AC 独立评估。桌面接口保留未完成结果和草稿，模块状态不随 Task 回执自动变化。接入证据见 [WorkflowX v2](../blueprint/workflowx-v2-adoption.md)。

把 JanusX 的对话、工具、任务线程和执行回执接入共享 Agent 运行时。任务启动、验证与完成沿用已有契约和回执入口；模块声明及蓝图显示不赋予执行权限，也不决定任务完成。

下列链接保留已有决策、阶段需求和交付记录的阅读路径；正文及生命周期由原 Note 负责。历史 parent 仅组织文档，跨模块关联由本声明的 related-to 补充。模块声明只在职责、接口、明确依赖或代码入口变化时维护。

## Design

通用工程工具、MCP、Note 编辑、压缩和 WorkflowX 模式由 agentX 提供，Janus 负责模型与会话端口、审批界面、子会话事件归属及产品扩展。项目会话从共享工具清单继承工程能力；受限维护讨论继续使用调用者的工具限制。具体分工见 [agentX 复用边界](../blueprint/agentx-harness-inheritance.md)。

循环主干：[loop-refactor](./agent-loop-refactor.md)、[chat-alignment](./janus-agent-chat-alignment.md)、[roundtable-loop](./roundtable-chat-harness-loop.md)、[turn-guard](./chat-turn-guard-domain-s6.md)、[loop-sanitize](./chat-system-mid-conversation.md)、[feedback-parity](./janus-chat-feedback-parity.md)；切除对[removal-plan](./history/legacy-loop-removal-plan.md)与[removal-执行](./legacy-loop-removal.md)成对保留，前者为后者的 cut-list 依据。

产物与契约：[artifact-bundle](./roundtable-artifact-bundle-s5.md)、[artifact-card](./roundtable-artifact-card-s5.md)、[artifact-preview](./requirements/artifact-preview.md)、[task-contract](./task-contract-adoption.md)。

S6 维护面五件套：[discussion](./maintenance-discussion-unified-s6.md)、[guard](./maintenance-harness-guard-s6.md)、[bridge](./maintenance-harness-bridge-s6.md)、[apply](./maintenance-harness-apply-s6.md)、[shared-render](./maintenance-panel-shared-render-s6.md)。

主线与执行器：[repo-identity-S7](../blueprint/harness-repo-identity-s7.md)、[execution-adapter-S8](./harness-execution-adapter-s8.md)、[portable-results](./harness-portable-results.md)、[s9-readiness](./harness-s9-readiness.md)、[undo](../blueprint/harness-undo.md)、[xdo-executor](./desktop-xdo-executor.md)、[review-repair](./independent-review-repair.md)、[handoff-brief](./handoff-brief.md)、[verify-harden](../desktop/verify-pipeline-harden.md)、[notifications](./agent-notifications.md)。

PI 运行时三篇为反转续接非重复：[context-recognition](../terminal/janus-pi-context-recognition.md)否决 hook 在先，[hook-management](../terminal/janus-pi-hook-management.md)声明理由过时并建 hook 在后，均以本域为父。

## Acceptance criteria

以下保留 2026-09-26 文档整理的验收原文与勾选状态，供旧 Task 引用；其中篇数是当时快照，不是当前模块大小，新增工作也不强制改写历史 parent。

- [x] AC-1: 本域 29 篇直接子全部携带有效 parent，执行闭环检索收敛。
- [ ] AC-2: legacy 双件保持计划与执行先后关系，不二合一。
- [ ] AC-3: PI 两篇反转关系保留，不判重复。
