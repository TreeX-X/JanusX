---
schema: harness-note/1
id: bdd26e4e-8207-4c1f-8ea3-21f450ee7570
kind: initiative
lifecycle: accepted
created: 2026-09-26
class: architecture
tags: [terminal, shell, parent, governance]
---

# 终端与执行面父域

## Goal

终端、Shell 与模型绑定散在 26 篇平铺 Note 中，检索靠文件名猜测。本域提供唯一父节点：状态显示、设置绑定、cc-switch 机制、Shell 语义各自成链，新终端工作先定位本域再下钻。

## Scope

直接子节点按四组组织，不复制正文，只定归属：

状态显示链（路由与投影分层，互链不合并）：[model-lifecycle](./2026-06-28-terminal-model-lifecycle--2f4d605c.md)、[sidebar-states](./2026-09-11-terminal-sidebar-states--22f762b8.md)、[status-display](./2026-09-12-terminal-status-display--27891818.md)、[idle-prompt](./2026-09-14-claude-idle-prompt-tab-status--bb75d2cd.md)、[status-ring](./2026-09-19-terminal-status-ring--fc9a87e5.md)、[sidebar-hierarchy](./2026-09-21-sidebar-terminal-hierarchy--d87e7a46.md)、[context-telemetry](./2026-09-14-claude-opencode-context-telemetry--042a600f.md)。

设置绑定链（演进关系已由正文 supersede 声明）：[settings-llm](./2026-09-18-settings-terminal-llm--2d731f6a.md)、[provider-collections](./2026-09-18-terminal-provider-collections--51ac8035.md)、[tabs-projectors](./2026-09-18-terminal-tabs-per-format-projectors--2dbc27e2.md)、[settings-todos](./2026-09-18-settings-terminal-llm-todos--df8b0559.md)、[background-image](./2026-09-18-terminal-background-image--8b9c345b.md)、[workbench-transition](./2026-09-18-settings-workbench-transition--5a07c410.md)。

cc-switch 机制以总纲为父：[port 总纲](./2026-09-17-cc-switch-port--33cccd84.md)为本域直接子，其下 detect-install、cli-matrix、multi-terminal、pi-janus 四篇以总纲为父；profile-switch 与 llm-sync 两篇 archived 历史保持冻结不动。

Shell 语义与外围：[adhoc-parity](./2026-09-14-adhoc-shell-parity--4f9cb92a.md)、[self-heal-parity](./2026-09-14-command-error-self-heal-parity--3178e4f9.md)、[cold-restore](./2026-09-21-shell-cold-restore--04398816.md)、[orca-parsing](./2026-09-21-orca-terminal-acquisition-parsing--bc53c6cc.md)、[ime-drift](./2026-06-22-ime-candidate-drift--d50b6b23.md)、[pane-tree](./2026-06-27-pane-tree-subagent--93151b7b.md)、[monaco-diff](./2026-09-19-monaco-diff-single-line-number--5c873080.md)、[turn-history](./2026-09-23-terminal-right-island-turn-history--70beb72a.md)。

island 一词两义（pane 姿态层与 turn 历史浮层）为术语债，改名消歧前两篇并存，不合并。

## Acceptance criteria

- [x] AC-1: 本域 22 篇直接子与 cc-switch 4 篇孙节点全部携带有效 parent，无孤儿。
- [ ] AC-2: archived 两篇（profile-switch、llm-sync）保持冻结，不复活不改写。
- [ ] AC-3: 新增终端工作引用本域定位，不再新建平铺孤儿。
