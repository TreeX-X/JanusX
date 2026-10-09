---
{
  "schema": "harness-note/2",
  "id": "5480ef6d-5a86-45fd-9719-948d4cc462e5",
  "kind": "task",
  "lifecycle": "accepted",
  "created": "2026-09-25",
  "class": "simplification",
  "tags": ["blueprint","janus-chat","workspace"],
  "relations": [
    {"type":"parent","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5"},
    {
      "type": "implements",
      "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5",
      "criteria": ["AC-10"]
    }
  ],
  "work": {
    "scope": [
      {
        "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
        "paths": [
          "src/renderer/src/components/blueprint/",
          "src/renderer/src/components/janus/useJanusChat.ts",
          "src/renderer/src/i18n/",
          "src/renderer/src/lib/electron-api-fallback.ts",
          "src/renderer/src/services/blueprint.ts",
          "src/main/harness/maintenance-apply.ts",
          "src/main/janus/maintenance/service.ts",
          "src/main/llm/chat-orchestrator.ts",
          "src/main/ipc/janus-handlers.ts",
          "src/preload/index.ts",
          "src/shared/",
          "tests/unit/",
          "tests/e2e/",
          ".agents/notes/"
        ]
      }
    ],
    "acceptanceRefs": [
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5","criterionId":"AC-10"}
    ],
    "verification": [
      {
        "id": "V-1",
        "kind": "command",
        "required": true,
        "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
        "cwd": ".",
        "program": "npm",
        "args": ["run","typecheck"]
      }
    ],
    "review": "independent"
  },
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/a09981f4-1a94-42ce-9255-2e1127cfa37b"
}
---

# 工作区蓝图独立对话

## Goal

蓝图右侧提供独立于 island 的工作区对话。用户能够先只读讨论，再通过控件整理文件修改并确认应用。JanusChat 的消息渲染、模型调用、流式、停止和重试能力继续复用。

## Scope

useJanusChat 的会话注册表持有蓝图会话及工作区生命周期。蓝图使用稳定的 BLUEPRINT_PANEL_VIEW_REF，与 island 使用不同的 conversationId、消息和流式状态，且不出现在 island 会话列表。普通面板卸载、重开和节点选择不清空会话。注册表持续订阅工作区身份及目录；切换时即使面板关闭，也会停止旧流、取消旧 Agent 会话、清空消息与旧维护任务，再绑定当前工作区。

同一工作区的面板历史保留到切换、主动清空或应用重启。面板历史不受个人会话的 200 条存储裁剪影响；发给模型的单轮上下文仍使用既有预算。应用重启不恢复面板历史，旧存储中的面板记录被排除，island 保留个人会话。

BlueprintMaintenancePanel 仅配置项目 discuss 上下文、plan 权限和画布选择的 Note 引用。普通发送不带 maintenanceTaskId；读取权限由主进程白名单约束。显式整理、真实文件预览、批准与失效规则见[文件审批决策](../blueprint-maintenance-approval-gap.md)。任意源码修改和跨重启恢复面板历史不在范围内。

## Acceptance criteria

- [x] AC-1: Right column contains no legacy maintenance controls, context form, session sidebar or resource chips; minimal JanusChat and explicit host actions remain.
- [x] AC-2: One panel conversation across workspace switches; ordinary sending emits a project stream scoped to the active workspace without maintenanceTaskId. Explicit organization carries its host task ID. Panel history is ephemeral across application restarts.
- [x] AC-3: Closing/reopening the panel and selecting nodes preserve its conversation independently of island. Switching workspaces while closed cancels the old turn and clears its messages and pending proposal before another send.
- [x] AC-4: Ordinary sending has no maintenance task ID or workspace write tools. Only the organization control requests a proposal; continuing discussion does not auto-generate or apply changes.
- [x] AC-5: Organization exposes actual Note file paths, operation reasons and before/after contents. Both bulk and partial approval require a successful preview of the selected operations.
- [x] AC-6: Application consumes the host-owned preview, preserving new Note identities and contents. Replaced proposals, changed selections, detached workspaces and changed source bytes invalidate approval without overwriting files.

## Verification

当前机器验证及命令见[文件审批验证](../blueprint-maintenance-approval-gap.md#verification)。project-conversation 覆盖独立 ID、面板重挂载、个人历史保留、关闭期间切换与旧流取消；blueprint-maintenance 覆盖关闭期间取消提案、可见文件预览和确认门；maintenance-harness-apply 使用真实文件核对预览与落盘内容。

## Alternatives considered

- 保持组件内部检测工作区切换：实现局部，但组件卸载期间不会执行检测，重新挂载也没有上次工作区记录。
- 为蓝图另建聊天引擎：隔离直接，但消息、模型、流式和重试需要重复维护。独立会话配合现有渲染及调用链即可满足隔离要求。
- 按工作区永久保存多份蓝图会话：便于回看，但增加多会话管理与恢复语义。当前需求只保留本次工作区对话，切换即重置。

## Results

工作区生命周期由持续存在的注册表管理；蓝图会话复用 JanusChat 并与 island 隔离。显式整理产生待审阅文件，确认应用宿主已准备的内容。行为、文件事务与浏览器检查的证据由文件审批决策统一记录。

## Progress

Historical delivery statements remain in this document; no v2 execution receipt is asserted.

## Evidence

Original source: Git e433bb8627150126b782a301352da05e2149c18b:.agents/notes/2026-09-25-blueprint-workspace-dialog--5480ef6d.md. See docs/migrations/note-v2.json for the raw-source hash and historical execution.

## Handoff

Main Agent owns this Task. Reassess scope, fixed acceptance sources and verification before any new run. Preserve independent-review obligations; subagents read only.
