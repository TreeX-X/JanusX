---
schema: harness-note/1
id: f12d99b4-c116-48dc-96d9-e3ac74ae41cd
kind: initiative
lifecycle: accepted
created: 2026-10-03
class: architecture
tags: [architecture:module, note, blueprint]
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a
codeRefs:
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/notes/note-provider.ts
    role: entry
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/main/blueprint/blueprint-composition.ts
    role: implementation
  - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
    path: src/renderer/src/components/blueprint/BlueprintCanvas.tsx
    role: implementation
interfaces:
  - name: NoteReadSnapshot
    direction: provides
relations:
  - type: governed-by
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/47c7be36-5a48-4a27-aa86-d4f9dffb641c
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/41e93b25-92ce-4547-9250-e28cf4b1907f
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/fa17e06b-5f62-4d42-9020-4fb77bcf54de
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/785a2a8e-79d5-4b8b-8ca1-efea8f682662
---

# Note 与蓝图

## Goal

通过共享 Note 读取边界提供工程 wiki、文档关系与跨工作区蓝图。NoteReadSnapshot 保留原始身份、元数据、关系与诊断，视图在相同来源上组织信息。

## Scope

模块负责工程文档读取、投影、导航与界面呈现。共享 harness 包负责基础解析和索引；任务执行与回执仍由 Agent 执行入口负责。知识 wiki 的生成与审核属于记忆知识模块。

[架构师工作区设计](./2026-09-23-architect-workspace-model--41e93b25.md)说明跨仓组织的依据；[共同读取任务](./2026-09-25-note-blueprint-r2-read--fa17e06b.md)记录读取投影工作；[系统结构任务](./2026-10-03-module-structure-view--785a2a8e.md)记录模块视图的交付与验证。

## Acceptance criteria

- [x] AC-1: 工程内容由共同 Note 来源读取，视图不维护第二份文档身份或关系真源。
- [x] AC-2: 文档呈现与 Task 执行、回执职责分别拥有明确入口。
