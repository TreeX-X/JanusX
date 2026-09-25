---
schema: harness-note/1
id: fa17e06b-5f62-4d42-9020-4fb77bcf54de
kind: task
lifecycle: accepted
created: 2026-09-25
class: architecture
tags: [note, blueprint, wiki, migration, r2]
relations:
  - type: implements
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
    criteria: [AC-2, AC-3]
  - type: depends-on
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/81fc137e-9c56-4d3a-88e4-10f175852c97
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [src/main/notes/, src/main/harness/, src/main/ipc/, src/shared/, src/renderer/src/, tests/unit/, scripts/, .agents/]
  acceptanceRefs:
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
      criterionId: AC-2
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
      criterionId: AC-3
  verification:
    - id: V-1
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, typecheck]
---

# R2 — 共同读取、中间投影和迁移清单

## Scope

R1 的独立验收及三仓发布组合已经闭合。本任务复用共享 buildNoteIndex/readIndexedNote，把同一快照交给 wiki 和独立蓝图投影层。保留完整身份、元数据、全部正式关系及引用诊断；本机图和缓存继续按 checkout 隔离。UI 只消费中间层结果。全量旧 Note 迁移在 R5 完成，此处建立逐文件可重复清单、无损转换预览和有效试点。

## Acceptance criteria

- [ ] AC-1: 共同快照保留 class、repositories、codeRefs、interfaces、execution、AC 勾选原值、全 URI、所有关系类型及 criteria/scope/reason；旧格式、外来格式、损坏与冲突文件均有分类。
- [ ] AC-2: 蓝图中间层保持七种正式关系和外部/悬空目标；同 UUID 不同 repo 不别名；目录父关系保留诊断且不会制造递归环；证据完成态保持原有验证入口。
- [ ] AC-3: 懒读取返回与所读原始字节一致的哈希及快照失配状态；外部变更或分支切换触发实际活动蓝图刷新，监听错误可见，两个 checkout 隔离。
- [ ] AC-4: 全量语料清单逐文件对账；预览可重跑并识别需人工判断项；目录、依赖、决策和代码关联试点通过正式解析，保留正文/UUID/链接且不虚构执行证据。
- [ ] AC-5: 针对性单元回归、类型检查及独立 review 通过，修复阻断项后再进入 R3。

## Verification

运行 notes-adapter、harness service/read/refresh 和迁移工具的针对性测试，以及 npm run typecheck。共享索引盘点产生可丢弃的本地报告；迁移前后核对路径、原始正文哈希、UUID、代码和链接。独立 reviewer 根据本 task 固定验收版本复核实际差异。

## Results

实现中。
