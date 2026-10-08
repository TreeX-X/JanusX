---
{
  "schema": "harness-note/2",
  "id": "1645e12c-3b5f-4035-99ac-ba1fb8d02836",
  "kind": "decision",
  "lifecycle": "proposed",
  "created": "2026-09-28",
  "class": "feature",
  "tags": ["debug-mode","agent","mcp","skill"],
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---

# JanusX debug mode plan（采用日志断点流）

## Problem

Cursor 的 Debug Mode 证明：难复现、时序、跨层 bug 靠静态读代码修不好，需要“假设 + 运行时证据 + 人肉复现”闭环。JanusX 是 Electron 工作台壳，Agent 循环在同级 `janus-agentX`（`agent-core/chat-core/cli`），终端里的 Claude、Codex、OpenCode、Pi 只是经 `node-pty/xterm` 投影的外部 CLI，壳侧逼不了它们进调试循环。需要一个不碰真断点（DAP 成本太高）、壳侧可落地、多 CLI 通用的方案，并把参考实现固定下来。

## Decision

采用日志断点流，不做真断点。分两层落地，均由 JanusX 壳侧提供、外部终端 Agent 消费：

- L1 Skill：打包 `SKILL.md + log-server.mjs + 探针模板` 为 `/debug` 命令与运行配置，Agent 只需会改文件、跑 node 脚本、读 NDJSON 即可用。
- L2 MCP sidecar：复用现有 `.mcp.json` 托管思路，提供 `start_debug_session/add_instrument/read_debug_logs/clear_debug_logs`，另给壳侧 Log Viewer、复现检查单、`Mark fixed` 一键清埋点。

WorkflowX 融入方案（本次只定方向，不开工）：不新增 Mode，新增 `debugX` Skill。Cursor 闭源无源码可对，只学它的 loop 与人机卡点：`hypothesize(3-8 个) → instrument(带 session 标记) → checkpoint:reproduce(停，等人) → analyze(证伪) → fix(小 diff) → checkpoint:verify(再复现) → cleanup(机械删)`，探针契约沿用本 Note 的回环绑定、密钥不进日志、`LOG_SERVER_PROBE <session>` 标记。接法：`xdo + debugX` 配 `xdebug` 别名（触发词：能复现但看不懂、竞态、时序、跨端、回归）；`xdel` 在 `02-bus-payload` 的 `Verification` 加复现步骤、日志证据路径、假设对照表，`coderX` 自检加“埋点已删”；`xflow` 复用“`evaluatorX` 后最多一次自动返修”装下加日志再复现，`socratesX` 加预期 vs 实际、复现步骤、偶发率三问，`auditX` 加无残留埋点、无日志进仓两查；`.claude` 与 `.codex` 双面同逻辑落地。

参考仓库（2026-09-28 核验，均公开可读）：

| 仓库 | 定位 | 抄什么 |
|---|---|---|
| `cursor.com/docs/agent/debug-mode`、`cursor.com/blog/debug-mode` | 官方定义 | 六步循环：探索假设、埋点、等人复现、分析日志、精准修、验证清理；跨语言靠发网络请求 |
| `wangnan0916/runtime-debug-toolkit`（原 `cursor-like-debug-mode`，MIT） | 最完整的 Agent Skill 实现 | `skills/debug-mode/SKILL.md`、`skills/trace-mode/scripts/log-server.mjs + collector-server.mjs + start-collector.mjs`（`127.0.0.1` 随机口，`POST /log` 写 NDJSON，`GET /health` 查态，`LOG_SERVER_PROBE <session>` 标记删除）、`assets/browser-log-helper.js + node-log-helper.js`、`$trace-mode` 只定位、`$debug-mode` 修完验证 |
| `metruzanca/mcp-debugger` | 最小 MCP | `http://localhost:6969` 收 `fetch POST JSON`，同地址 SSE 实时看；Flask + React 双端例子 |
| `iarmankhan/agentic-debugger` | MCP 工具化（JS/TS/Python） | `start_debug_session/stop_debug_session/add_instrument(file:line)/remove_instruments/list_instruments/read_debug_logs/clear_debug_logs`，`// #region agentic-debug-<id>` 机械清理，默认 `9876` + CORS |
| `microsoft/DebugMCP`（MIT，528★） | 工具与工作流分离范本 | MCP 只暴露瘦工具，流程放 `skills/debug-live/SKILL.md`；`npm i -g debugmcp` 可脱离 VSCode；JanusX 只借鉴其 skill/工具切分，不引 VSCode Debug API |
| `debugmcp/mcp-debugger` | 真断点对照组（本次不做） | `28` 工具经 DAP 调 `debugpy/js-debug/Delve`；作为“为何不做”的成本证据 |

## Proposal

采用日志断点流，分两层落地，均由 JanusX 壳侧提供、外部终端 Agent 消费：L1 打包 `SKILL.md + log-server.mjs + 探针模板` 为 `/debug` 命令与运行配置；L2 复用 `.mcp.json` 托管思路，提供 `start_debug_session/add_instrument/read_debug_logs/clear_debug_logs`，另给壳侧 Log Viewer、复现检查单、`Mark fixed` 一键清埋点。WorkflowX 侧新增 `debugX` Skill 寄生于 `xdo/xdel/xflow`，以 `xdebug` 别名触发，不新增 Mode。

## Alternatives considered

- 真断点 DAP（`debugmcp/mcp-debugger`、`microsoft/DebugMCP` 全量）：最强理由是单步、看变量、改值一条龙。否决驱动是每语言要工具链（debugpy、js-debug、Delve、JDWP），`launch.json` 适配、Electron 无 VSCode Debug API 需自研 headless DAP，成本数倍于日志流。
- 只做 L3 原生 Mode（改 `janus-agentX` 的 loop/prompt/checkpoint）：最强理由是 `Shift+Tab` 一键体验。否决驱动是只服务自家 agent，外部 Claude/Codex 用不上；应排在 L1+L2 跑通之后。
- 新增独立 Mode（如 `xdebug` 与 `xdo/xdel/xflow` 并列）：最强理由是与 Cursor 的模式切换手感对齐。否决驱动是路由爆炸，debug 是正交的证据门控环，应以 Skill 形态寄生在现有三 Mode 内，别名即可。
- Do nothing / reuse：零成本；代价是难 bug 继续靠猜测式大改，外部终端 Agent 与 JanusX 壳无调试协同。

## Risks

- 仅适用于可复现 bug，一次性/偶发问题收不到有效日志，可能误排除。
- 探针加错路径或忘记清理会污染日志与仓库，需 `LOG_SERVER_PROBE <session>` 标记做机械删除门控。
- 需处理回环绑定、CSP `connect-src` 放行、端口随机化，密钥不得进日志。
- DAP 真断点不在本次范围，单步/变量检查类需求仍需另起方案。

## Consequences

- **Gains**: 一套埋点协议服务所有终端 CLI；修小（2-3 行）、证据可回放、埋点可机械清除；壳侧沉淀 Log Viewer 与复现清单成为工作台差异化。
- **Costs and limits**: 依赖可复现的 bug（一次性的收不到日志）；探针加错路径会产生误排除；需处理回环绑定、CSP `connect-src` 放行、密钥不进日志、端口随机化。
- **Verification**: 先以 Skill 形态跑通一个前后端 demo（React `fetch` + Node/Python `POST`），再收敛为 MCP sidecar；DAP 不进入本次验收。WorkflowX 落地顺序：`debugX SKILL.md` 双面落地 → `orchestrateX` 路由加触发词 → payload/`auditX` 各加数行 → 跑 demo 验证；本次只记录方向，后续另起任务开工。
