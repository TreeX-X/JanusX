---
schema: harness-note/1
id: 58f0e24f-bb57-4e41-ba72-4245439fc129
kind: task
lifecycle: accepted
created: 2026-09-26
class: architecture
parent: note://972afef3-2fc7-49de-a3ee-7e041225d28c/77fa3727-6536-47d7-8bfd-613db717e4ac
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [src/main/harness/, src/main/notes/, src/main/ipc/, src/shared/, src/preload/, src/renderer/src/services/, src/renderer/src/stores/, src/renderer/src/components/blueprint/, src/renderer/src/features/blueprint/, src/renderer/src/features/workspace/, src/renderer/src/lib/, tests/unit/]
  acceptanceRefs:
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/77fa3727-6536-47d7-8bfd-613db717e4ac
      criterionId: AC-1
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/77fa3727-6536-47d7-8bfd-613db717e4ac
      criterionId: AC-2
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/77fa3727-6536-47d7-8bfd-613db717e4ac
      criterionId: AC-3
  verification:
    - id: V-1
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npx
      args: [vitest, run, tests/unit/harness-note-index-patch.test.ts]
    - id: V-2
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npx
      args: [tsc, --noEmit]
    - id: V-3
      kind: manual
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      description: 进入蓝图计时对比基线（进入约 3s 起，单次全量索引约 1.4s），确认首屏一次挂载且 focus 返回无 reload。
---

# R7 — 蓝图加载与渲染性能根治

## Scope

以 200 篇实测基线为准：单次全量索引约 1.4s，进入蓝图至少两次全量。改动只收敛三类成本，不碰执行语义与写链：主进程读走常驻缓存、变更走哈希探针加定点补丁、传输走瘦身快照；渲染单次提交、布局缓存改稳定键、刷新按 rev 加 external 双门控；启动空闲逐个预热 checkout。跨仓代码（harness-node、harness-core）只读不改；派生图算法用导出原语在 JanusX 内重组，等价性由单测锁定。

## Acceptance criteria

- [x] AC-1: 热缓存读零解析，slim 快照与节点去全文，新增 getRev/warmup/noteSnapshot 通道。
- [x] AC-2: watcher 探针分流（跳过、补丁阈值 8、全量回退），focus 与无变更事件短路，evidence 与绑定等外部触发强制刷新。
- [x] AC-3: 删除 8 帧分批与恒 miss 的 WeakMap 布局缓存，wiki 全文按需取，卡片数据复用推导结果。

## Verification

- V-1: 补丁等价单测 4/4 通过（静默、改增删、坏文件、slim 形状）。
- V-2: `npx tsc --noEmit` 零错误；eslint 零 errors（30 warnings 均为既有 i18n 提示）。
- V-3: 未在 Electron 内实测：主进程 timing 打点（`[blueprint-r7]`）与渲染首屏计时留待联调确认；`npm run check:notes` 因缺 `yaml` 包记 not-run。

## Results

2026-09-26: 进入路径从 2 次全量解析变为缓存读加一次瘦身投影；刷新风暴收敛为 rev 比对；渲染 25 次提交变为 1 次。派生图重组逻辑与 sibling 全量构建逐文件等价已由单测锁定；偏离 sibling 算法未来会先炸测试。`blueprint-composition` 与 `agent-notes-check` 两用例因环境缺 `yaml` 包无法加载（改动前已存在，与本次无关）。
