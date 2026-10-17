---
{
  "schema": "harness-note/2",
  "id": "08cd6022-8126-450f-808d-b2c99e90bb37",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-15",
  "updated": "2026-10-16T02:16:12Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c",
  "relations": [
    { "type": "related-to", "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/80f207b2-591b-5a1d-824e-e169dc5b80c0" }
  ]
}
---

# 长时间使用后的交互卡顿与便携版进程负载

## Intent

记录 2026-10-16 对运行中 0.9.2 便携版的只读采样，以及用户反馈的左侧悬浮、输入框与输入法候选栏、右侧点击一起变慢。版本差异与现场证据支持下述优化，已在工作区实施并通过定向验证；新版便携包的长时交互仍未验收。

便携程序位于 JanusX 仓库的 `release/0.9.2-fixed`，从临时目录解压运行，userData 位于 `release/0.9.2-fixed/data`。注册工作区包括 JanusX 仓库。通过 `@electron/asar` 核对实际安装包实现，没有将未打包的工作区改动当成运行事实，也未关闭应用或修改运行配置。

2026-10-16 继续复核后，最值得优先验证的回归链是：0.9.2 新增的用量数据库访问与后台历史扫描产生负载和 profile 文件事件，经两版共有的工作区监听、目录展开和 Git 查询放大。原文列出的机制大体存在，但“问题存在”“本版新增”“已解释用户卡顿”是三种不同结论。用户反馈 0.9.1 未出现同类卡顿；尚未在相同数据和操作下运行两版长时 A/B，不能据此把所有旧机制排除，也不能把它们列为新增缺陷。

## 版本基线与差异

源码对比固定为 `v0.9.1` → `v0.9.2`，提交分别为 `ffd4a1cb3cf864f0c5e9241993bdf90c38f1164d`、`cda5805fed094c65689385dadf9b89a568c018c3`。同时读取本地 `release/0.9.1`、`release/0.9.2-fixed` 的 `win-unpacked/resources/app.asar`，核对 package 版本及全部 `out/main` JavaScript 分块：两版均有便携 data 路径；仅后者含用量账本、全语料扫描和重复 JSON 校验实现。该核对确认相关实现已打包，不声称本地产物逐字对应标签或代表用户当时使用的每个包。

| 路径或行为 | 0.9.1 | 0.9.2 与复核结论 |
| --- | --- | --- |
| 便携 data、递归 watcher、每目录 check-ignore、重复审查注册 | 已存在 | 属于既有放大机制，不能单独解释版本差异 |
| Codex 绑定会话读取与目录枚举 | 已整文件读取，先全目录枚举再筛选 | 继续整读，新增逐行预校验、SHA-256 与账本访问；不是从尾读改为整读 |
| Claude 绑定会话读取 | 首 16 KiB + 尾 256 KiB | 改为整读，逐行预校验、遥测解析、事件收集重复解析 |
| 10 秒终端轮询 | 已挂载 CLITerminal 驱动 | 移至主进程，覆盖仍受跟踪的终端；热工作区卸载不再停止该终端轮询，退出/销毁才释放 |
| 持久用量账本 | 无此账本 | 新增主线程 DatabaseSync，每次查询亦重开、初始化和关闭连接 |
| 全历史用量扫描 | 无此扫描 | 启动约 20 秒首次执行，此后每 5 分钟执行；零终端仍运行 |
| 会话面板同步 | 已有启动/面板触发扫描 | 新增面板活跃且窗口可见时约每 5 秒扫描，保留解析缓存和请求合并 |
| Chat 不可见时的渲染树 | 直接 return null | 普通会话保留 hidden 子树及新增 MemoPanel；隐藏不是暂停 React 更新 |

主要引入提交是 `f3b5aaf`（用量账本及历史解析）、`e06a500`（全语料扫描与无 hook 归属）、`dc60c70`（会话面板周期同步）。提交说明不能代替源码：全语料扫描器实际枚举 Claude/Codex/Pi；OpenCode 仍走绑定终端路径。

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

