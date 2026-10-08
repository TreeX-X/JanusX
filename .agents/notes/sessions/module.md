---
{
  "schema": "harness-note/2",
  "id": "dc1aca7c-408f-406d-add4-ba78d556b662",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-09-26",
  "class": "architecture",
  "tags": ["session","workspace","worktree"],
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/sessions/session-registry.ts",
      "symbol": "AgentSessionRegistry",
      "role": "entry"
    },
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/main/ipc/session-handlers.ts","role":"implementation"}
  ],
  "interfaces": [{"name":"AgentSessionRegistry","direction":"provides"}],
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/abb1ccb3-be21-5f64-9b55-de5089e621e9"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/d87e7a46-1d85-45e5-a635-63a6838d441c"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/70beb72a-424d-5e96-a0d0-8e1a29635220"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/640a69dd-bbea-4606-b51a-f9b545de37a5"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/97a21dee-2b5e-4cf8-8298-28263eeb02bb"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/cee742a2-d7ca-4a61-8021-e1e118534c96"}
  ],
  "updated": "2026-10-08T02:54:24.778Z",
  "moduleState": "partial"
}
---

# 会话与工作区

## Responsibility

保存会话身份、终端绑定、转录读取与检查点关联，并在工作区和 worktree 范围内呈现会话。AgentSessionRegistry 为终端等调用方提供会话注册与查询；PTY 进程和 Task 验收由其他模块负责。

下列链接保留已有决策、阶段需求和交付记录的阅读路径；正文及生命周期由原 Note 负责。历史 parent 仅组织文档，跨模块关联由本声明的 related-to 补充。模块声明只在职责、接口、明确依赖或代码入口变化时维护。

## Design

Checkpoint 不变式：[snapshot-safety](./checkpoint-safety.md)（永不静默变异）与[retention](./checkpoint-retention.md)（40/30 天双帽）互补，同属本域。

会话所有权与耐久：[checkpoint-migration](./session-checkpoint-migration.md)（独立工具退役、checkpoint 归属 session）与[durability](./session-durability-archive.md)（quit flush、归档只读）为枢纽；史前提案[transcript-backfill](./external-session-transcript-backfill.md)保留为附录，由[external-backfill](./external-session-backfill.md)承接落地。

内容管线以[conversation-content](./session-conversation-content.md)为数据契约核心：[change-events](./session-change-events.md)、[engine-capabilities](./session-engine-capabilities.md)、[opencode-driver](./opencode-session-driver.md)、[scan-derivation](./session-scan-derivation.md)、[resume-detail](./session-resume-detail.md)为引擎与读取附节。

呈现以需求[orca-restore](./requirements/session-mgmt-orca-restore.md)为头：[expand-content](./session-checkpoint-expand-content.md)、[timeline-v5](./session-timeline-v5.md)、[windowed-reading](./session-windowed-reading.md)、[timeline-live](./session-timeline-live.md)、[modal-scope](./session-modal-scope-display.md)为渲染切片与修补。

可靠性附录：[count-truth](./session-checkpoint-count-truth.md)、[expand](./session-checkpoint-expand.md)、[flicker-storm](./session-flicker-storm.md)、[hook-replay](./hook-event-replay-authority.md)。

工作区与线程：[总需求](./requirements/workspace-session-checkpoint-continue.md)、[sessions-v1](./workspace-sessions-v1.md)、[row-hover](./workspace-row-hover-reveal.md)、[row-menu](./workspace-row-actions-menu.md)、[task-threads](./persistent-task-threads.md)、[conversation-controller](./project-conversation-controller.md)、[thread-registry](./thread-registry-activation.md)、[hit-slop](./workbench-close-hit-slop.md)、[opencode-resume](./opencode-continue-native-resume.md)；归档提案 thread-close 保持冻结。

Worktree 生命周期：[isolation 需求](./requirements/worktree-isolation-parallel-agents.md)与[总需求 P2 部分](./requirements/workspace-session-checkpoint-continue.md)归一以后者为准；[create-delete](./worktree-create-delete.md)、[ship-merge](./worktree-ship-merge.md)为实现两节；[sidebar-scoping](./worktree-sidebar-scoping.md)、[path-avatar](./worktree-path-avatar.md)、[selector-stability](./worktree-selector-stability.md)、[file-tree-scope](./worktree-file-tree-scope.md)为侧栏定域修补。

## Acceptance criteria

以下保留 2026-09-26 文档整理的验收原文与勾选状态，供旧 Task 引用；其中篇数是当时快照，不是当前模块大小，新增工作也不强制改写历史 parent。

- [x] AC-1: 本域 38 篇直接子全部携带有效 parent，会话十八连发可按四组检索。
- [ ] AC-2: 中文旧根 a361448b 仅作前身附录，真源以 c23ebb35 为准，不三足分立。
- [ ] AC-3: hover-reveal 与 actions-menu 保留一显一隐决策对立，不合并。
