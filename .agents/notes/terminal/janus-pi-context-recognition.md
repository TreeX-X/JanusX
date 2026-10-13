---
{
  "schema": "harness-note/2",
  "id": "e34329c5-dbea-5a5e-869c-e7263aa95663",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-11",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-11-agent-note-janus-pi--e34329c5.md",
      "sourceHash": "f17eca650cb3bf29943cab876e62a02b369a8ce750bff87f7ebba1736d7f0b50",
      "originalBodyHash": "fd2af958eb45e6d1e0af441e320947845dbe24eb598ada7aeb647017bc6ff166",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Janus/Pi 上下文识别. No age-based archival.",
      "edits": [
        "Rebased Markdown destination: ./2026-09-13-janus-pi-hook-management.md -> ./2026-09-13-janus-pi-hook-management--a8a80c8f.md",
        "Removed redundant Agent Note title prefix",
        "Removed lifecycle duplicated by frontmatter"
      ],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-11-janus-pi-context-recognition.md",
        "sourceHash": "9273e424b99749e462d1f2ecac701ce04c894678a200052d9a81e40b605a298d",
        "originalBodyHash": "1d82e3b96989fe5f736a825244157f611d96a2282cd66c789b0edf9be0e1e781"
      }
    }
  },
  "updated": "2026-10-13T02:25:17.000Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Janus/Pi 上下文识别


## Problem

JanusX 可以启动 `janus` 与 `pi` 终端，但上下文识别只覆盖 `claude`、`codex`、`opencode` 三个引擎。`getRuntimeTelemetrySnapshot` 对 `janus`/`pi` 直接返回空，PTY 文本解析器不认识两者的输出形状，启动声明模型也没有读取入口。结果是 `janus`/`pi` 终端的上下文行永远停留在按 preset 硬编码的估算值上，模型切换不可见，会话用量不可见，压缩计数不可见。

## Decision

`janus` 与 `pi` 的运行数值统一由主进程读取原生会话源；配置声明用于启动模型，模型目录用于窗口容量。当前契约由[会话源单源化](./requirements/usage-telemetry-single-source.md)维护，取代原先历史加 PTY 的数值融合。

主进程历史扫描（`src/main/runtime-telemetry/history.ts`）保留“绑定会话读历史、无绑定读声明”语义。`janus` 的声明模型来自 `~/.janus/config.json` 的 provider 目录解析，会话存在性来自 `~/.janus/history/<conversationId>.jsonl` 的精确 id 匹配；该历史文件只存消息与工具轨迹而不存 usage，因此当前上下文与消耗保持未知，PTY footer 不再补齐数字。`pi` 的声明模型来自全局 `~/.pi/agent/settings.json` 与项目 `.pi/settings.json` 的合并。绑定后按 `id`/`parentId` 解析活跃叶路径的模型与压缩条目，当前上下文取该路径最新 assistant 请求的 input、cacheRead、cacheWrite 之和并标 estimated，不累加历次请求输入。跨工作区会话头继续拒绝。

Pi 消耗由 `history-usage.ts` 导入所有分支的有效消息 usage，身份为 entry.id 加 timestamp；在同一原生存储命名空间内去重后写入独立持久账本。放弃分支只改变当前上下文投影，已发生的消耗保留。渲染侧数值流解析已移除；状态 hook 仍由[Janus/Pi hook 管理](./janus-pi-hook-management.md)负责。

## Alternatives considered

- 维持现状：`janus`/`pi` 继续使用 preset 估算窗口。该选项零成本，但模型行与用量行永久失真，用户无法判断真实上下文压力，否决。
- 保留历史加 PTY 数值融合：能显示 Janus footer 数字，但继续承担文本误命中和双源合并成本；当前选择原生源，接受 Janus 缺数边界。状态 hook 的注入面已经补齐，仍走独立状态管线。
- 启动时传入稳定的 `--conversation`/`--session` 使会话 id 与终端 id 对齐。该选项能让 `janus` 也获得精确绑定，但改变启动命令会影响 CLI 自身的会话恢复语义，需要单独验证，延期到后续任务，不在本次范围。

## Consequences

`janus` 有配置时显示声明模型，窗口容量经模型目录或 preset 估算；当前占用与用量不能从历史还原，保持未知。`pi` 显示活跃路径最新模型、压缩计数及估算上下文，消费统计独立保留全部已导入请求。分支切换后上下文可以下降，消耗不会回吐。历史与账本测试覆盖配置合并、精确会话读取、跨工作区拒绝、活跃分支投影、放弃分支消耗与重放去重；仍需更多真实 CLI 版本样本验证格式兼容性。
