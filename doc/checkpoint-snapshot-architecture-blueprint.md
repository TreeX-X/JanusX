# Checkpoint / Snapshot 安全架构蓝图

## 1. 文档目标

本文档定义 JanusX 中 Checkpoint / Snapshot / Restore / Agent 执行隔离 的完整目标架构。

目标不是做最小修补，而是建立一套长期稳定、语义正确、用户安全、可恢复、可扩展的工作区状态版本系统。

本文档同时覆盖：

- 架构目标与原则
- 问题归因
- 新系统的术语与语义
- 模块边界
- 数据模型
- 状态机
- 时序设计
- 安全策略
- 冲突处理策略
- UI 行为约束
- API 设计建议
- 存储设计
- 迁移方案
- 废弃逻辑清单

---

## 2. 背景与问题归因

当前系统存在一个根本性语义错误：

- 用户期望：生成还原点时，记录当前工作区的真实状态
- 当前实现：生成 checkpoint 时，先对当前工作区执行 `git stash push --include-untracked`，再记录快照

这会导致：

1. 创建快照时工作区被清空到近似 HEAD 状态
2. 后续发送对话时视觉效果像“自动还原”
3. 上一轮生成但尚未提交的内容会突然消失
4. 新生成的 checkpoint 记录到的不是“当前真实状态”，而是“stash 后的旧状态”
5. 系统进入“鬼打墙”状态：每次记录的不是新内容，所以后续恢复也回不到新内容

换句话说，当前系统把以下三件事错误地耦合在了一起：

- 记录状态
- 保护状态
- 恢复状态

而正确架构中，这三者必须完全解耦。

---

## 3. 架构目标

### 3.1 产品目标

构建一套 Workspace State Versioning System，满足：

1. 生成快照时记录当前工作区的真实状态
2. 用户可随时查看、对比、恢复任意快照
3. AI 运行过程不直接污染主工作区
4. 所有恢复与覆盖操作均可预演、可确认、可撤销
5. 不再出现“创建快照时导致工作区回退”的副作用

### 3.2 成功标准

- Snapshot Create 永远不修改工作区
- Restore 永远不会隐式触发
- 主工作区任何 destructive 操作前都必须自动生成 `pre-op snapshot`
- AI 改动默认发生在隔离 sandbox，而不是主工作区
- 用户总能撤销最近一次 restore / apply 操作

---

## 4. 核心设计原则

### P1. Snapshot is read-only

快照创建是观察行为，不是操作行为。

禁止在创建快照时：

- `git stash push`
- `git checkout`
- `git reset`
- 自动 merge
- 自动 restore
- 自动 pop/apply

### P2. Restore is explicit

恢复只能由用户显式确认触发。

以下动作都不得触发恢复：

- 发送对话
- 切换终端
- 切换工作区
- 刷新还原点列表
- 打开面板
- 轮询状态

### P3. Main workspace is protected

主工作区是用户资产，不允许 AI 自动覆盖。

AI 的执行区必须与主工作区隔离。

### P4. Every destructive action is reversible

任何 restore / apply / overwrite / delete 之前，必须自动创建 `pre-op snapshot`。

### P5. Merge decisions belong to the user

冲突决策应提升到 UI 层，而不是在底层静默三路合并后直接写盘。

---

## 5. 术语重定义

为避免当前语义混乱，系统术语统一如下。

### 5.1 Snapshot

某一时刻工作区完整状态的只读记录。

### 5.2 Restore

将当前工作区恢复为某个 Snapshot 所记录的完整状态。

### 5.3 Apply

将某个 Snapshot 或某个 Sandbox 相对于基线的变更应用到当前工作区。

### 5.4 Sandbox

AI 执行使用的隔离工作区，不等于用户主工作区。

### 5.5 Main Workspace

用户真实工程目录，是默认受保护区域。

### 5.6 Plan

在真正执行 restore 或 apply 之前，由系统生成的变更计划，包括：

- 将修改哪些文件
- 将删除哪些文件
- 将覆盖哪些 dirty files
- 是否存在冲突

---

## 6. 总体架构

系统划分为六层：

1. Snapshot Store
2. Workspace Scanner
3. Diff & Plan Engine
4. Transactional Restore Engine
5. Apply Engine
6. Isolated Agent Runtime

另有两个横切模块：

- Workspace Lock
- Policy / Retention Manager

---

## 7. 模块边界

## 7.1 Snapshot Store

职责：

- 存储 Snapshot Manifest
- 存储 Blob
- 维护索引
- 提供读取、删除、保留策略接口