上述 profile 路径与刷新链在 0.9.1 已存在。0.9.2 的新增点是 SQLite 等周期负载。Git 忽略 release/data 不会让 `fs.watch` 自动忽略它们；文件树的忽略标记也不等于监听排除。若实际便携包在所监听工作区外，该自监听解释便不成立，仍需分别调查遥测本身和 renderer。

提交 `f0c5995` 已合并刷新、限制目录/Git 并发，并过滤 Git 锁/对象/日志与根层 `.janusX` 事件，但没有按 userData 真实路径排除 release 内 profile。它限制放大量，尚未切断该触发源；采样时旧便携版也未包含该提交。

本轮已按规范化绝对路径排除实际 userData、sessionData 与显式 disk-cache-dir 子树；默认 Chromium 缓存位于 sessionData 内。Electron 不提供 cache 这个 getPath 名称。没有硬编码版本目录或屏蔽用户全部 data 文件夹；原始订阅者仍接收所有事件，未知文件名仍保守广播。

## P1：遥测重复扫描与主线程同步 SQLite

`runtime-telemetry/coordinator.ts` 每 10 秒读取受跟踪终端快照；`history.ts` 先递归列举 Codex 会话文件再按绑定 ID 筛选。为精确压缩计数整读 Codex 绑定文件在 0.9.1 已存在；0.9.2 新增读取器逐行 JSON 校验后解析器再次解析，并计算 SHA-256。绑定文件未变化也重复工作。Claude 的整读则是本次新增，还为事件收集再次解析全部行。

清理前本机 Codex sessions 有 1,115 个 JSONL，合计约 1,539.9 MB；Claude projects 有 95 个，约 165.3 MB。这不代表每轮读取全部内容。两个 Codex 绑定文件约 5.71 MB 和 1.36 MB，采样时均非刚写入。

`usage-ledger.ts` 每次 record、sessionState、sourceCheckpoint 均打开/关闭 DatabaseSync，重复 PRAGMA 与表/索引检查，配置 busy_timeout=3000、synchronous=FULL。尤其 `open()` 无条件执行 `PRAGMA user_version=1`，查询入口并非只读连接；未增加用量记录也会有数据库文件事件。全语料扫描即使全部命中未变化游标，仍逐文件执行这条同步打开路径。同步工作在 Electron 主线程执行，遇锁或大量历史可能阻塞 IPC。

### 隔离验证

本地诊断脚本 `artifacts/performance-review-092/review.mjs` 从两个标签读取源码并用 esbuild 编译，在系统临时目录生成合成 profile 和 JSONL，不访问真实会话或运行中应用的账本。命令为 `node artifacts/performance-review-092/review.mjs`，机器结果保存在同目录 `results.json`；artifacts 由 Git 忽略。历史读取只增加字节/JSON.parse 计数，五次热读取中位数；计时包含计数开销，不是 Electron 长时交互基准。

| 实验 | 0.9.1 | 0.9.2 |
| --- | --- | --- |
| 同一约 8.02 MiB Codex 文件，每轮实际读取 | 8,410,778 字节 | 8,410,778 字节 |
| 同文件每轮 JSON.parse 次数 / 中位耗时 | 4,502 / 14.47 ms | 9,004 / 20.54 ms |
| 同一约 8.02 MiB Claude 文件，每轮实际读取 | 278,528 字节 | 8,410,664 字节，约 30.2 倍 |
| 同文件每轮 JSON.parse 次数 / 中位耗时 | 149 / 1.85 ms | 13,503 / 24.38 ms |

在 Node 24.15.0/Windows 中，0.9.2 的 1,000 次连续同步 `sessionState` 查询约耗时 14,352.97 ms；10 次相隔 200 ms 的查询产生 90 个原始 watcher 事件，涉及数据库、WAL、SHM。用量记录仍为零，证明“记账幂等”不等于“未变化查询无磁盘活动”。连续 1,000 次调用时 watcher 还收到空文件名，不能将缓冲合并后的事件数当作实际写入次数。语料扫描在文件之间有异步等待，这个压测不表示真实扫描连续冻结 14 秒。

