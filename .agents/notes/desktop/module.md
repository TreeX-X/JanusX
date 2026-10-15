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
  "updated": "2026-10-14T06:18:06.205Z",
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

内嵌浏览器按实际可见性挂载原生网页视图：隐藏、加载失败和对话框遮挡时摘除，恢复后按布局重新挂载。错误提示保留失败地址与重试入口；退出确认和设置等共享弹窗通过窗口内计数协调遮挡，不能依靠 CSS 层级覆盖原生网页。具体行为及 Docker 入口回归证据见 [browser-surface](./browser-surface.md)。

Windows 分发先刷新已构建的 sibling 发布文件，再构建、检查边界和同步排除清单。双目标打包与单目标 portable 迭代均禁用自动发布；迭代子进程使用压缩级别 1 并保留体积预算，正式发行保持默认压缩配置。独立发布脚本先检查运行时和更新清单，上传同一批产物到草稿后再公开。llm-core 的增量信息保存在 dist 内，清理 dist 同时清理缓存；verify 先构建 core 供测试使用，后续 build:app 仅构建 Electron 应用。

本地 checkout/worktree 独立安装开发依赖，`.npmrc` 固定本地 sibling 包物化方式；`npm run dev` 先检查本地工具链、Electron 二进制和 sibling 发布入口，再编译 llm-core 并启动隔离的 `.cache` 开发输出。缺依赖给出明确修复命令，不自动安装或改动同级仓。环境契约和验证由 [reproducible-verification](./reproducible-verification.md) 维护，操作入口见 `CONTRIBUTING.md`。

## Acceptance criteria

以下保留 2026-09-26 文档整理的验收原文与勾选状态，供旧 Task 引用；其中篇数是当时快照，不是当前模块大小，新增工作也不强制改写历史 parent。

- [x] AC-1: 本域 21 篇直接子全部携带有效 parent。
- [ ] AC-2: 两篇正名文件后缀与 id 一致，无 flat-layout 违规残留。
- [ ] AC-3: github-maintenance 归属产品面，本域不重复收纳。
