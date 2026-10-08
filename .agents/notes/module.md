---
{
  "schema": "harness-note/2",
  "id": "b2e7f160-2d77-4cc4-8828-b9cf3e5d931a",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-03",
  "class": "architecture",
  "tags": [],
  "updated": "2026-10-08T02:54:24.778Z",
  "moduleState": "partial",
  "role": "project"
}
---

# JanusX

## Responsibility

在桌面工作区中组织 AI 编程终端、会话、Agent 执行、工程文档与知识。模块声明描述当前子系统边界；决策保存原因，需求与 Task 保存行为及交付契约。

## Design

本项目声明覆盖当前 JanusX 仓库的粗粒度模块。共享 Agent 包是外部依赖，其实现与决策由 janus-agentX 自己维护。模块层级由 parent 派生，接口由显式声明连接，代码入口由各模块的 codeRefs 定位。

当前模块包括终端与外部 CLI、会话与工作区、Agent 对话与执行、桌面与分发、工作台与产物界面、远程控制与托管协作、Note 与蓝图、记忆与知识。模块由 parent 自动发现；计划和性能专题位于相应模块之下，系统结构视图仍只绘制有效模块声明。

现有决策、阶段性 initiative 和 Task 保留原身份。未分类的 Note 可从全部 Note 阅读，不能据此推断它已经失效。此结构不列举所有文件、函数或运行时调用，也不表示所有功能已经完成。

## Acceptance criteria

- [x] AC-1: 当前模块具有明确职责、项目归属与可核对的代码入口。
- [x] AC-2: 模块图不要求复制决策、Task、人工坐标或另存关系总表。