另一 worker 人为持有写锁后，一次 `sourceCheckpoint` 查询约 3,358.25 ms 后报 database is locked；调用期间零延迟定时器未执行，复现同步初始化能阻塞事件循环。尚无证据表明用户现场确实发生锁竞争，不能把合成写锁实验作为现场根因。

以上支持新增数据库成本、文件事件触发源和解析放大量，不能独自解释之前 5 秒样本中的 95.9% 主进程单核占用。两个几 MB 的绑定文件每 10 秒解析一次的耗时不足以直接推出持续满核；需测刷新次数、Git 启动率、全历史扫描和主线程调用栈。

本轮已实施连接复用与有界未变化快照缓存，保留账本幂等、事务与精确压缩计数。源文件变化后仍完整解析与哈希；未实现增量解析或 worker 隔离，单个持续变化的大文件仍可能占用主线程。是否进一步隔离由调用栈与长时交互测量决定。

## P1：每个目录重复进入审查注册

`handlers.ts` 根 load 与每次 children 都调用 registerWorkspaceWatcher，再调用 trackBlueprintReviewWorkspace。`blueprint/review/runtime.ts` 随即读取 context、automatic.watch 和 reading.read；context 含根解析、身份读取与 Git 分支查询。watcher 已存在不会跳过这些业务工作。调用链已核对，独立性能贡献未量化。

该调用链在两个标签之间未变，应归为放大器。`reading.read` 没有传入 snapshot 时还会 `sources.capture`，其中再次解析 context、读取两次 Note 快照并复核分支；内部缓存是否命中会影响代价，不能声称每次必定完整重解析所有 Note。`NoteReadingService` 只有内容状态改变时才保存，不能把每次目录读取描述成必定写入审查状态、形成无限反馈。

本轮已将首次工作区注册与目录读取分离，合并同根在途注册；根重新加载仍检查分支和重试，关闭或 shutdown 使迟到的 context 结果失效。

## P2：隐藏终端、聊天与动画更新

`CLITerminal.tsx` 隐藏终端仍接收解析输出；四个热工作区上限不等于四个终端上限，每终端预算也不等于总预算。多个持续输出可能共同挤占输入；尚无 trace 将 renderer CPU 精确归因于 xterm。

`JanusChatProvider` context 随 runtimeStates 重建，流式按 16 ms 合批，相关消费者可能连带更新。JanusChat 输入与历史在同一组件，每次输入重跑消息合并、排序和逐消息工具过滤。历史 MarkdownContent 已 memo，不能称为每次输入都重新解析全部 Markdown。

`JanusIslandExpandedShell` 展开态定时增删粒子 React state，活跃时约每 200 ms 新建粒子，CSS 存在持续动画和滤镜；需要隔离对照，GPU 进程 CPU 高不能证明动画是主因。ThemedTooltip 默认 350 ms 延迟是设计行为，数秒延迟需另查事件循环。

版本对比中，隐藏终端解析和粒子定时机制已在旧版存在。新增且值得测量的是普通 Chat 从隐藏时 return null 改为保留 hidden 树与 MemoPanel；流式 context 更新仍可让隐藏内容参与协调。另一个新增放大量是 ThemedTooltip 把全局 scroll/resize/keydown 监听从显示期间移为每个实例挂载期间，并增加 pointerdown；有清理函数，不构成已证实的监听泄漏。尚无 renderer trace 将两项增量与输入延迟关联，优先级低于已有数据库与进程风暴证据。

## 补充：会话面板的周期扫描

`dc60c70` 新增 `startExternalSessionSync`：会话面板 active、文档可见时每次完成后约 5 秒重新扫描，并在 focus/visibilitychange 时唤醒。`collectCandidates` 在截取每引擎 200 个候选之前会遍历整个目录并逐文件 stat，因此候选上限没有限制枚举成本；该循环也不按当前 scopePath 限定原生会话库。

