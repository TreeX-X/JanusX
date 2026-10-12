---
{
  "schema": "harness-note/2",
  "id": "3a976752-d637-40c7-9fa3-bce52ac5dc15",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-25",
  "class": "bug-fix",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/1a6947ed-0b47-4d33-aa9a-21d37be1db07"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b"}
  ],
  "updated": "2026-10-11T14:38:02Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/0cb931e1-e33c-4e38-a9d9-9d652796d935"
}
---

# Opencode continue uses native session resume on internal rows

## Problem

内部 Opencode 的“在新会话中继续”曾打开新提供方会话并发送交接文本。最初固定延迟会在慢 TUI 上丢失输入，后续虽增加原生恢复辅助函数，主进程仍在显式 mode: continue 时绕过它，按钮没有加载已有历史。

## Decision

Claude、Codex、Opencode 现在共享 `buildContinueResumeArgs` 与 `spawnResumeTerminal`。Opencode 同引擎、已有提供方 ID 的 Continue 和显式 Resume 都执行 `opencode --session <id>`。卡片和详情对内部、外部及归档记录提供 Resume。缺少 ID 的 Continue 说明并保留交接，显式 Resume 报错。恢复不注入首条 prompt。

`session-recovery.ts` 启动前验证原 cwd 和活动数据库路径，支持 XDG_DATA_HOME。`probeOpencodeSessionPresence` 返回 present、absent、unknown，仅 present 允许恢复；不存在或无法读证均拒绝，避免把空会话当成恢复成功。新记录保留身份与转录来源，复制显示历史并移除旧检查点关联，后续回合通过 plugin Hook 跟踪。通用语义、Orca 参考与验证归 [转录详情与原生恢复](session-resume-detail.md)。

## Alternatives considered

继续调整输入延迟或改为启动 prompt 参数只能交接上下文，无法还原提供方历史。只修改白名单不能修复主进程绕过辅助函数的分支。因此选择统一恢复入口，原生 Fork 和其他终端后续处理。

## Consequences

按钮和主进程现在选择同一恢复规则，数据库锁定或不可读时要求稍后重试。交接仍不证明提供方接受输入，恢复不依赖交接。账户、CLI 版本和服务可用性由外部环境决定。

2026-10-11 的相关单元测试与 Electron IPC/PTY 模拟 CLI 演练已覆盖 Opencode 精确 session 参数、活动 sqlite 历史、无 prompt 注入及恢复后回合。实际按钮演练结果统一记录在恢复 Note；没有执行真实模型调用。
