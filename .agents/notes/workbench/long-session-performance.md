---
{
  "schema": "harness-note/2",
  "id": "08cd6022-8126-450f-808d-b2c99e90bb37",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-15",
  "updated": "2026-10-15T18:00:40.305Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c",
  "relations": [
    { "type": "related-to", "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/80f207b2-591b-5a1d-824e-e169dc5b80c0" }
  ]
}
---

# 长时间使用后的交互卡顿与便携版进程负载

## Intent

记录 2026-10-16 对运行中 0.9.2 便携版的只读采样，以及用户反馈的左侧悬浮、输入框与输入法候选栏、右侧点击一起变慢。本文是待验证的性能方向，不代表这些问题已修复或通过端到端验收。

便携程序位于 JanusX 仓库的 `release/0.9.2-fixed`，从临时目录解压运行，userData 位于 `release/0.9.2-fixed/data`。注册工作区包括 JanusX 仓库。通过 `@electron/asar` 核对实际安装包实现，没有将未打包的工作区改动当成运行事实，也未关闭应用或修改运行配置。

## 实测证据

| 对象 | 采样结果 | 边界 |
| --- | --- | --- |
| 主进程 PID 10056 | 一次约 5 秒采样占单核 CPU 95.9%，私有内存约 480 MB | 一个逻辑核心为 100%，不是整机占用率 |
| 主界面 PID 52868 | 同次采样占单核 CPU 65.3%，私有内存约 518 MB | 未取得 JavaScript 调用栈 |
| GPU 进程 PID 15388 | 同次采样占单核 CPU 41.5% | 是该进程 CPU 时间，不是 GPU 硬件利用率 |
| 第二 renderer PID 32012 | 同次采样约 0% | 不是所有 renderer 都异常 |
| Git 子进程 | 主进程下曾同时存在 150 个 check-ignore；另一次采样前后各 122 个，PID 交集为 0 | 持续创建退出的进程风暴，不足以证明永久进程泄漏 |
| 可用系统内存 | 约 16 GB | 当前不支持系统内存耗尽是主因 |
| 仓库递归监听 | 10.017 秒共 61 个事件，56 个来自便携版 data，5 个来自 artifacts | 文件事件数不等于应用刷新次数 |

profile 事件主要来自用量数据库 WAL/SHM、本体、审查状态及其临时文件。使用 Win32_Process 父 PID、创建时间、CPU/I/O 计数配合 Get-Process 采样；进程累计 I/O 不能直接解释为物理磁盘读写量。

## P0：应用数据位于被监听工作区

`src/main/bootstrap/session.ts` 将便携版 userData 放在可执行文件旁，而 `src/main/ipc/handlers.ts` 递归监听工作区。当前 profile 在工作区内部，原版广播前没有排除该真实路径。活动 scope 命中时，`useWorkspaceBootstrap.ts` 会从文件事件刷新文件树、Git 状态与编辑器；应用自己的用量与审查写入也能成为刷新源。

提交 `f0c5995` 已合并刷新、限制目录/Git 并发，并过滤 Git 锁/对象/日志与根层 `.janusX` 事件，但没有按 userData 真实路径排除 release 内 profile。它限制放大量，尚未切断该触发源；采样时旧便携版也未包含该提交。

后续应按规范化绝对路径排除应用 userData/sessionData/cache，不能硬编码版本目录或屏蔽用户全部 data 文件夹。验证空闲刷新/Git 启动速率，并确认源码、外部 Git 变更与原始订阅者保持正确。

## P1：遥测重复扫描与主线程同步 SQLite

`runtime-telemetry/coordinator.ts` 每 10 秒读取终端快照；`history.ts` 先递归列举 Codex 会话文件再按绑定 ID 筛选。为精确压缩计数读取整个绑定文件，读取器逐行 JSON 校验后解析器再次解析，并计算 SHA-256；绑定文件未变化也重复工作。

清理前本机 Codex sessions 有 1,115 个 JSONL，合计约 1,539.9 MB；Claude projects 有 95 个，约 165.3 MB。这不代表每轮读取全部内容。两个 Codex 绑定文件约 5.71 MB 和 1.36 MB，采样时均非刚写入。

`usage-ledger.ts` 每次 record、sessionState、sourceCheckpoint 均打开/关闭 DatabaseSync，重复 PRAGMA 与表/索引检查，配置 busy_timeout=3000、synchronous=FULL。每五分钟全语料扫描逐文件查询账本。同步工作在 Electron 主线程执行，遇锁或大量历史可能阻塞 IPC；独立耗时占比尚未测出。

后续考虑绑定路径缓存、未变化快照、增量解析、连接复用或 worker 隔离。必须保留账本幂等、事务与精确压缩计数，不能用尾部抽样降低正确性。测试空闲轮询、大文件增长、全语料扫描和锁竞争。

## P1：每个目录重复进入审查注册

`handlers.ts` 根 load 与每次 children 都调用 registerWorkspaceWatcher，再调用 trackBlueprintReviewWorkspace。`blueprint/review/runtime.ts` 随即读取 context、automatic.watch 和 reading.read；context 含根解析、身份读取与 Git 分支查询。watcher 已存在不会跳过这些业务工作。调用链已核对，独立性能贡献未量化。

后续将首次工作区注册与目录读取分离并合并并发注册，同时保留分支切换、关闭/重开和失败重试。

## P2：隐藏终端、聊天与动画更新

`CLITerminal.tsx` 隐藏终端仍接收解析输出；四个热工作区上限不等于四个终端上限，每终端预算也不等于总预算。多个持续输出可能共同挤占输入；尚无 trace 将 renderer CPU 精确归因于 xterm。

`JanusChatProvider` context 随 runtimeStates 重建，流式按 16 ms 合批，相关消费者可能连带更新。JanusChat 输入与历史在同一组件，每次输入重跑消息合并、排序和逐消息工具过滤。历史 MarkdownContent 已 memo，不能称为每次输入都重新解析全部 Markdown。

`JanusIslandExpandedShell` 展开态定时增删粒子 React state，活跃时约每 200 ms 新建粒子，CSS 存在持续动画和滤镜；需要隔离对照，GPU 进程 CPU 高不能证明动画是主因。ThemedTooltip 默认 350 ms 延迟是设计行为，数秒延迟需另查事件循环。

## Open questions

优先切断 profile 自监听，再去重审查注册和优化遥测；后台稳定后，用 renderer trace 决定终端、输入与动画改动。隐藏输出须保持回放与顺序；聊天优先隔离输入、稳定历史行并缩小 context 更新范围。

仍缺新便携版长时对照、IPC/刷新次数、主线程/renderer 调用栈和输入/悬浮延迟分位数。应比较空闲/持续输出、单/多终端、可见/隐藏及流式/动画开关。当前不能证明内存长期不增长，也不承诺已有补丁消除全部卡顿。

既有修复验证由[文件树刷新说明](./file-tree-reveal-race.md)维护，其回归与构建不是后续问题已修复的证据。本文不创建 Task，不将建议标为已实施。