解析结果按 mtime/size 缓存，主进程合并同时请求，批量导入合并通知。因此不能称为每 5 秒重新全文解析所有历史或重复启动无界扫描。活跃会话文件变化会失效缓存并重新读取，和遥测扫描可能重复处理；只在会话面板开启时出现/显著加剧的卡顿应重点对照此项。面板关闭时不应据此解释持续负载。

## 已实施的安全优化

保留真实用户 profile、历史数据和既有未提交改动；优化覆盖触发源、重复工作和释放流程，不关闭统计或降低压缩计数精度。

1. `workspace-event-filter.ts` 在注册时解析绝对路径与 junction 别名，过滤工作区内实际应用数据子树的 renderer 广播。原始订阅、未知文件名、普通同名 data 与相邻前缀路径保持正确；过滤不阻止底层 watcher 接收事件。
2. UsageLedger 复用连接，提供幂等 close；路径切换关闭旧连接。仅新库在事务内初始化 schema/version；普通查询不再执行初始化写入。WAL、FULL、原子提交、模式锁与分页快照保留，查询异常显式回滚。同步 busy_timeout 从 3000ms 降至 100ms，写锁失败报告并在下一轮重试，持续争锁时采集会延后。
3. coordinator 最多缓存 128 份轻量遥测投影，不持有完整 JSONL 或待记账观测。按引擎、绑定、cwd、自定义 home 隔离，每次命中异步 stat 比较 dev/ino/birthtime/size/mtime/ctime，最长 30 秒强制全文复核。增长、改写、替换、删除、重绑、解析和记账失败不复用旧观测；缓存不替代账本源前缀 SHA-256 校验。
4. 同根审查注册合并在途调用，children 不重复扫描已注册根。语料扫描保持不重叠，文件间让出事件循环并响应取消；退出时取消扫描与定时器、清缓存并排入最终完整采集，等待在途读取后关闭账本。补正 Codex 累计模式在终端与语料扫描交替时的源字节/身份传递，半写尾行不进入已完成前缀哈希。
5. Tooltip 仅在等待展示或展示期间订阅全局关闭事件，保留延迟取消、键盘与点击关闭行为。隐藏 Chat、xterm 与动画是否需要调整仍待 trace。

### 优化前后隔离对比

命令为 `node artifacts/performance-review-092/compare-optimized.mjs v0.9.2`，完成后再执行同命令的 `workspace` 参数。Windows/Node 24.15.0，使用相同约 8.02 MiB 合成 Codex 文件和临时账本，不访问真实会话。2026-10-16 顺序运行结果保存于同目录 `final-comparison.json`；该脚本与产物位于 Git 忽略目录。

| 实验 | 原始 0.9.2 | 优化后工作区 |
| --- | --- | --- |
| 1,000 次未变化 sessionState 查询 | 13,658.48 ms | 7.53 ms |
| 10 次相隔 200ms 查询的原始文件事件 | 90 | 0 |
| 另一连接持写锁时 sourceCheckpoint 查询 | 3,367.55 ms 后报锁错误 | 0.12 ms，成功 |
| 预热后 100 次未变化绑定会话查询 | 5,673.78 ms | 18.95 ms |
| 上述 100 次 JSONL 读取 / JSON.parse | 841,077,800 字节 / 900,400 次 | 0 字节 / 0 次 |

这些是隔离路径计时，不能换算为全应用加速倍数。首次完整解析未缩减，变化中的大文件仍需全读；缓存测量在 30 秒复核期内。事件数、字节数和解析次数直接支持消除重复工作；真实 UI 延迟和 Git 启动率仍需新版包测量。

### 回归验证

