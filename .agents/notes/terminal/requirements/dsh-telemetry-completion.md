---
{
  "schema": "harness-note/2",
  "id": "8795ab54-4051-4d53-9805-e85a9073ca5d",
  "kind": "requirement",
  "lifecycle": "draft",
  "created": "2026-10-03",
  "class": "feature",
  "tags": ["dsh","telemetry","terminal"],
  "relations": [
    {"type":"derived-from","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/b28d07a3-bc27-4be1-9868-87849e9efb16"}
  ],
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---

# DSH 成功、审批与真实用量信号补全

## Problem

[DSH 接入决策](../dsh-terminal-integration.md)已提供启动、正向状态、声明模型与 headless 事件。PTY 成功结束、审批与问卷面板及非零上下文格式缺少真实样本；压缩日志无法读取用量，无 hook 时也不能自动绑定会话。running 无可靠结束信号时不能保证回到 wait，声明窗口及启动零值不等于实测 token。

## Expected behavior

在配置 key 的真实会话中采集成功、失败、审批、问卷和非零用量样本，保留可公开的脱敏协议片段、版本与来源。只有样本能够稳定区分生命周期时才增加映射，不能把等待输出或文本消失推断为空闲。审批信号不得被普通 running/degraded 更新覆盖。

区分单轮消耗、累计消耗和当前窗口占用。statusBar.tokens/tps 默认关闭，contextUsage/contextBar 必须以真实非零输出定格式；无 ctx/context 锚定的 turn 头仍不能进入窗口统计。需要持久历史用量时，先确认 session.v4.jsonl.zstd 的解码与 schema，再定义有界读取、坏行处理、幂等去重和来源置信规则；无法解码或没有数据时明确显示未知。

会话自动绑定必须有可验证的终端身份来源。现有 conpty pid 与内部挂载 pid 不一致，不能把时间邻近或最新目录当作授权身份；无可靠来源时继续要求显式 sessionId。若上游提供 hook，应在核实协议后接既有 AgentHookCoordinator，而非虚构 DSH 通知投影函数。

## Scope

覆盖 DSH PTY 信号、历史读取及终端绑定的后续设计与验证，以及真实 App 中选择器卡片、设置工具行、React/Ink 在 xterm.js 中的可读性和安装自举复验。历史版本组合及已落地行为由接入决策持有。

[全引擎统计](./usage-telemetry-fix-and-stats.md)继续拥有设置面板、跨终端聚合与全引擎回归；本需求不重写其 AC 或宣告全量历史完整。模型配置投影继续拒绝，远程 DSH 创建不在范围内。

## Acceptance criteria

- [ ] AC-1: 成功、审批、问卷及非零数值信号有脱敏真实样本和明确版本；无样本的映射保持未实现。
- [ ] AC-2: 结束信号正确收敛状态，普通 PTY 更新不覆盖审批、输入和进程错误；无 ctx/context 的单轮用量不冒充窗口占用。
- [ ] AC-3: 历史读取如启用，具备有界解码、坏件诊断、来源与幂等累计验证；不能把缺失数值或启动零值当作真实用量。
- [ ] AC-4: 自动绑定如启用，使用可验证终端身份；不以 conpty pid、最新目录或时间邻近猜测会话。
- [ ] AC-5: 真实 App 验证选择器、设置行、TUI 安装与渲染；记录实际运行的针对性及全引擎回归，不沿用原文历史通过数冒充新结果。

## Alternatives considered

保留当前正向状态与声明模型方案不增加解析维护成本，在缺少样本时继续采用；代价是结束与精确用量不可见。直接按其他引擎格式或文本相似度猜测实现很快，但会混淆窗口和消耗、覆盖审批或绑定错会话。仅做 headless 可取得结构化事件，却不能补齐交互 TUI 的上下文，因此两条入口分别验证。

## Risks

上游 TUI 与日志格式变动会使模式失效；真实样本可能包含密钥或私人提示，必须脱敏后再记录。解码器及日志累计会引入额外成本，需先确定边界再实施，不能把整理这篇需求本身视为能力交付。
