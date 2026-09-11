# Agent Note: Janus/Pi 上下文识别

Status: implemented

## Problem

JanusX 可以启动 `janus` 与 `pi` 终端，但上下文识别只覆盖 `claude`、`codex`、`opencode` 三个引擎。`getRuntimeTelemetrySnapshot` 对 `janus`/`pi` 直接返回空，PTY 文本解析器不认识两者的输出形状，启动声明模型也没有读取入口。结果是 `janus`/`pi` 终端的上下文行永远停留在按 preset 硬编码的估算值上，模型切换不可见，会话用量不可见，压缩计数不可见。

## Decision

上下文识别对 `janus` 与 `pi` 与三引擎走同一条三层管线，只是数据源换成两者各自实际落盘与输出的东西。

主进程历史扫描（`src/main/runtime-telemetry/history.ts`）为两个 preset 接入与三引擎相同的“绑定会话读历史、无绑定读声明”语义。`janus` 的声明模型来自 `~/.janus/config.json` 的 provider 目录解析，会话存在性来自 `~/.janus/history/<conversationId>.jsonl` 的精确 id 匹配；该历史文件只存消息与工具轨迹而不存用量，因此会话扫描只提供模型与会话归属，实时用量由 PTY 层补齐。`pi` 的声明模型来自全局 `~/.pi/agent/settings.json` 与项目 `.pi/settings.json` 的合并，会话扫描递归读取会话目录下 JSONL，按 `id`/`parentId` 只沿活跃叶路径累加各 assistant 消息的 `usage`，同时统计路径上的 `model_change` 与 `compaction` 条目；跨目录、跨工作区的会话头一律拒绝，放弃的分支永不计入用量。

渲染侧 PTY 解析（`src/renderer/src/lib/runtime-telemetry.ts`）补三处识别。`janus` 启动横幅中的 `model <id>` 进入模型检测，但必须以行内出现 `janus` 为锚点，且候选必须通过单 token 模型形状校验，散文中的 `model the behavior` 不会被误收。`janus` 底部栏的 `12 in / 8 out` 解析为累计输入输出用量，只填累计字段而不碰当前上下文。`usage` 短键（`input`、`output`、`cacheRead`、`cacheWrite`、`totalTokens`）进入结构化用量分支，与长键并列，使 Pi JSON 事件流的累计用量可直接合流。

## Alternatives considered

- 维持现状：`janus`/`pi` 继续使用 preset 估算窗口。该选项零成本，但模型行与用量行永久失真，用户无法判断真实上下文压力，否决。
- 为 `janus`/`pi` 建设 hook 事件管线。该选项信号最权威，但两个 CLI 都没有 hook 注入面，`janus tui` 与 `pi` 交互态也不输出机器事件；强行做需要改 CLI 本体或长期驻留文本嗅探，成本远超历史加 PTY 的组合精度，否决。
- 启动时传入稳定的 `--conversation`/`--session` 使会话 id 与终端 id 对齐。该选项能让 `janus` 也获得精确绑定，但改变启动命令会影响 CLI 自身的会话恢复语义，需要单独验证，延期到后续任务，不在本次范围。

## Consequences

`janus` 终端在有配置时启动即显示声明模型，运行中底部栏用量进入累计输入输出，上下文窗口经模型注册表或 preset 估算解析。`pi` 终端在绑定会话后显示权威的历史用量、最新模型与精确压缩计数，未绑定时显示声明模型。`janus` 历史文件不存用量是硬限制：其当前上下文 token 仍不可知，累计用量完全依赖 PTY 底部栏文本；`janus` 未配置模型且无历史文件时仍返回空。`pi` 的当前上下文取活跃路径用量之和，是对真实上下文的近似而非服务端口径，压缩后旧分支不计入。新增单测覆盖横幅模型、底部栏用量、短键用量 JSON、`janus` 配置与会话文件、`pi` 全局加项目声明合并、活跃路径累加与分支排除、跨工作区拒绝。
