---
{
  "schema": "harness-note/2",
  "id": "b69b7ec5-cbf6-4242-bd29-3b48703979c5",
  "kind": "requirement",
  "lifecycle": "accepted",
  "created": "2026-10-04",
  "class": "feature",
  "tags": ["workflowx","configuration","island","janus"],
  "codeRefs": [
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/main/ipc/workflowx-handlers.ts","role":"entry"},
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/janus/WorkflowXMonitor.tsx",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/GeneralSettingsPanel.tsx",
      "role": "implementation"
    }
  ],
  "updated": "2026-10-08T09:06:56.496Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bc9c2ca8-e036-48ec-a35e-667d694460ca"
}
---

# 在 Island 监控与通用设置中轻量检测 WorkflowX 导入

## Problem

外部终端开发依靠导入的 WorkflowX 约束维护 Note。工作区没有这些约束时，蓝图只能呈现已有结果，无法帮助开发工具在日常工作中维护记录。用户也可能使用全局配置，或者让一种终端读取另一种工具的配置，因此终端类型、蓝图初始化和配置目录存在都不能单独证明导入情况。

## Expected behavior

Janus 从通用界面自动检测全局与当前工作区的 Claude/Codex WorkflowX 配置。任一格式被识别即可显示“已检测到”，不要求同时安装，也不按当前终端类型匹配。没有工作区或终端仍检测全局。导入或切换工作区、工作区路径变更、窗口重新获得焦点或恢复可见时立即检测；可见期间每 30 秒复查一次，覆盖外部编辑配置的变化。后台结果按请求代次隔离，旧工作区结果不能覆盖当前工作区。

Island 监控页提供一行 11px 状态：“已检测到”“未检测到”“待确认”，首次读取显示“检测中”。用户展开后查看来源、重新检测或打开 [WorkflowX 仓库](https://github.com/TreeX-X/WorkFlowX)。说明文字明确检测只识别导入配置，实际工作流执行与 Note 维护由开发工具负责。缺失或失败不展开 Island、不闪烁、不产生横幅、弹窗或终端阻断；IPC 和文件异常转成简短文案，不将原始异常带入界面。

“设置 → 通用”在外部开发工具列表上方提供固定的 WorkflowX 状态区，注明当前工作区名称；无工作区时注明“全局环境”。已识别的来源按全局/工作区与 Claude/Codex 去重显示摘要，路径在“查看来源”中按需展开。“重新检测”和“打开 WorkflowX 仓库”常驻，长名称与路径换行。设置页与 Island 复用同一状态仓库、来源展示和操作实现；打开设置不另起检测或定时器，任何一处刷新结果同步到另一处。

## Scope

通用检测逻辑及结果类型由 [agentX 的检测接口](note://62b44166-82f0-41ff-838d-e2b02388ed06/844d119b-8dd7-423c-9981-fba6b7726ec6)维护，Janus 负责注册工作区解析、IPC、刷新时机和展示。主进程只接受已注册的工作区身份，读取结果短暂缓存 15 秒，手动刷新和切换绕过缓存。仓库跳转使用固定地址，检测过程只读且不联网。

识别稳定的指令标记、部署的工作流技能或有安装/启用记录的插件身份。不校验 WorkflowX 版本、完整技能清单、文件摘要或 Note 初始化状态；旧配置、孤立插件缓存、读取失败保留“待确认”。不提供自动安装、修复、停用、维护者档位、使用合规证明或 Note 维护成功保证。Janus 内置 WorkflowX 的默认执行独立于外部配置状态。

隶属 [Janus 生态 Note 链路整体优化](../../requirements/janus-ecosystem-note-optimization.md)。[工作区切换与蓝图初始化](./blueprint-empty-init.md)独立运行，不把 WorkflowX 导入作为前置条件。

## Acceptance criteria

- [x] AC-1: 通用界面启动即检测；无工作区、无终端和 Island 关闭时仍生效。导入或切换工作区、窗口恢复和配置轮询触发复查，过期请求不能污染当前状态。
- [x] AC-2: 合并全局与工作区 Claude/Codex 证据，任一导入即已检测到，不按终端类型匹配。普通目录、README 和代码示例不能冒充安装；不确定及读取失败有独立状态。
- [x] AC-3: Island 监控以小字静态状态展示，支持查看来源、重新检测和仓库跳转，无横幅、弹窗、闪烁、自动展开或原始错误文本。
- [x] AC-4: 检测与蓝图初始化独立，不安装或更改用户配置，不校验版本和完整文件清单，不将识别结果描述为运行时已加载或 Note 已维护。
- [x] AC-5: 通用设置在外部开发工具列表上方展示当前工作区或全局环境、检测状态和来源摘要，提供来源展开、重新检测和仓库跳转；切换工作区更新内容，刷新与 Island 同步，打开设置不启动重复检测。

## Alternatives considered

复用启动横幅和设置档位有明确的配置入口，但会增加不必要的打扰，并把内置工作流与外部工具导入混为一谈。按终端类型校验可以提供更具体的适配说明，却无法表达 OpenCode 复用 Claude 配置等情况。保持无检测最简单，但无法提示外部开发约束缺口。监控状态行提供按需查看的入口，代价是用户需要主动展开了解详情。

仅保留 Island 可减少一个入口，但用户在查找开发环境配置时不容易发现状态。通用设置复用现有检测和展示组件，提供固定入口；它只承担展示与手动刷新，不独立维护检测生命周期。

## Verification

`tests/unit/workflowx.test.ts` 的 7 项测试验证 IPC、工作区身份、缓存刷新、固定链接、异常收敛与异步结果隔离。`tests/e2e/workflowx-monitor.spec.ts` 的 5 项浏览器用例验证全局检测、Island 默认收起、来源、刷新、窗口焦点、工作区切换、周期检测和错误文案，并覆盖真实通用设置弹窗中的全局环境、当前工作区名称、来源摘要、常驻操作和跨界面状态同步；打开设置不产生额外检测请求。用例使用真实组件与模拟 IPC，不证明 Electron 或外部工具的实际加载。共享规则的文件系统证据见 agentX 检测 Note。

2026-10-05 设置入口验证：`npx vitest run tests/unit/workflowx.test.ts --maxWorkers=2` 的 7 项及 `npx playwright test tests/e2e/workflowx-monitor.spec.ts --project=island --workers=1` 的 5 项通过，包含主窗口允许的最小宽度 1000px。类型、修改文件 ESLint、国际化、构建和 Janus Note 检查通过，Note 检查保留 27 项明确的历史外链诊断。此前扩大 Island 回归检查为 28/31，通过临时替换检测 hook 与监控组件为空实现作对照，知识空态、聊天停靠和会话切换的相同 3 项失败仍存在；本功能的验证不将其计为通过。
