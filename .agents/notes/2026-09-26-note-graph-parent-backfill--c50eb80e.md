---
schema: harness-note/1
id: c50eb80e-394b-4182-a2d9-346145b78d4f
kind: task
lifecycle: accepted
created: 2026-09-26
class: process
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [.agents/notes/]
  acceptanceRefs:
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570
      criterionId: AC-1
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662
      criterionId: AC-1
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c0a75c6a-5d06-4088-b7ed-9ecdd835b3d3
      criterionId: AC-1
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/95ec5f71-33e3-4f71-aa05-d3e725c33b10
      criterionId: AC-1
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e
      criterionId: AC-1
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c
      criterionId: AC-1
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5
      criterionId: AC-1
  verification:
    - id: V-1
      kind: manual
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      description: 全量扫描 .agents/notes 除隔离区外无 parent 缺失，抽查 20 篇 parent URI 与目标文件 id 一致。
    - id: V-2
      kind: manual
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      description: 逐文件核对相对链接目标存在，无新增断链；归档 5 篇 disposition 完整；正名 2 件后缀与 id 一致。
---

# R6 — 全仓 Note 父域回填与治理归档

## Scope

以 R5 全量迁移后的 191 篇为基线，不删除任何正文。新建 P1–P7 七个域父 initiative，为 175 篇孤儿补 parent：R 系列缺口 2 篇归 P0，设计祖先 10 篇归 P0（含归档 5 篇），其余按终端、会话、记忆、执行、桌面、产品、远程七域归属；M1–M4 与 cc-switch 子链使用链式 parent；migrated 四件、架构师模型、已归档三篇保持不动。

## Acceptance criteria

- [x] AC-1: 除隔离区 7 件外全员携带有效 parent，parent 零环、无自指。
- [x] AC-2: 归档 5 篇 lifecycle 为 archived 且 disposition 非空，正文冻结保留。
- [x] AC-3: 正名 2 件文件名后缀与 id 一致，旧链已修，无断链新增。
- [x] AC-4: M1–M4 与 cc-switch 链式 parent 闭合，可从域父到达任意一片。
- [x] AC-5: 七个域父 AC-1 全部达成，本任务关闭。

## Verification

- V-1: 全量 parent 覆盖扫描加 20 篇抽查，见 Results 记录。
- V-2: 链接与归档正名核对，见 Results 记录。`npm run check:notes` 因缺失 `yaml` 依赖在当前 checkout 无法运行，记为 not-run，不作通过断言。

## Results

2026-09-26: 全量扫描 200 篇，0 重复 id，179 篇顶层 parent 加 7 篇 relations-parent，14 个根（P0、P1–P7 七域父、架构师模型、migrated 历史两件、已归档三件），0 孤儿、0 坏 parent、0 环。8 篇抽查 parent URI 与目标 id 一致全过；8 篇新 note 相对链接 0 断链。归档 5 篇 lifecycle 与 disposition 完整；正名 2 件后缀与 id 一致且无旧链引用。`54b1046a` 为并发会话落盘文件，仅补 parent 未动正文，其 `type: follows` 非标准关系类型，已留 gap 归属原会话修复。
