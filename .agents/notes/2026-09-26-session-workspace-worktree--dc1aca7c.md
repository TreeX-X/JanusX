---
schema: harness-note/1
id: dc1aca7c-408f-406d-add4-ba78d556b662
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags: [session, workspace, worktree, parent, governance, architecture:module]
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a
codeRefs:
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/sessions/session-registry.ts
    symbol: AgentSessionRegistry
    role: entry
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/ipc/session-handlers.ts
    role: implementation
interfaces:
  - name: AgentSessionRegistry
    direction: provides
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/abb1ccb3-be21-5f64-9b55-de5089e621e9
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/d87e7a46-1d85-45e5-a635-63a6838d441c
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/70beb72a-424d-5e96-a0d0-8e1a29635220
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/640a69dd-bbea-4606-b51a-f9b545de37a5
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/97a21dee-2b5e-4cf8-8298-28263eeb02bb
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/cee742a2-d7ca-4a61-8021-e1e118534c96
---

# 会话与工作区

## Goal

保存会话身份、终端绑定、转录读取与检查点关联，并在工作区和 worktree 范围内呈现会话。AgentSessionRegistry 为终端等调用方提供会话注册与查询；PTY 进程和 Task 验收由其他模块负责。

下列链接保留已有决策、阶段需求和交付记录的阅读路径；正文及生命周期由原 Note 负责。历史 parent 仅组织文档，跨模块关联由本声明的 related-to 补充。模块声明只在职责、接口、明确依赖或代码入口变化时维护。

## Scope

Checkpoint 不变式：[snapshot-safety](./2026-06-27-checkpoint-safety--94f306fb.md)（永不静默变异）与[retention](./2026-09-21-checkpoint-retention--bfc7dcb4.md)（40/30 天双帽）互补，同属本域。

会话所有权与耐久：[checkpoint-migration](./2026-09-21-session-checkpoint-migration--bb3ef36c.md)（独立工具退役、checkpoint 归属 session）与[durability](./2026-09-21-session-durability-archive--b74e8ae5.md)（quit flush、归档只读）为枢纽；史前提案[transcript-backfill](./2026-09-22-external-session-transcript-backfill--d0720a3c.md)保留为附录，由[external-backfill](./2026-09-22-external-session-backfill--18fffeff.md)承接落地。

内容管线以[conversation-content](./2026-09-22-session-conversation-content--36a4c7d5.md)为数据契约核心：[change-events](./2026-09-22-session-change-events--cb7e75d4.md)、[engine-capabilities](./2026-09-22-session-engine-capabilities--e29da5b4.md)、[opencode-driver](./2026-09-22-opencode-session-driver--ba08f562.md)、[scan-derivation](./2026-09-22-session-scan-derivation--fc8ba315.md)、[resume-detail](./2026-09-22-session-resume-detail--1a6947ed.md)为引擎与读取附节。

呈现以需求[orca-restore](./2026-09-22-session-mgmt-orca-restore--3e9ec8d6.md)为头：[expand-content](./2026-09-22-session-checkpoint-expand-content--7f0d3ec5.md)、[timeline-v5](./2026-09-22-session-timeline-v5--e782007f.md)、[windowed-reading](./2026-09-22-session-windowed-reading--e968d1ae.md)、[timeline-live](./2026-09-22-session-timeline-live--2b60cc2c.md)、[modal-scope](./2026-09-22-session-modal-scope-display--35201fed.md)为渲染切片与修补。

可靠性附录：[count-truth](./2026-09-22-session-checkpoint-count-truth--b363ad92.md)、[expand](./2026-09-22-session-checkpoint-expand--d216f355.md)、[flicker-storm](./2026-09-22-session-flicker-storm--3f2c9a41.md)、[hook-replay](./2026-09-22-hook-event-replay-authority--0358ada8.md)。

工作区与线程：[总需求](./2026-09-21-workspace-session-checkpoint-continue--c23ebb35.md)、[sessions-v1](./2026-09-21-workspace-sessions-v1--b3704d91.md)、[row-hover](./2026-09-21-workspace-row-hover-reveal--ce93b420.md)、[row-menu](./2026-09-19-workspace-row-actions-menu--9108f4a9.md)、[task-threads](./2026-09-18-persistent-task-threads--90af6e6c.md)、[conversation-controller](./2026-09-18-project-conversation-controller--4ffa1606.md)、[thread-registry](./2026-09-18-thread-registry-activation--d9f1d453.md)、[hit-slop](./2026-09-21-workbench-close-hit-slop--8688b5ab.md)、[opencode-resume](./2026-09-25-opencode-continue-native-resume--3a976752.md)；归档提案 thread-close 保持冻结。

Worktree 生命周期：[isolation 需求](./2026-09-19-worktree-isolation-parallel-agents--a361448b.md)与[总需求 P2 部分](./2026-09-21-workspace-session-checkpoint-continue--c23ebb35.md)归一以后者为准；[create-delete](./2026-09-21-worktree-create-delete--636764b9.md)、[ship-merge](./2026-09-21-worktree-ship-merge--7822452e.md)为实现两节；[sidebar-scoping](./2026-09-21-worktree-sidebar-scoping--bda5aa81.md)、[path-avatar](./2026-09-21-worktree-path-avatar--62676495.md)、[selector-stability](./2026-09-21-worktree-selector-stability--37a24b3c.md)、[file-tree-scope](./2026-09-22-worktree-file-tree-scope--c58ff1db.md)为侧栏定域修补。

## Acceptance criteria

以下保留 2026-09-26 文档整理的验收原文与勾选状态，供旧 Task 引用；其中篇数是当时快照，不是当前模块大小，新增工作也不强制改写历史 parent。

- [x] AC-1: 本域 38 篇直接子全部携带有效 parent，会话十八连发可按四组检索。
- [ ] AC-2: 中文旧根 a361448b 仅作前身附录，真源以 c23ebb35 为准，不三足分立。
- [ ] AC-3: hover-reveal 与 actions-menu 保留一显一隐决策对立，不合并。
