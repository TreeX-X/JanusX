---
schema: harness-note/1
id: 3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags: [desktop, distribution, parent, governance, architecture:module]
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a
relations:
  - type: governed-by
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/39f58575-dba9-584f-a285-a33a2c73cdc4
codeRefs:
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/index.ts
    role: entry
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/ipc/register.ts
    role: implementation
---

# 桌面与分发

## Goal

负责 Electron 启动、窗口与宿主服务装配、应用 IPC 注册及桌面分发。它承载各子系统并管理应用生命周期，领域行为仍由终端、会话、执行和知识等模块维护。

桌面史、打包修复、CLI 发布与早期基石能力散在二十篇孤儿。本域确立桌面壳与分发的唯一父节点，发布回归先看本域树。

## Scope

桌面执行史：[implementation-history](./2026-09-19-desktop-implementation-history--854981c7.md)、[delegated-modes](./2026-09-19-desktop-delegated-modes--fbac0251.md)、[task-implementation](./2026-09-19-desktop-task-implementation--958007ff.md)、[ade-survey](./2026-09-18-desktop-ade-mit-survey--c32cd9ef.md)。

打包与发布：[hoisted-deps](./2026-09-20-packaged-hoisted-deps--39f58575.md)、[runtime-size](./2026-09-20-packaged-runtime-size--210d9ec3.md)、[cli-publish](./2026-09-20-janus-cli-npm-publish--ad7e45c2.md)、[officecli](./2026-09-18-officecli-bundled--02b7c101.md)、[runner-backflow](./2026-09-18-external-runner-backflow--5352fb79.md)、[ci-order](./2026-09-19-ci-sibling-build-order--bfb406a2.md)、[verify-repair](./2026-09-27-release-verify-repair--dda0c41e.md)（v0.8.8 双管线修复）。

流程治理：[development-branch](./2026-09-20-development-branch--a91d7003.md)、[reproducible-verification](./2026-09-20-reproducible-verification--914a7e92.md)（两篇已补 `--uuid` 后缀正名）、[github-maintenance](./2026-09-17-github-maintenance--a568cc88.md)归属产品面而不属本域。

早期基石（均保留，无孤儿）：[toast](./2026-07-05-desktop-toast--671574ba.md)、[model-registry](./2026-07-09-model-registry--31cda2d8.md)、[llm-runtime](./2026-07-05-llm-tool-runtime--15a5d590.md)、[browser-surface](./2026-07-11-browser-surface--48db2e15.md)、[auto-update](./2026-07-14-app-auto-update-win--5fdf2273.md)、[cli-scope](./2026-07-14-cli-manager-scope--e7bb35aa.md)、[i18n](./2026-08-06-i18n-pipeline--95812dc5.md)、[statusbar](./2026-06-27-runtime-statusbar--b1978fa7.md)。

## Acceptance criteria

- [x] AC-1: 本域 21 篇直接子全部携带有效 parent。
- [ ] AC-2: 两篇正名文件后缀与 id 一致，无 flat-layout 违规残留。
- [ ] AC-3: github-maintenance 归属产品面，本域不重复收纳。
