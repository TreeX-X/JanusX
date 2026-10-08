---
{
  "schema": "harness-note/2",
  "id": "3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-09-26",
  "class": "architecture",
  "tags": ["desktop","distribution"],
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/cf5310f1-3f10-484b-9823-a510d178ec02"},
    {"type":"governed-by","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/39f58575-dba9-584f-a285-a33a2c73cdc4"}
  ],
  "codeRefs": [
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/main/index.ts","role":"entry"},
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/main/ipc/register.ts","role":"implementation"}
  ],
  "updated": "2026-10-08T03:43:45.316Z",
  "moduleState": "partial"
}
---

# 桌面与分发

## Responsibility

负责 Electron 启动、窗口与宿主服务装配、应用 IPC 注册及桌面分发。它承载各子系统并管理应用生命周期，领域行为仍由终端、会话、执行和知识等模块维护。

下列链接保留已有决策、阶段需求和交付记录的阅读路径；正文及生命周期由原 Note 负责。历史 parent 仅组织文档，跨模块关联由本声明的 related-to 补充。模块声明只在职责、接口、明确依赖或代码入口变化时维护。

## Design

桌面执行史：[implementation-history](../agent/desktop-implementation-history.md)、[delegated-modes](../agent/desktop-delegated-modes.md)、[task-implementation](../agent/desktop-task-implementation.md)、[ade-survey](./desktop-ade-mit-survey.md)。

打包与发布：[hoisted-deps](./packaged-hoisted-deps.md)、[runtime-size](./packaged-runtime-size.md)、[cli-publish](./janus-cli-npm-publish.md)、[officecli](./officecli-bundled.md)、[runner-backflow](../agent/external-runner-backflow.md)、[ci-order](./ci-sibling-build-order.md)、[verify-repair](./release-verify-repair.md)（v0.8.8 双管线修复）。

流程治理：[development-branch](./development-branch.md)、[reproducible-verification](./reproducible-verification.md)（两篇已补 `--uuid` 后缀正名）、[github-maintenance](./github-maintenance.md)归属产品面而不属本域。

早期基石（均保留，无孤儿）：[toast](./desktop-toast.md)、[model-registry](../agent/model-registry.md)、[llm-runtime](../agent/llm-tool-runtime.md)、[browser-surface](./browser-surface.md)、[auto-update](./app-auto-update-win.md)、[cli-scope](./cli-manager-scope.md)、[i18n](./i18n-pipeline.md)、[statusbar](./runtime-statusbar.md)。

## Acceptance criteria

以下保留 2026-09-26 文档整理的验收原文与勾选状态，供旧 Task 引用；其中篇数是当时快照，不是当前模块大小，新增工作也不强制改写历史 parent。

- [x] AC-1: 本域 21 篇直接子全部携带有效 parent。
- [ ] AC-2: 两篇正名文件后缀与 id 一致，无 flat-layout 违规残留。
- [ ] AC-3: github-maintenance 归属产品面，本域不重复收纳。