不负责：

- 扫描文件系统
- 计算 diff
- 恢复文件

## 7.2 Workspace Scanner

职责：

- 扫描当前工作区真实状态
- 构建 manifest
- 将文件内容写入 blob store

不负责：

- 修改工作区
- 合并
- 恢复

## 7.3 Diff & Plan Engine

职责：

- 比较两个状态
- 生成 restore plan
- 生成 apply plan
- 计算风险

不负责：

- 执行 plan
- 直接写文件

## 7.4 Transactional Restore Engine

职责：

- 根据 restore plan 执行恢复
- 失败时回滚
- 保证事务语义

不负责：

- 生成 plan
- 冲突策略决策

## 7.5 Apply Engine

职责：

- 将 sandbox 结果或 snapshot diff 应用到主工作区
- 支持全量与部分采纳

## 7.6 Isolated Agent Runtime

职责：

- 为每轮 AI 任务准备 sandbox / worktree
- 在隔离目录运行 AI
- 产出结果快照

## 7.7 Workspace Lock

职责：

- 防止 restore / apply 过程中被其他终端并发写入

## 7.8 Policy / Retention Manager

职责：

- 管理快照保留策略
- 区分手动快照与自动快照

---

## 8. 数据模型

## 8.1 Snapshot 顶层对象

```ts
type WorkspaceSnapshot = {
  id: string
  workspaceId: string
  createdAt: string
  createdBy: 'user' | 'system' | 'agent'
  reason: 'manual' | 'before-task' | 'after-task' | 'pre-restore' | 'autosave'
  label?: string
  source: 'main' | 'sandbox'
  manifest: SnapshotManifest
  stats: {
    fileCount: number
    totalBytes: number
  }
  schemaVersion: 1
}
```

## 8.2 Snapshot Manifest

```ts
type SnapshotManifest = {
  files: Record<string, SnapshotEntry>
}
```

## 8.3 Snapshot Entry

```ts
type SnapshotEntry = {
  path: string
  kind: 'file' | 'deleted'
  hash: string | null
  size?: number
  mtimeMs?: number
  mode?: number
}
```

说明：

- `kind: 'deleted'` 表示该快照中该路径不存在
- `hash` 指向 Blob Store
- `mode` 便于未来扩展执行权限等元信息

## 8.4 Blob Store

```ts
type BlobRecord = {
  hash: string
  size: number
  compression?: 'none' | 'gzip'
}
```

Blob 使用内容寻址存储，例如 `sha256(content)`。

优点：

- 去重
- 易做一致性校验
- 与 Git Object DB 解耦

---

## 9. 生命周期设计

## 9.1 创建 Snapshot

### 输入

- workspace path
- source: main | sandbox
- reason
- createdBy

### 流程

1. Workspace Scanner 扫描当前工作区
2. 读取文件内容
3. 写入 Blob Store
4. 组装 Manifest
5. 写入 Snapshot Store
6. 返回 Snapshot Summary

### 强约束

- 不允许修改工作区
- 不允许 stash
- 不允许 checkout

## 9.2 Restore Snapshot

### 流程

1. 扫描当前工作区
2. 自动创建 `pre-restore snapshot`
3. 生成 restore plan
4. UI 展示风险与影响文件
5. 用户确认
6. 锁定工作区
7. 执行 plan
8. 验证结果
9. 成功则提交
10. 失败则回滚到 `pre-restore snapshot`

## 9.3 Apply Sandbox Result

### 流程

1. 对 sandbox 创建 `after-task snapshot`
2. 比较 main 与 sandbox
3. 生成 apply plan
4. UI 展示采纳项
5. 用户选择全部或部分采纳
6. 自动创建 `pre-apply snapshot`
7. 执行 apply
8. 失败则回滚

---

## 10. 状态机设计

## 10.1 Snapshot 状态

- `capturing`
- `ready`
- `corrupted`
- `expired`

## 10.2 Restore Task 状态

- `planned`
- `awaiting_confirmation`
- `executing`
- `succeeded`
- `rolled_back`
- `failed`

## 10.3 Apply Task 状态

- `planned`
- `awaiting_confirmation`
- `executing`
- `succeeded`
- `rolled_back`
- `failed`

## 10.4 Agent Runtime 状态

- `idle`
- `sandbox_prepared`
- `running`
- `result_ready`
- `accepted`
- `discarded`

---

## 11. Plan 引擎设计

## 11.1 RestorePlan

