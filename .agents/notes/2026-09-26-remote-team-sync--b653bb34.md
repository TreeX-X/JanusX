---
schema: harness-note/1
id: b653bb34-279f-45db-92d1-313d1c6bcdf5
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags: [remote, hosted, architecture:module]
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/7822452e-cef7-4ef3-a138-2ae6abc84667
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/bda5aa81-dc65-4408-9544-60fdfdf8c836
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a
codeRefs:
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/companion/gateway.ts
    symbol: CompanionGateway
    role: entry
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/hosted/github.ts
    symbol: detectProvider
    role: implementation
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/hosted/gitlab.ts
    symbol: GitlabProvider
    role: implementation
---

# 远程控制与托管协作

## Goal

通过 CompanionGateway 校验远程会话操作，并通过 HostedProvider 适配 GitHub 与 GitLab 的 issue、review、检查及合并。网关负责上下文验证、动作令牌、去重与审计；托管适配通过现有凭据和本地工作树流程协作。远程创建终端仅允许 claude、codex、opencode，janus、pi、dsh 不因本地状态接入获得远控能力。

## Scope

模块覆盖已存在的受控网关与托管平台入口，不声明完整团队身份、服务端同步或 LaunchSurface 已实现。ToB 身份及传输文档保留原生命周期，其计划需要独立交付；下列历史 LAN 决策也不能替代对当前身份及授权实现的核验。远程对象是会话与工作流，不是整机桌面或任意键鼠控制。

方向与发射：[gateway 已落地](./2026-09-04-remote-control--8ac68f05.md)为方向上篇，[launch-surface 草案](./2026-09-21-launch-surface-remote-visualization--82ff589f.md)为投影下篇，互链保留。

ToB 三部曲：[identity](./2026-08-20-tob-identity--ec2fb5e6.md)、[transport](./2026-08-20-tob-transport--abb5ed88.md)、[lan-remote](./2026-08-20-tob-lan-remote--97efe07c.md)按身份到传输到控制排序。

Hosted 双适配以[orca-dual 纲](./2026-09-19-orca-hosted-dual-github-gitlab--672b902d.md)为目：[gitlab-config](./2026-09-21-gitlab-instance-config--9ed7f1d7.md)、[gitlab-reviews](./2026-09-21-gitlab-provider-reviews--640a69dd.md)、[github-reviews](./2026-09-21-hosted-github-reviews--97a21dee.md)、[automerge](./2026-09-21-hosted-issues-comments-automerge--cee742a2.md)为目。

## Acceptance criteria

以下保留 2026-09-26 文档组织验收；数量是历史快照，勾选不证明团队路线全部交付。

- [x] AC-1: 本域 10 篇直接子全部携带有效 parent。
- [ ] AC-2: gateway 与 launch 上下篇关系保留，不合并草案与落地。
