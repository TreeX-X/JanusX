---
schema: harness-note/1
id: b653bb34-279f-45db-92d1-313d1c6bcdf5
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags: [remote, team, parent, governance]
---

# 远程团队父域

## Goal

远程控制、ToB 三部曲与 hosted 双适配共十篇，方向网关已落地而发射面仍是草案。本域确立远程与团队的唯一父节点，跨机协作先看本域树。

## Scope

方向与发射：[gateway 已落地](./2026-09-04-remote-control--8ac68f05.md)为方向上篇，[launch-surface 草案](./2026-09-21-launch-surface-remote-visualization--82ff589f.md)为投影下篇，互链保留。

ToB 三部曲：[identity](./2026-08-20-tob-identity--ec2fb5e6.md)、[transport](./2026-08-20-tob-transport--abb5ed88.md)、[lan-remote](./2026-08-20-tob-lan-remote--97efe07c.md)按身份到传输到控制排序。

Hosted 双适配以[orca-dual 纲](./2026-09-19-orca-hosted-dual-github-gitlab--672b902d.md)为目：[gitlab-config](./2026-09-21-gitlab-instance-config--9ed7f1d7.md)、[gitlab-reviews](./2026-09-21-gitlab-provider-reviews--640a69dd.md)、[github-reviews](./2026-09-21-hosted-github-reviews--97a21dee.md)、[automerge](./2026-09-21-hosted-issues-comments-automerge--cee742a2.md)为目。

## Acceptance criteria

- [x] AC-1: 本域 10 篇直接子全部携带有效 parent。
- [ ] AC-2: gateway 与 launch 上下篇关系保留，不合并草案与落地。