```ts
type RestorePlan = {
  targetSnapshotId: string
  currentScan: SnapshotManifest
  actions: RestoreAction[]
  risks: RestoreRisk[]
}
```

## 11.2 RestoreAction

```ts
type RestoreAction =
  | { type: 'write-file'; path: string; targetHash: string }
  | { type: 'delete-file'; path: string }
  | { type: 'mkdir'; path: string }
```

## 11.3 RestoreRisk

```ts
type RestoreRisk =
  | { type: 'dirty-overwrite'; path: string }
  | { type: 'untracked-loss'; path: string }
  | { type: 'delete-risk'; path: string }
  | { type: 'conflict'; path: string }
  | { type: 'binary-replace'; path: string }
```

## 11.4 ApplyPlan

```ts
type ApplyPlan = {
  sourceSnapshotId: string
  targetWorkspaceId: string
  actions: RestoreAction[]
  risks: RestoreRisk[]
}
```

---

## 12. Restore Engine 事务语义

Restore 不能是“边执行边看”，必须是事务。

### 标准流程

1. Acquire workspace lock
2. Create `pre-restore snapshot`
3. Execute actions
4. Verify filesystem matches target
5. On failure: rollback from `pre-restore snapshot`
6. Release lock

### 失败场景

- 文件权限异常
- 外部程序并发写入
- Blob 丢失
- 二进制写入失败
- 校验不通过

### 事务要求

- 要么全部成功
- 要么全部回滚
- 不允许半完成状态暴露给用户

---

## 13. 冲突处理策略

## 13.1 禁止的旧行为

底层自动三路合并后直接写盘。

## 13.2 新行为

冲突上升到 UI 层，由用户决策：

- 保留当前版本
- 使用快照版本
- 打开 diff 手动处理

## 13.3 冲突类型

1. 内容冲突
2. 删除冲突
3. 新文件同名冲突
4. 二进制替换冲突
5. dirty file 覆盖风险

---

## 14. Sandbox / Worktree 隔离设计

这是整个系统最重要的安全层。

## 14.1 原则

AI 默认不在主工作区执行。

AI 的每轮任务应运行在：

- git worktree
- 或应用级 sandbox 目录

## 14.2 推荐模式

### Main Workspace

- 用户真实项目
- 默认受保护

### Sandbox Workspace

- 由系统创建
- AI 在其中读写
- 任务结束后可被回收

## 14.3 结果流

1. 从 main 派生 sandbox
2. AI 在 sandbox 修改代码
3. 生成 sandbox 结果 snapshot
4. 用户查看 diff
5. 选择采纳
6. Apply Engine 将变更带回 main

### 优点

- 主工作区不会被自动 stash / restore
- AI 失败不会破坏用户主资产
- 恢复与采纳都更可控

---

## 15. UI / UX 交互蓝图

## 15.1 面板重命名建议

“还原点”应升级为“状态版本”或“工作区快照”面板。

## 15.2 每个 Snapshot 卡片展示

- 标签
- 创建时间
- 来源：手动 / AI 任务前 / AI 任务后 / 恢复前
- source：main / sandbox
- 文件变化数
- 是否可恢复

## 15.3 每条可用操作

- `查看差异`
- `恢复到此状态`
- `应用此状态的变更`
- `导出补丁`

## 15.4 Restore 确认弹窗必须展示

- 将写入多少文件
- 将删除多少文件
- 将覆盖哪些 dirty files
- 是否存在冲突
- 是否已自动创建恢复前备份

## 15.5 Apply 确认弹窗必须展示

- 变更来自哪个 sandbox / 哪轮任务
- 将影响哪些文件
- 是否允许部分采纳

---

## 16. API 设计建议

## 16.1 Snapshot API

```ts
snapshot:create({
  workspaceId,
  source,
  reason,
  label?,
  createdBy
})
```

```ts
snapshot:list({
  workspaceId,
  source?,
  reason?
})
```

```ts
snapshot:get({
  snapshotId
})
```

## 16.2 Diff / Plan API

```ts
snapshot:planRestore({
  snapshotId,
  workspaceId
})
```

```ts
snapshot:planApply({
  sourceSnapshotId,
  targetWorkspaceId
})
```

## 16.3 Execution API

```ts
snapshot:executeRestore({
  planId,
  userConfirmed: true
})
```

```ts
snapshot:executeApply({
  planId,
  selectedPaths?,
  userConfirmed: true
})
```

## 16.4 Safety API

```ts
workspace:lock({
  workspaceId,
  reason
})
```

