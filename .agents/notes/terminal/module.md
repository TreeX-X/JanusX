---
{
  "schema": "harness-note/2",
  "id": "bdd26e4e-8207-4c1f-8ea3-21f450ee7570",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-09-26",
  "class": "architecture",
  "tags": ["terminal","shell"],
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/terminal/manager.ts",
      "symbol": "TerminalManager",
      "role": "entry"
    },
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/main/ipc/terminal-handlers.ts","role":"implementation"}
  ],
  "interfaces": [
    {"name":"TerminalManager","direction":"provides"},
    {
      "name": "AgentSessionRegistry",
      "direction": "needs",
      "provider": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662"
    }
  ],
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/23372e89-e580-446d-b345-05c8a5c31d87"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/0358ada8-8f0d-4fcd-8f78-19d14e2b6b19"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/e29da5b4-dc65-40a9-883d-9026e3b280b1"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a976752-d637-40c7-9fa3-bce52ac5dc15"}
  ],
  "updated": "2026-10-08T03:43:45.318Z",
  "moduleState": "partial"
}
---

# 终端与外部 CLI

## Responsibility

管理 PTY 进程、终端输入输出、外部 CLI 的启动与终端界面。终端 IPC 通过会话模块的 AgentSessionRegistry 关联会话与终端事件；终端模块不拥有会话持久化或 Task 验收规则。

下列链接保留已有决策、阶段需求和交付记录的阅读路径；正文及生命周期由原 Note 负责。历史 parent 仅组织文档，跨模块关联由本声明的 related-to 补充。模块声明只在职责、接口、明确依赖或代码入口变化时维护。

## Design

终端阅读入口分为状态、设置、外部 CLI 和 Shell 语义；各组可跨模块引用：

状态显示链（路由与投影分层，互链不合并）：[model-lifecycle](./terminal-model-lifecycle.md)、[sidebar-states](./terminal-sidebar-states.md)、[status-display](./terminal-status-display.md)、[idle-prompt](./claude-idle-prompt-tab-status.md)、[status-ring](./terminal-status-ring.md)、[sidebar-hierarchy](./sidebar-terminal-hierarchy.md)、[context-telemetry](./claude-opencode-context-telemetry.md)。

设置绑定链（演进关系已由正文 supersede 声明）：[settings-llm](./settings-terminal-llm.md)、[provider-collections](./terminal-provider-collections.md)、[tabs-projectors](./terminal-tabs-per-format-projectors.md)、[settings-todos](./requirements/settings-terminal-llm-todos.md)、[background-image](./requirements/terminal-background-image.md)、[workbench-transition](./settings-workbench-transition.md)。

cc-switch 机制以总纲为父：[port 总纲](./requirements/cc-switch-port.md)为本域直接子，其下 detect-install、cli-matrix、multi-terminal、pi-janus 四篇以总纲为父；profile-switch 与 llm-sync 两篇 archived 历史保持冻结不动。

Shell 语义与外围：[adhoc-parity](./adhoc-shell-parity.md)、[self-heal-parity](./command-error-self-heal-parity.md)、[cold-restore](./shell-cold-restore.md)、[orca-parsing](./orca-terminal-acquisition-parsing.md)、[ime-drift](./ime-candidate-drift.md)、[pane-tree](./pane-tree-subagent.md)、[monaco-diff](./monaco-diff-single-line-number.md)、[turn-history](./terminal-right-island-turn-history.md)。

island 一词两义（pane 姿态层与 turn 历史浮层）为术语债，改名消歧前两篇并存，不合并。

## Acceptance criteria

以下保留 2026-09-26 文档整理的验收原文与勾选状态，供旧 Task 引用；其中篇数是当时快照，不是当前模块大小，新增工作也不强制改写历史 parent。

- [x] AC-1: 本域 22 篇直接子与 cc-switch 4 篇孙节点全部携带有效 parent，无孤儿。
- [ ] AC-2: archived 两篇（profile-switch、llm-sync）保持冻结，不复活不改写。
- [ ] AC-3: 新增终端工作引用本域定位，不再新建平铺孤儿。
