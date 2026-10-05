---
schema: harness-note/1
id: 95ec5f71-33e3-4f71-aa05-d3e725c33b10
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags: [agent, harness, parent, governance, architecture:module]
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/15a5d590-1224-5c2e-8a5a-0941429f10f1
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/31cda2d8-3b47-5cce-affd-3978b2189c19
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/4f9cb92a-9bf8-55be-b2a5-bf65e5124bee
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/82db94eb-97de-5c31-a47f-0723e8c4a9d3
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/10bb564c-beff-486e-8ba3-368da1017652
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/939f0bcf-10ec-555f-bd6c-7fdf041c8047
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/dec987d8-570e-57f0-9694-3e2475a5a532
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/90af6e6c-526e-58a8-b0c1-f524a24af92b
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/4ffa1606-df23-5880-a1a5-003ab5fac9e3
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/d9f1d453-d9cc-5fba-8655-6ac51f3cb75c
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/fbac0251-beff-50d7-9363-18fa7e812781
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/854981c7-ab43-521f-a379-020ce1549f12
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/958007ff-748f-57c1-ae16-b9b99a94c198
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/1645e12c-3b5f-4035-99ac-ba1fb8d02836
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/350594c4-3e53-4645-aeab-57e4adeffc36
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/f013beaa-bff7-4656-b086-d4816608f905
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3efc89cf-3aa2-4e1e-829f-a0abc4319691
  - type: governed-by
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/11d8826d-52d7-58bb-99bd-49b6ba04dfaf
codeRefs:
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/harness/execution-adapter.ts
    role: entry
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/llm/janus-agent-ports.ts
    symbol: buildJanusChatTurnPorts
    role: implementation
---

# Agent 对话与执行

## Goal

把 JanusX 的对话、工具、任务线程和执行回执接入共享 Agent 运行时。任务启动、验证与完成沿用已有契约和回执入口；模块声明及蓝图显示不赋予执行权限，也不决定任务完成。

下列链接保留已有决策、阶段需求和交付记录的阅读路径；正文及生命周期由原 Note 负责。历史 parent 仅组织文档，跨模块关联由本声明的 related-to 补充。模块声明只在职责、接口、明确依赖或代码入口变化时维护。

## Scope

通用工程工具、MCP、Note 编辑、压缩和 WorkflowX 模式由 agentX 提供，Janus 负责模型与会话端口、审批界面、子会话事件归属及产品扩展。项目会话从共享工具清单继承工程能力；受限维护讨论继续使用调用者的工具限制。具体分工见 [agentX 复用边界](./2026-10-04-agentx-harness-inheritance--bd7fd0c6.md)。

循环主干：[loop-refactor](./2026-08-08-agent-loop-refactor--33f0f481.md)、[chat-alignment](./2026-09-12-janus-agent-chat-alignment--6813a52b.md)、[roundtable-loop](./2026-09-16-roundtable-chat-harness-loop--f8f6586b.md)、[turn-guard](./2026-09-17-chat-turn-guard-domain-s6--fd109997.md)、[loop-sanitize](./2026-09-26-chat-system-mid-conversation--e373dd26.md)、[feedback-parity](./2026-09-26-janus-chat-feedback-parity--54b1046a.md)；切除对[removal-plan](./2026-09-18-legacy-loop-removal--cddc53a5.md)与[removal-执行](./2026-09-18-legacy-loop-removal--b766003d.md)成对保留，前者为后者的 cut-list 依据。

产物与契约：[artifact-bundle](./2026-09-16-roundtable-artifact-bundle-s5--46d65946.md)、[artifact-card](./2026-09-16-roundtable-artifact-card-s5--6471d8f2.md)、[artifact-preview](./2026-09-09-artifact-preview--e74d8e85.md)、[task-contract](./2026-09-18-task-contract-adoption--6b7c688e.md)。

S6 维护面五件套：[discussion](./2026-09-17-maintenance-discussion-unified-s6--cb026d42.md)、[guard](./2026-09-17-maintenance-harness-guard-s6--2b73dd7d.md)、[bridge](./2026-09-17-maintenance-harness-bridge-s6--1f21d390.md)、[apply](./2026-09-17-maintenance-harness-apply-s6--66bf1be8.md)、[shared-render](./2026-09-17-maintenance-panel-shared-render-s6--c0f3f75a.md)。

主线与执行器：[repo-identity-S7](./2026-09-17-harness-repo-identity-s7--0f2f5228.md)、[execution-adapter-S8](./2026-09-18-harness-execution-adapter-s8--553f17a8.md)、[portable-results](./2026-09-18-harness-portable-results--11d8826d.md)、[s9-readiness](./2026-09-18-harness-s9-readiness--28ce4fe4.md)、[undo](./2026-09-18-harness-undo--ee0e8ff1.md)、[xdo-executor](./2026-09-18-desktop-xdo-executor--b057b3f0.md)、[review-repair](./2026-09-18-independent-review-repair--b055c1fe.md)、[handoff-brief](./2026-09-18-handoff-brief--a972542e.md)、[verify-harden](./2026-09-17-verify-pipeline-harden--40cc28a8.md)、[notifications](./2026-06-28-agent-notifications--ff0fe2db.md)。

PI 运行时三篇为反转续接非重复：[context-recognition](./2026-09-11-janus-pi-context-recognition--e34329c5.md)否决 hook 在先，[hook-management](./2026-09-13-janus-pi-hook-management--a8a80c8f.md)声明理由过时并建 hook 在后，均以本域为父。

## Acceptance criteria

以下保留 2026-09-26 文档整理的验收原文与勾选状态，供旧 Task 引用；其中篇数是当时快照，不是当前模块大小，新增工作也不强制改写历史 parent。

- [x] AC-1: 本域 29 篇直接子全部携带有效 parent，执行闭环检索收敛。
- [ ] AC-2: legacy 双件保持计划与执行先后关系，不二合一。
- [ ] AC-3: PI 两篇反转关系保留，不判重复。