21 个定向 Vitest 文件、161 项用例通过，覆盖账本压力/写锁重试/回滚、历史与累计守恒、源改写与半写尾行、缓存变化/删除/重绑/失败重试、最终采集、扫描取消、watcher 过滤与原始订阅、审查注册和文件树压力。两个 `right-tool-tooltips.spec.ts` 浏览器用例通过（纸面/深色）；严格未使用检查 `npm run typecheck:strict-unused`、生产文件定向 ESLint 与 `npm run build:check` 通过。浏览器使用 IPC 替身，隔离压测使用 Node 24；它们不代替 Electron 35 实机长时输入验收。

单测命令为 `npx vitest run --maxWorkers=2`，文件集合为 `tests/unit/` 下的 `usage-ledger.test.ts`、`usage-ledger-pressure.test.ts`、`usage-ledger-client.test.ts`、`runtime-telemetry.test.ts`、`runtime-telemetry-history.test.ts`、`runtime-telemetry-accounting.test.ts`、`runtime-telemetry-coordinator.test.ts`、`runtime-telemetry-corpus-scan.test.ts`、`runtime-telemetry-attribution.test.ts`、`session-attribution.test.ts`、`office/workspace-watcher-coordinator.test.ts`、`workspace-event-filter.test.ts`、`blueprint-review-registration.test.ts`、`file-tree-ignore-pressure.test.ts`、`file-tree-refresh-pressure.test.ts`、`file-tree-load-pressure.test.ts`、`blueprint-note-reading.test.ts`、`app-shutdown.test.ts`、`external-session-sync.test.ts`、`external-session-scanner.test.ts`、`blueprint-review-status.test.ts`。浏览器命令为 `npx playwright test tests/e2e/right-tool-tooltips.spec.ts --project=island --workers=1`。`npm run check:notes` 验证 312 篇 Notes、0 错误、17 条既有跨仓链接诊断；定向 `git diff --check` 无空白错误。

### 本地便携包交付

2026-10-16 从当前工作区重新构建 Windows x64 便携版，版本保持 0.9.2，输出为 `release/0.9.2-performance-20261016/JanusX-0.9.2-x64-portable.exe`，约 162.2 MiB。执行 `npm run package:prepare`，再执行 `node scripts/package-win-portable.mjs --release-dir release/0.9.2-performance-20261016`；准备步骤刷新一个本地 sibling 发布包。交付包含当前未提交改动，未改写旧版目录、真实 profile 或发布远端版本。

独立重跑 `node scripts/check-packaged-runtime.mjs --portable --release-dir release/0.9.2-performance-20261016`，确认退出码 0；依赖闭包、体积预算、隔离目录中的 unpacked/portable payload 两种启动检查及 portable 启动器通过。逐文件核对 app.asar 中全部 213 个 out 文件与本次构建 SHA-256 一致。新目录附 `BUILDINFO.json`、`SHA256SUMS.txt` 与 `README-local.txt`，验证日志位于 `artifacts/portable-performance-20261016/verification.log`。这些检查确认构建与启动，尚未测新版包的长时输入延迟。

## Open questions

后续对照需固定同一份可恢复 profile/原生历史快照、工作区、终端数量和操作，不同时打开两版写同一账本。先比较便携包位于工作区内/外，再比较全历史扫描、会话面板、可见/隐藏终端及 Chat；记录 10 秒/5 分钟节奏附近的事件、IPC、Git 进程速率及输入 p50/p95/p99。诊断开关或 bisect 应在隔离构建中实施；当前未关闭用户功能、移动包或改写真实数据。

仍缺新便携版长时对照、IPC/刷新次数、主线程/renderer 调用栈和输入/悬浮延迟分位数。应比较空闲/持续输出、单/多终端、可见/隐藏及流式/动画开关。当前不能证明内存长期不增长，也不承诺已有补丁消除全部卡顿。

既有刷新合并与 Git 并发边界由[文件树刷新说明](./file-tree-reveal-race.md)维护；遥测正确性与生命周期由[会话源单源化](../terminal/requirements/usage-telemetry-single-source.md)维护。本文不创建 Task；已实施项与待测 renderer/包内长时问题分开陈述。