```ts
workspace:unlock({
  workspaceId
})
```

---

## 17. 存储设计

## 17.1 Blob Store

建议目录：

```txt
.janusX/state/blobs/
```

按 hash 分片存储，例如：

```txt
.janusX/state/blobs/ab/cd/abcdef...
```

## 17.2 Snapshot Store

建议目录：

```txt
.janusX/state/snapshots/
```

每个 snapshot 一个 JSON：

```txt
.janusX/state/snapshots/{snapshotId}.json
```

## 17.3 Index Store

```txt
.janusX/state/index.json
```

维护：

- snapshotId
- workspaceId
- createdAt
- source
- reason
- label

---

## 18. 保留策略

## 18.1 手动快照

- 永不自动删除

## 18.2 自动快照

可按策略保留：

- 最近 N 个
- 最近 7 天
- 每类 reason 分桶保留

## 18.3 恢复前备份

- 保留更长时间
- 至少保留最近一次 restore 前备份

---

## 19. 审计与可观测性

每次 snapshot / restore / apply 都应记录审计日志：

- 操作类型
- 触发人或触发源
- workspaceId
- snapshotId / planId
- 风险摘要
- 成功 / 失败
- 回滚是否发生

建议加入：

- 事件日志
- 用户可见操作历史
- 故障排查 trace id

---

## 20. 当前系统中的反模式清单

以下逻辑应视为必须废弃：

1. 在创建 checkpoint 时执行 `git stash push`
2. 用 `beforeHash / afterHash` 混合表达恢复语义
3. 在主工作区上直接让 AI 持续写入
4. 在底层自动三路合并并直接落盘
5. 以“terminal submit-line”为核心快照边界

---

## 21. 迁移方案

## 21.1 Phase 1：语义纠偏

目标：

- 停止使用“checkpoint = stash 后快照”模型
- 正式重定义 snapshot / restore / apply

动作：

- 废弃现有 `stashPush` 依赖
- 将旧 checkpoint 文案替换为 snapshot / restore / apply 的新语义

## 21.2 Phase 2：只读 Snapshot 系统

目标：

- 引入 Workspace Scanner
- 引入 Blob Store + Manifest Store

动作：

- 创建新的 snapshot 创建链路
- 不修改工作区

## 21.3 Phase 3：Plan + Dry-run

目标：

- 任何 restore / apply 先出计划

动作：

- 实现 RestorePlan / ApplyPlan
- 接入 UI 风险展示

## 21.4 Phase 4：事务恢复

目标：

- 引入 pre-restore snapshot
- 引入失败自动回滚

## 21.5 Phase 5：Sandbox 隔离执行

目标：

- AI 从主工作区迁出

动作：

- 引入 sandbox manager
- 主工作区只接收用户确认后的变更

## 21.6 Phase 6：采纳式交付

目标：

- 从“AI 直写主工作区”切换到“用户采纳变更”

---

## 22. 需要明确废弃或重写的旧能力

### 废弃

- 基于 `git stash` 的 checkpoint 创建机制
- 自动 finalize/create 中的工作区副作用设计

### 重写

- restore 语义
- diff 语义
- UI 文案与行为模型

### 保留可复用

- 基础 blob / diff 思路
- checkpoint 面板作为未来 snapshot 面板的 UI 容器
- 事件广播机制

---

## 23. 最终目标架构摘要

最终系统应满足以下角色分离：

- `Snapshot`：负责记忆状态
- `Sandbox`：负责承载实验
- `Restore`：负责回退
- `Apply`：负责采纳
- `Main Workspace`：负责被保护

这五者不能再混用。

---

## 24. 实施优先级建议

### P0

- 移除创建快照时对工作区的副作用
- 正式建立 Snapshot 只读语义

### P1

- 建立 restore / apply plan
- 增加 pre-op snapshot
- 事务化恢复

### P2

- 引入 sandbox / worktree
- 将 AI 执行迁出主工作区

### P3

- 支持部分采纳
- 支持补丁导出
- 完善审计、保留策略、回滚可视化

---

## 25. 结论

当前问题的本质不是 checkpoint 太频繁，也不是 restore 入口太多，而是：

**“快照创建”被实现成了“带副作用的工作区操作”。**

只要这个根问题不拆掉，系统就会持续出现：

- 创建快照像自动还原
- 上一轮内容突然消失
- 恢复语义错位
- 主工作区被误伤

正确架构必须回到以下原则：

**快照只记录，恢复才改动，AI 在隔离区运行，主工作区默认受保护。**

