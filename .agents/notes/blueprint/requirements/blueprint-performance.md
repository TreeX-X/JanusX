---
{
  "schema": "harness-note/2",
  "id": "77fa3727-6536-47d7-8bfd-613db717e4ac",
  "kind": "requirement",
  "lifecycle": "accepted",
  "created": "2026-09-26",
  "class": "architecture",
  "tags": ["blueprint","performance","parent","governance"],
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---

# 蓝图性能专题

## Expected behavior

本专题保存索引、传输和渲染性能的交付约束，隶属 [Note 与蓝图模块](../module.md)。它不是独立系统模块；下方 AC 是 R7 的既有验收输入，保持原文。

进入蓝图不再经历秒级全量重扫与 25 帧逐批挂载：热缓存命中时进入一次读缓存完成，focus 返回与无关写入零开销，真变更走增量补丁。性能回归先看本域树。

## Scope

主进程常驻增量索引：读路径走缓存，watcher 先哈希探针再定补丁或全量，传输只带瘦身快照与卡片元数据。渲染单次提交挂载，CSS stagger 保留入场动画，布局缓存按稳定键命中，刷新按 rev 门控。启动空闲预热各 checkout 索引。

启动恢复工作区后立即后台加载当前蓝图，不等待文件树读取；其他 checkout 继续空闲串行预热。Janus 的 `HarnessNoteService.refreshIndex` 按 checkout 合并进行中的读取，预热走相同缓存验证路径，避免热缓存再全量扫描。渲染层按工作区 ID 与路径复用进行中的状态及投影请求；已完成的预加载在再次打开时保留画布并验证来源，避免关闭期间的文件变更被遗漏。这里的后台加载是异步调度，没有引入独立解析线程。

审核列表也复用同一 harnessNoteService，避免与画布各自构建冷索引；主进程按规范化 checkout 合并并发列表请求。来源 context 只读取仓库身份文件及 Git 分支，不为 repoId 做全库快照；capture 仍执行前后两次来源快照、证据字节复核和末尾分支确认。渲染端通过 Note 来源与审核事件及时补读，全量视图轮询由 2.5 秒降为 10 秒兜底，轻量活动轮询独立。冷解析仍在主进程。共享索引和完整审核来源读取采用 12 秒有界合并，超时后释放等待槽；并不声称终止底层已发出的 I/O 或改为独立解析线程。工作区恢复时并行启动列表读取，先显示当前分支的已保存建议与阅读记录，再完成来源校验；保存记录明确标为待同步，批量确认仍在点击时校验所选目标，没有记录才显示加载。详情切换和同根目录新增组件订阅不额外发起完整列表读取，已读/撤销推送直接同步版本化回执。计数跟随同一份可见列表数据，同步健康状态独立展示。来源事件由 blueprint-sync 共用订阅，重复事件和读取期间的变化合并；图谱重载不再重复预读建议。修复写入直接交付单篇正文、节点版本与阅读状态，终态只补读持久建议，完整来源对账不再决定卡片是否显示修复结果。正文与建议可分别重试并在成功交付后清除旧错误。

2026-10-12 只读诊断使用当前仓库 296 篇 Note，无模型或用户审核状态访问。一次 context + capture 原先调用 4 次 readSnapshot，冷/热分别约 4829/1147 ms；调整后 2 次，约 4623/738 ms。每种状态仅一个诊断样本，不能当作整机启动提升比例；冷解析仍占主要耗时。blueprint-workspace-init 的并发夹具验证预热、状态、画布与审核只构建一次冷索引；未量化桌面完整启动或多 checkout 大库性能。诊断命令为 npx vitest run --config .cache/blueprint-read-profile.config.ts，临时脚本只对 WorkspaceSuggestionSources.context/capture 计时及计数。

合并 listing 与 load 双 IPC 的方案已否决：缓存命中后两次调用皆为廉价读，省一次往返不值得新增通道；一致性由 rev 门控保证。服务端布局搬迁已否决：同等墙钟效果由稳定键缓存达成，改动小一个数量级。

画布渲染三件同属本域（互链不合并）：[canvas-controls](../navigation/blueprint-canvas-controls.md)（移除悬浮缩放控件）、[zoom-range](../navigation/blueprint-canvas-controls.md)（远览下限 0.05）、[edge-refresh](../navigation/blueprint-edge-partial-refresh.md)（层级边独立路由与局部刷新）；[R7](../tasks/note-graph-r7-perf.md)为性能根治任务，同属本域。

## Acceptance criteria

- [x] AC-1: 进入蓝图无全量解析：热缓存下 projection 零 YAML/mdast 重算，传输不带全文。
- [x] AC-2: 无关刷新零开销：focus 返回与无变更事件不触发 reload，真变更走补丁或单次全量。
- [x] AC-3: 首屏一次提交：节点一次性挂载，动画纯 CSS，无 JS 分批。
