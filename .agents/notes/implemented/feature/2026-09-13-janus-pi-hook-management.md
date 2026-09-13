# Agent Note: janus/pi 接入 hook 管理终端运行状态

Status: implemented

## Problem

JanusX 可以启动 `janus` 与 `pi` 终端，但两者从不进入 hook 管线。`terminal-handlers.ts` 在 warmup、hook env 组装、终端注册三处对 `janus`/`pi` 短路，`AgentEngine` 与 `CompanionEngine` 只收 `claude`/`codex`/`opencode`，`hookCoordinator` 收不到任何 turn 事件。前端创建时默认 `wait`，此后只有 pty 非零退出能翻成 `error`。用户在侧边栏看不到 `janus`/`pi` 的 `running`、等授权、等输入、限流降级，卡住的审批只能逐个打开终端发现。

此前否决 hook 管线的理由已经过时。[2026-09-11 的上下文识别 Note](./2026-09-11-janus-pi-context-recognition.md) 否决时认定两 CLI 无注入面，这个判断对 `pi` 不再成立（扩展系统提供 `agent_start`/`agent_settled` 与 `ui_prompt_start`，并支持 `--extension` 注入），对 `janus` 从一开始就不完整（它是自研 CLI，`CliSession.sendTurn` 是 `chat` 与 `tui` 共用的单漏斗，可直接埋点）。

## Decision

两路共享同一条既有管线（`AgentHookBridge POST /api/agent-hook` → `AgentHookCoordinator` → `terminal:status`），事件名复用 Claude 兼容名（`UserPromptSubmit`/`Stop`/`StopFailure`/`PermissionRequest`/`Notification` 加 `janusx.turn.*` 合成命名空间），coordinator 与渲染侧不分引擎。

`pi` 走扩展注入，不动本体。`AgentHookConfigManager` 在 userData 下托管 `hooks/pi/janusx-notify.js`（`buildPiExtension`，无依赖纯脚本，无 env 时静默返回，任何内部异常只吞不抛），终端启动由裸 `pi` 改为 `pi --extension <托管路径>`（argv 数组传递，无 shell 引号问题），从不写用户 `~/.pi/agent/settings.json`。扩展只订阅四个事件：`agent_start` 置 `running`，`agent_settled` 置 `wait`（`agent_end` 后仍可能自动重试与续跑，不可作完成边界），`ui_prompt_start` 按 `kind === 'confirm'` 分流到 `PermissionRequest`（`needs-approval`）与其余 kinds（`Notification` 配 `idle_prompt` matcher，`needs-input`），`after_provider_response` 仅在 429/5xx 时发 synthetic `api-error`（`degraded`，与 codex 的 service-error 语义对齐）。`turn_start`/`turn_end` 粒度为单次 LLM 往返，一轮内多次触发，始终忽略。

`janus` 走本体埋点（`janus-agentX/packages/cli/src/janusx-hook.ts`＋`session.ts` 接线）。`sendTurn` 入口发 `UserPromptSubmit`、返回发 `Stop`、抛错发 `StopFailure`、取消发 synthetic interrupted，起止两笔均为 await（localhost 开销可忽略，杜绝 `Stop` 超车 `Start` 造成幽灵 turn）；`approval-requested` 监听发 `PermissionRequest`，`ask_user` 通道发 `Notification`（`idle_prompt` matcher），`close()` 发 `SessionEnd`（无活跃 turn 时桥接侧忽略）。发送函数做 env 门控，无 `JANUSX_HOOK_PORT/TOKEN` 即 no-op，独立运行与全部既有单测行为不变。`sessionId` 取 conversation id，恰好命中 `~/.janus/history/<id>.jsonl` 的精确 id 匹配，会话用量绑定附带恢复。

JanusX 公共侧一次改齐：`AgentEngine`、`CompanionEngine`、`TerminalAgentEngine`、`SubAgentRunEngine` 接纳两引擎；`terminal-handlers.ts` 三处短路解除，`janus`/`pi` 进入 hook 注册、companion、turn recorder 与 run 注册表；headless 子进程 runner（`stream-manager`/`parsers`）显式拒绝两引擎，保持原有三引擎边界；companion 网关的远程建端同样显式拒绝两引擎，hook 覆盖只是本地状态，永不进入远控。

## Alternatives considered

- PTY 文本嗅探推断忙闲：零改动且引擎无关，横幅与 JSON 事件在 PTY 里确实可见。但提示回显、ANSI 重绘、多语言文案带来误报，终端状态 Note 已因此否决，hook matcher 的权威信号仍在，否决。
- 改用户全局 `settings.json` 注入 pi 扩展而非 CLI flag：启动命令不变，与 `claude` 的 settings 注入对称。但需与用户手写扩展合并、处理 `0.35.0` 的 `hooks`→`extensions` 改名迁移，冲突面大于 flag 注入，否决。
- `pi --mode json/rpc` 子进程替代 PTY 交互：事件流天然结构化，可省扩展。但 JanusX 终端语义是可交互 PTY，切 headless 等于重做终端交互模型，成本远超扩展注入，否决。
- Do nothing / reuse：维持历史扫描加 PTY 的上下文识别现状，状态显示保持恒 `wait`。零成本，但运行态、审批等待、降级永久不可见，否决。

## Consequences

`janus`/`pi` 终端获得与三引擎相同的六态显示与完成、审批通知：`running`/`wait` 由 turn 边界驱动，`needs-approval`/`needs-input` 由确认与问询驱动，`degraded` 由 turn 级失败驱动（pty 存活可重试），`error` 仍由 pty 非零退出驱动。老版 `janus`（无埋点）与扩展加载失败的 `pi` 退化为恒 `wait`，即改前行为，不 crash、不误报、不污染用户配置。

已知限制与回访信号：`pi` 扩展不传 `sessionId`（可靠 id 无从推导，terminalId 解析已精确），其绑定会话用量仍走既有未绑定路径，会话绑定恢复以扩展回传稳定 id 为信号；`pi` 瞬时 429 重试成功仍记一次失败通知，与 codex 现有语义一致，若改为只报终态需另立 Note；`pi --extension` 在 TUI 交互态的全量加载只经文档确认（`project_trust` 章节列明 CLI 扩展参与全生命周期），本机无 `pi` 二进制，真机联调通过后可删此条；跨仓要求用户 PATH 中的 `janus` 为含埋点版本，否则恒 `wait`，版本探测提示升级留待后续任务。
