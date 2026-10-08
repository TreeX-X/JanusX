---
{
  "schema": "harness-note/2",
  "id": "b2e7f160-2d77-4cc4-8828-b9cf3e5d931a",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-03",
  "class": "architecture",
  "tags": [],
  "updated": "2026-10-08T09:10:33.782Z",
  "moduleState": "partial",
  "role": "project"
}
---

# JanusX

## Responsibility

在桌面工作区中组织 AI 编程终端、会话、Agent 执行、工程文档与知识。模块声明描述当前子系统边界；决策保存原因，需求与 Task 保存行为及交付契约。

## Design

项目入口组织终端与外部 CLI、会话与工作区、Agent 对话与执行、桌面与分发、工作台与产物界面、远程控制与托管协作、Note 与蓝图、记忆与知识。共享 Agent 包是外部依赖，其实现与决策由 janus-agentX 维护；各模块的 codeRefs 定位本仓入口。

[Note 与蓝图](blueprint/module.md)按文档读取、模块导航、维护对话、工作区组合细分；[会话与工作区](sessions/module.md)按会话记录、检查点、对话线程、工作树细分。其余模块保持现有职责深度，后续出现独立维护边界时再拆分，不要求树形等深。

模块层级来自最近上级的 parent，普通 Note 通过 module 归属。单根蓝图首页就是项目模块页，进入子模块后显示它自身和直属内容；未归属文档及读取诊断保留访问入口。文件数量、Task 完成和模块状态分别表达，不据目录位置推断功能已经验收。整理依据与迁移证据见[职责目录整理](blueprint/module-responsibilities.md)。

## Acceptance criteria

- [x] AC-1: 当前模块具有明确职责、项目归属与可核对的代码入口。
- [x] AC-2: 模块图不要求复制决策、Task、人工坐标或另存关系总表。
