---
schema: harness-note/1
id: dc1aca7c-408f-406d-add4-ba78d556b662
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags: [session, workspace, worktree, parent, governance]
---

# 会话工作区父域

## Goal

09-22 十八连发把一次会话重构切成 PR 粒度碎片，单篇不可独立理解；checkpoint 与 worktree 定义散在三处。本域提供唯一父节点，按所有权耐久、内容管线、呈现、可靠性四组收敛检索，不删除任何历史篇。

## Scope

Checkpoint 不变式：[snapshot-safety](./2026-06-27-checkpoint-safety--94f306fb.md)（永不静默变异）与[retention](./2026-09-21-checkpoint-retention--bfc7dcb4.md)（40/30 天双帽）互补，同属本域。

会话所有权与耐久：[checkpoint-migration](./2026-09-21-session-checkpoint-migration--bb3ef36c.md)（独立工具退役、checkpoint 归属 session）与[durability](./2026-09-21-session-durability-archive--b74e8ae5.md)（quit flush、归档只读）为枢纽；史前提案[transcript-backfill](./2026-09-22-external-session-transcript-backfill--d0720a3c.md)保留为附录，由[external-backfill](./2026-09-22-external-session-backfill--18fffeff.md)承接落地。

内容管线以[conversation-content](./2026-09-22-session-conversation-content--36a4c7d5.md)为数据契约核心：[change-events](./2026-09-22-session-change-events--cb7e75d4.md)、[engine-capabilities](./2026-09-22-session-engine-capabilities--e29da5b4.md)、[opencode-driver](./2026-09-22-opencode-session-driver--ba08f562.md)、[scan-derivation](./2026-09-22-session-scan-derivation--fc8ba315.md)、[resume-detail](./2026-09-22-session-resume-detail--1a6947ed.md)为引擎与读取附节。

呈现以需求[orca-restore](./2026-09-22-session-mgmt-orca-restore--3e9ec8d6.md)为头：[expand-content](./2026-09-22-session-checkpoint-expand-content--7f0d3ec5.md)、[timeline-v5](./2026-09-22-session-timeline-v5--e782007f.md)、[windowed-reading](./2026-09-22-session-windowed-reading--e968d1ae.md)、[timeline-live](./2026-09-22-session-timeline-live--2b60cc2c.md)、[modal-scope](./2026-09-22-session-modal-scope-display--35201fed.md)为渲染切片与修补。

可靠性附录：[count-truth](./2026-09-22-session-checkpoint-count-truth--b363ad92.md)、[expand](./2026-09-22-session-checkpoint-expand--d216f355.md)、[flicker-storm](./2026-09-22-session-flicker-storm--3f2c9a41.md)、[hook-replay](./2026-09-22-hook-event-replay-authority--0358ada8.md)。

工作区与线程：[总需求](./2026-09-21-workspace-session-checkpoint-continue--c23ebb35.md)、[sessions-v1](./2026-09-21-workspace-sessions-v1--b3704d91.md)、[row-hover](./2026-09-21-workspace-row-hover-reveal--ce93b420.md)、[row-menu](./2026-09-19-workspace-row-actions-menu--9108f4a9.md)、[task-threads](./2026-09-18-persistent-task-threads--90af6e6c.md)、[conversation-controller](./2026-09-18-project-conversation-controller--4ffa1606.md)、[thread-registry](./2026-09-18-thread-registry-activation--d9f1d453.md)、[hit-slop](./2026-09-21-workbench-close-hit-slop--8688b5ab.md)、[opencode-resume](./2026-09-25-opencode-continue-native-resume--3a976752.md)；归档提案 thread-close 保持冻结。

Worktree 生命周期：[isolation 需求](./2026-09-19-worktree-isolation-parallel-agents--a361448b.md)与[总需求 P2 部分](./2026-09-21-workspace-session-checkpoint-continue--c23ebb35.md)归一以后者为准；[create-delete](./2026-09-21-worktree-create-delete--636764b9.md)、[ship-merge](./2026-09-21-worktree-ship-merge--7822452e.md)为实现两节；[sidebar-scoping](./2026-09-21-worktree-sidebar-scoping--bda5aa81.md)、[path-avatar](./2026-09-21-worktree-path-avatar--62676495.md)、[selector-stability](./2026-09-21-worktree-selector-stability--37a24b3c.md)、[file-tree-scope](./2026-09-22-worktree-file-tree-scope--c58ff1db.md)为侧栏定域修补。

## Acceptance criteria

- [x] AC-1: 本域 38 篇直接子全部携带有效 parent，会话十八连发可按四组检索。
- [ ] AC-2: 中文旧根 a361448b 仅作前身附录，真源以 c23ebb35 为准，不三足分立。
- [ ] AC-3: hover-reveal 与 actions-menu 保留一显一隐决策对立，不合并。
