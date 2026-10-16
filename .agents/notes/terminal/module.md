---
{
  "schema": "harness-note/2",
  "id": "bdd26e4e-8207-4c1f-8ea3-21f450ee7570",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-09-26",
  "class": "architecture",
  "tags": ["terminal","shell"],
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/terminal/manager.ts",
      "symbol": "TerminalManager",
      "role": "entry"
    },
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/main/ipc/terminal-handlers.ts","role":"implementation"}
  ],
  "interfaces": [
    {"name":"TerminalManager","direction":"provides"},
    {
      "name": "AgentSessionRegistry",
      "direction": "needs",
      "provider": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662"
    }
  ],
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/23372e89-e580-446d-b345-05c8a5c31d87"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/0358ada8-8f0d-4fcd-8f78-19d14e2b6b19"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/e29da5b4-dc65-40a9-883d-9026e3b280b1"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a976752-d637-40c7-9fa3-bce52ac5dc15"}
  ],
  "updated": "2026-10-16T16:49:11.414Z",
  "moduleState": "partial"
}
---

# 终端与外部 CLI

## Responsibility

管理 PTY 进程、终端输入输出、外部 CLI 的启动与终端界面。终端 IPC 通过会话模块的 AgentSessionRegistry 关联会话与终端事件；终端模块不拥有会话持久化或 Task 验收规则。

下列链接保留已有决策、阶段需求和交付记录的阅读路径；正文及生命周期由原 Note 负责。当前目录和蓝图归属以最近模块的 module 声明为准；历史 parent 关系保留旧阅读脉络，不参与模块层级，跨模块关联由本声明的 related-to 补充。模块声明只在职责、接口、明确依赖或代码入口变化时维护。

## Design

终端阅读入口分为状态、设置、外部 CLI 和 Shell 语义；各组可跨模块引用：

状态显示链（路由与投影分层，互链不合并）：[model-lifecycle](./terminal-model-lifecycle.md)、[sidebar-states](./terminal-sidebar-states.md)、[status-display](./terminal-status-display.md)、[idle-prompt](./claude-idle-prompt-tab-status.md)、[status-ring](./terminal-status-ring.md)、[sidebar-hierarchy](./sidebar-terminal-hierarchy.md)、[context-telemetry](./claude-opencode-context-telemetry.md)。

上下文与消耗统计共用主进程 history 的原生会话源，分别投影当前上下文与历史消耗；PTY 仅保留必要状态信号。coordinator 管理精确绑定、hook 刷新和 10 秒采集，独立 SQLite 用量账本保留去重身份、累计基线和新增消耗，关闭终端不删除记录。Claude/Pi 按稳定响应事件导入（Pi 保留放弃分支消耗），Codex/OpenCode 按持久基线差分；来源异常暂停，Janus/DSH 缺少原生 usage 时显示未知。设置用量页查询账本，按事件时间或已声明的采样时间归桶。[会话源单源化](./requirements/usage-telemetry-single-source.md)拥有当前契约、实现边界与验收证据；[统计修复](./requirements/usage-telemetry-fix-and-stats.md)和[日期及明细](./requirements/usage-stats-custom-range-detail.md)保留历史交付记录及继续沿用的交互要求。[筛选切换的加载过渡](./requirements/usage-stats-loading-transition.md)（2026-10-14 实施）在切换类型/范围时保留上一份数据，以 2px 发丝线进度与降透明度衔接旧值到新值，周期重查不闪烁。

已接受的架构转向：[hook 解耦决策](./usage-telemetry-hook-decoupling.md)（accepted）决定统计链路完全移除 hook——用量账本改纯会话扫描（覆盖未打开历史，Codex 升级事件模式重放），终端归属改会话诞生/激活时刻的 pty×文件相关性，每终端私有 home 暂缓。**L1、L2 已落地**（2026-10-14）：账本不再依赖 hook 与终端绑定（全语料扫描 + 回游标 + 记账模式锁）；终端归属在无 hook 绑定时按 pty 活跃度×会话文件写入相关性推断（唯一候选才绑定，hook 断言优先），hook 仍是回合状态/通知的来源。L3（每终端私有 home）未实施。

设置绑定链（演进关系已由正文 supersede 声明）：[settings-llm](./settings-terminal-llm.md)、[provider-collections](./terminal-provider-collections.md)、[tabs-projectors](./terminal-tabs-per-format-projectors.md)、[settings-todos](./requirements/settings-terminal-llm-todos.md)、[background-image](./requirements/terminal-background-image.md)、[workbench-transition](./settings-workbench-transition.md)。

LLM 配置以共享渠道目录和各 Agent 独立模型选择为入口，官方 API、CPA、自定义服务共用一份渠道信息。协议兼容检查、旧配置迁移与完整连接写回由 [共享渠道设计](./terminal-provider-collections.md) 维护；原生登录沿用各 Agent 自身状态，路由、故障转移和远程环境留在后续阶段。

cc-switch 机制从[port 总纲](./requirements/cc-switch-port.md)进入，detect-install、cli-matrix、multi-terminal、pi-janus 四篇维护具体能力；总纲与专题都直接归属终端模块，历史 parent 只表示原交付脉络，不形成子模块。profile-switch 与 llm-sync 两篇 archived 历史保留在 history/，不复活或改写。

Shell 语义与外围：[adhoc-parity](./adhoc-shell-parity.md)、[self-heal-parity](./command-error-self-heal-parity.md)、[cold-restore](./shell-cold-restore.md)、[orca-parsing](./orca-terminal-acquisition-parsing.md)、[ime-drift](./ime-candidate-drift.md)、[pane-tree](./pane-tree-subagent.md)、[monaco-diff](./monaco-diff-single-line-number.md)、[turn-history](./terminal-right-island-turn-history.md)。

Shell 入口探索：[可选择的普通终端 Shell](./shell-profiles.md)已定稿终端管理设计（用户自建条目、自由命令与启动后缀、显隐与检测候选区、全局默认 PowerShell 种子），P1–P5 已实现；`--login -i` 建议后缀与 Git Bash 落位待 Windows 实测定型（见 Task Results）。

island 一词两义（pane 姿态层与 turn 历史浮层）为术语债，改名消歧前两篇并存，不合并。

底部[用量面板](./requirements/usage-panel-direct-content.md)直接展示上下文、最近请求缓存命中率、累计缓存读取/写入、Token 总数及输入/输出；运行时间按当前终端实例计时。底栏徽标和卡片上下文区域提供精确容量、剩余量及压缩次数的悬浮提示。普通对话入口同名，原二次点击详情及遥测诊断展示已移除。2026-10-15 接入 Codex 原生 `cache_write_input_tokens`，从含缓存的输入中拆出读/写分量，保持总量与最近命中率不变；旧事件历史在原源可读且分项核对一致时补齐写入，旧累计基线的过渡区间保留未拆分输入。Claude 保留明确零值，整段未提供写入字段时显示未知。

## Acceptance criteria

以下保留 2026-09-26 文档整理的验收原文与勾选状态，供旧 Task 引用；其中篇数是当时快照，不是当前模块大小，新增工作也不强制改写历史 parent。

- [x] AC-1: 本域 22 篇直接子与 cc-switch 4 篇孙节点全部携带有效 parent，无孤儿。
- [ ] AC-2: archived 两篇（profile-switch、llm-sync）保持冻结，不复活不改写。
- [ ] AC-3: 新增终端工作引用本域定位，不再新建平铺孤儿。
