---
schema: harness-note/1
id: 4f9cb92a-9bf8-55be-b2a5-bf65e5124bee
kind: decision
lifecycle: implemented
created: 2026-09-14
class: bug-fix
---
# Agent Note: 后台 adhoc 与同步命令共享 shell 判定并透出启动失败

Status: implemented

## Problem

同步 `command.run` 具备 Windows shell 判定加元字符拦截，后台 `runAdhoc` 只共享了判定的一半：`spawnProcess` 按 `requiresCommandShell` 开 shell，但元字符守卫只在同步路径存在；spawn 失败（ENOENT）只发 `error` 不发 `exit`，快照与落盘日志停留在只有任务头的空输出，轮询侧无从定位——V0.8.5 打包日志的空日志形状；`stop` 单句柄杀在 win32 漏掉 `npm` 拉起的子树；description 对后台只有“建议”，没有阈值。

## Decision

`runAdhoc` 与同步路径同口径：shell 承载的 shim 参数含元字符直接拒绝，判定函数仍是同一 `requiresCommandShell`，两侧永不漂移。启动失败文本存入条目，随快照 `output` 头部与落盘日志透出，附带与 janus-agentX 同措辞的修复指引；win32 负退出码同样附指引。落盘日志头新增 `executionMode` 行，诊断无需改接口。`stop` 在 win32 先整树强制预清，再走原句柄杀流程；预清失败时句柄杀兜底，语义只增不改。`command.run` 的 description 规定预期超 60s 的命令必须走 background。`workspace.search/edit/create` 的自愈行为随 `@janus-agent/agent-core` 的 dist 重建自动生效，JanusX 侧无重复实现。

## Alternatives considered

- 后台改调 janus-agentX 的 `JobManager`，与 Runner 二选一：最强理由是单实现永不漂移。否决驱动是 Runner 同时拥有 dev 进程生命周期、端口提取与快照保留，迁移成本远超移植四个小行为。
- 树杀优雅优先（先 `/T` 不带 `/F`）：最强理由是给子进程落盘机会。否决驱动是控制台进程无视优雅终结，旧句柄杀在 win32 本就是 `TerminateProcess`，优雅只会把超时与停止拖成秒级等待。
- Do nothing / reuse：零代码；代价是后台 shim 参数无守卫、空日志故障在壳侧重复出现、打包子树随 stop 残留。

## Consequences

- **Gains**: 后台与同步的启动语义一致；不可解析程序的快照与日志携带原因加指引；win32 停止即时生效且无子树残留，`stop` 回归实测 0.4s 内返回；60s 阈值写入工具描述。
- **Costs and limits**: 同步 `executeCommand` 超时/打断路径复用同一 `tryTreeKill` 预清加句柄杀兜底；`workspace.*` 自愈依赖 janus-agentX 侧的构建产物，联调前需先在其仓执行构建；shim 名单为静态集合，两仓语义相同但各存一份，增补时需两边同步。
- **Incidental**: 顺手修复 `runAdhoc` 对象字面量收尾的 `})` 笔误（工作区既有未提交改动所致），否则本文件无法通过编译。
- **Verification**: `npx vitest run tests/unit/project-runner-adhoc-recovery.test.ts tests/unit/project-runner-stop-all.test.ts` 6 通过；`npm run typecheck` 通过。
