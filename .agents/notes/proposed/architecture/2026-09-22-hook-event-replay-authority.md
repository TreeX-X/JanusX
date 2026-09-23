---
schema: harness-note/1
id: 0358ada8-8f0d-4fcd-8f78-19d14e2b6b19
kind: decision
lifecycle: proposed
created: 2026-09-22
class: architecture
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b74e8ae5-c2c9-4e08-8306-fe1d94e6ebf0
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
---

# Hook 事件重放与启动令牌权威围栏

## Problem

JanusX 的 hook 链路即发即忘：`AgentHookBridge` 校验 token 后把 payload 同步交给 `AgentHookCoordinator`，进程在 turn 中途重启、桥未就绪、或处理期间崩溃，该事件永久丢失。`resolveTerminal` 只匹配已注册终端，未命中发 `unmatched` 后直接丢弃，没有落盘与重放路径。会话台账依赖 turn-end hook 记录轮次边界，丢一笔就永久缺一段；[会话内容 note](../../implemented/feature/2026-09-22-session-conversation-content.md) 已记录 turn 只在 hook 送达时存在的断档。

Orca 用两层机制解决同一问题，机制已在 [orca 解析 note](./2026-09-21-orca-terminal-acquisition-parsing.md) 中源码级验证：`last-status.json` 持久化加 launch-token 围栏的 spool 重放负责跨重启恢复；启动令牌哈希到 pane 级证据，配合 retired/closed-tab 抑制与 new-turn 重绑定，在接受、重启、抑制之间做权威处置。JanusX 目前两层都没有，`resolveTerminal` 的 engine/cwd 启发式兜底会在多终端同引擎场景误归属。

与 [外部会话 backfill note](./2026-09-22-external-session-transcript-backfill.md) 的分工构成 Orca 可靠性模式的两项落地：backfill 以拉取 transcript 存储解决「外部启动、从未进入 JanusX 的会话」的可见性；本 note 以推入路径的持久化解决「JanusX 启动、hook 已发出但进程内丢失」的可靠性。两者根因不同、存储不同、触发不同，互不覆盖。

## Proposal

借 Orca 的模式并收窄到单桌面范围，落两件事。

**事件 spool 与启动重放。** hook payload 在进入 coordinator 处理前先追加写入 userData 下的有界 spool，按接收序号单调递增。主进程启动、`SessionRegistry.load()` 完成后重放仍未标记消费的事件，payload 带 replay 标记进入 coordinator。coordinator 对重放事件走幂等路径：turn 边界若已被同一 terminalId 的后续事件越过则跳过，否则按正常语义补记。spool 设容量上限与按龄淘汰，启动重放成功后清理已消费段，防止磁盘无限增长。

**启动令牌权威围栏。** 终端 spawn 时生成一次性 launch token 注入 hook env（`JANUSX_HOOK_LAUNCH_TOKEN`），与现有 `JANUSX_HOOK_TERMINAL_ID` 并列；hook client 回传该 token。coordinator 在 `resolveTerminal` 之前先做 token 校验：token 存在且与当前注册终端的 spawn 记录一致则接受；token 存在但终端已重建（token 不匹配）则视为 stale 丢弃并记诊断；token 缺失（旧安装、外部工具复用 hook 命令）走现有 engine/cwd 启发式，启发式降级为兼容回退而非权威路径。重放事件同样过此围栏：终端仍在且 token 有效则补记，终端已关且 token 失效则抑制，避免重启后把已归档会话的状态改回活跃。

与 `agent-turn-sentinel` 的职责边界：sentinel 监听 transcript 文件，覆盖「引擎在异常中止时根本没发 hook」的缺口；spool 覆盖「hook 已发出但在进程内丢失」的缺口。两者互补，不合并为一条管线。

## Alternatives considered

- 只做 backfill、不做事件重放 — 最强理由是 backfill 已能从 transcript 重建历史问答，看似覆盖丢事件后的数据缺口。不可行的驱动是实时性与状态：backfill 是拉取式按需扫描，无法恢复刚丢失的 turn-end 导致会话卡片、侧栏状态与 `session:event` 订阅在重启边界之前的滞后，且外部会话与自启会话的丢失根因不同，一条路径盖不住两条。
- 完整照搬 Orca 的 daemon/relay 与 remote ingest — 最强理由是企业级耐久经过生产验证。不可行的驱动是范围：JanusX 刻意单桌面、无 relay 拓扑，`server-ingest-remote`、mobile pairing 等通道没有对应场景，照搬即死代码；[orca note](./2026-09-21-orca-terminal-acquisition-parsing.md) 的 deliberate non-borrows 已把 daemon/relay 划在范围外。
- 仅内存重试队列、不落盘 — 最强理由是实现最简、无磁盘格式要维护。不可行的驱动是崩溃场景：重放的主要价值恰在进程重启后恢复，内存队列跨不过重启，等于只覆盖运行中瞬时抖动。
- 权威围栏推迟、先只做 spool — 最强理由是可分阶段交付，先修最痛的丢事件。不可行的驱动是重放安全：没有 token 围栏，重放会把已关闭终端的事件重新接受进启发式匹配，可能在多终端同引擎时改错对象；围栏与重放必须同批落地。
- Do nothing / reuse — 维持即发即忘与启发式匹配。代价是 turn-end 丢失成为永久缺口，会话时间线与状态在每次重启边界系统性缺段，多终端误归属风险持续存在，且无法演进到 Orca 已验证的权威模型。

## Risks

- Spool 增长失控占满磁盘：缓解是有容量上限、按龄淘汰、启动重放成功后清理已消费段，超限丢弃最旧事件并记诊断而非阻塞 hook 接收。
- 重放事件幂等处理不当产生重复 turn：缓解是 coordinator 已有 `activeTurns` / `syntheticTurnEnds` 状态机，扩展 replay 检测分支并以单测覆盖「同 terminalId 重放已越过边界」「重放补记缺失 turn」两类场景。
- Token 校验破坏旧安装与外部工具兼容：缓解是 token 缺失走现有启发式路径，仅在 token 存在时启用围栏；分阶段 rollout，先观测 stale 丢弃率再考虑收紧启发式。
- 与 `agent-turn-sentinel` 职责重叠造成双记：缓解是明确 sentinel 管「hook 未发出」、spool 管「hook 已发出未送达处理」，两者事件源不同（文件监听 vs HTTP 接收），在 coordinator 入口按来源去重。
- 重放延迟导致状态回跳：缓解是 replay 标记携带原始接收时间戳，coordinator 拒绝时间戳早于当前 terminal 已知最新 turn 的过期补记。
