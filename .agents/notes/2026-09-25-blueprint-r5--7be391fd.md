---
schema: harness-note/1
id: 7be391fd-20f2-4a0f-b815-fcd3da220f06
kind: task
lifecycle: accepted
created: 2026-09-25
class: architecture
tags: [note, blueprint, maintenance, migration, r5]
relations:
  - type: implements
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
    criteria: [AC-8, AC-9, AC-10]
  - type: depends-on
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/9b7b1e15-6c2e-4d2c-9ed0-7a2d1c4e6f80
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [src/main/janus/, src/main/harness/, src/main/ipc/, src/shared/, src/preload/, src/renderer/src/components/blueprint/, src/renderer/src/components/janus/, src/renderer/src/stores/, src/renderer/src/services/, src/renderer/src/i18n/, scripts/, tests/unit/, tests/e2e/, .agents/notes/, .codex/, .claude/]
  acceptanceRefs:
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
      criterionId: AC-8
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
      criterionId: AC-9
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
      criterionId: AC-10
  verification:
    - id: V-1
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, typecheck]
    - id: V-2
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, 'check:notes']
---

# R5 — 维护对话闭环与旧 Note 全量迁移

## Scope

以前置 [R4](./2026-09-25-blueprint-r4--9b7b1e15.md) 在 0ada8cc 的独立验收为基线。维护交互复用 JanusChat controller、现有 changeset、harness 事务、审计和撤销；右侧对话承载节点上下文，审批区域按需展开，保持 v11 的三列结构与简洁布局。节点所属 checkout 必须显式定位，无法定位时给出可操作诊断。

全量迁移覆盖当前 JanusX 的 185 个既有 Note。原始正文、UUID、链接和代码引用可追溯；允许规范化旧关系字段及章节，但保留原始记录，不把历史状态转换为虚构 execution 或 receipt。迁移报告保留在 .agents/.local/。外部仓库无关文件不进入提交。

## Acceptance criteria

- [x] AC-1: 右侧 JanusChat 传递所选节点完整 URI、expectedHash、显式 checkout 与已授权工作区；切换节点后上下文同步，流式、停止、重试和错误恢复可达。复用共享 chat-turn，不恢复独立维护对话 loop。
- [x] AC-2: 对话可创建维护任务并生成真实提案；按组全选/部分选择展示变更及依赖闭包，逐项确认删除；提案身份或内容变化后清空旧确认。探索保持 plan 白名单，只有确认的操作经已有写入审批及事务执行。
- [x] AC-3: 应用与撤销验证源 expectedHash 和证据；冲突可见且不自动覆盖。成功后刷新当前 checkout 的蓝图与节点详情；审计显示实际应用、未选择操作及撤销结果，多仓范围逐库明确。
- [x] AC-4: 185 个既有 Note 全部转换为正式 profile 可解析格式，迁移前后逐文件对账、原文哈希和已有 UUID 核对通过；重复运行为 unchanged，无遗留 legacy/malformed/blocked，不伪造执行证据。新增合法任务 Note 单独计数。
- [x] AC-5: 旧蓝图资产完成清单与迁移预览；未获具体归档确认的内容保留并显示，不以删除代替迁移。JanusX 的 WorkflowX 本地双端配置与正式 profile 一致。
- [x] AC-6: targeted 单元测试、typecheck、Note 校验及 Chromium fixture 覆盖对话/提案/选择/删除确认/应用/刷新/冲突/撤销/审计，独立 evaluatorX 验收无 blockers 后收口。live Electron 未运行时明确标记未运行。

## Verification

运行维护 service、changeset、harness apply、UI 与迁移的 Vitest 用例，npm run typecheck、npm run check:notes；在现有 project browser fixture 中实际操作维护流程。迁移 inventory 与原文保存字段逐文件核对，配置核对沿用 R1 的 profile 锁值与同步脚本。独立 evaluatorX 复跑目标检查并逐项报告结果。

## Results

2026-09-25: R5 is complete and passed independent evaluatorX review. The right panel reuses shared JanusChat and carries full Note URI, expectedHash, checkout and authorized workspaces. The composition adapter resolves selected nodes back to the source checkout graph. Chat starts a real maintenance task and proposal; grouped/individual selection closes dependencies; each delete is confirmed separately; proposal content replacement clears prior approvals. Plan mode remains read-only for exploration and approved operations use the existing harness transaction path.

Apply and undo recheck source hashes, evidence and authorization. Conflicts are visible and do not write. Successful mutations refresh the current checkout blueprint and detail view. Audits show applied/rejected operations and checkout path; undo is selectable and rechecked.

All 185 pre-existing Notes were migrated and reconciled: valid 185 / unchanged 185 / blocked 0. With this task Note, the current set is 186. Re-running migration is unchanged; body, UUID, links, codeRefs and relations remain traceable; no execution or receipt was invented. Four legacy blueprint copies (two IDs) were inventoried and previewed while original files were retained; no archive was silently chosen. JanusX dual WorkflowX configuration matches WorkFlowX and agentX.

Verification:
- Targeted Vitest: 14 files / 127 tests PASS. Independent evaluatorX reran the maintenance scope: 12 files / 92 tests PASS plus 1 approval-mode test.
- npm run typecheck PASS.
- npm run check:notes: 0 old-shape Notes / 0 errors.
- Chromium fixture: 8 tests PASS, covering streaming/stop/retry/error, same-URI checkout switching, proposal, dependency closure, partial selection, delete confirmation, same-ID proposal replacement, apply refresh, audit, undo and hash conflict.
- evaluatorX run 01a0d7a2-80c6-7c50-8213-9074494965ca: R5 AC-1/2/3 and maintenance AC-6 PASS; migration/config slice run 01a0d77f-fac3-7431-bd3a-f876c24da6f6 PASS.
- Live Electron was not run. Legacy blueprint archival still requires explicit selection confirmation.
