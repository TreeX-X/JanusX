---
{
  "schema": "harness-note/2",
  "id": "1a6947ed-0b47-4d33-aa9a-21d37be1db07",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-22",
  "class": "feature",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/e968d1ae-593c-4a7e-b2a0-aba9fcb12f82"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2"}
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "0d2ef1207332c3c664232837f165778efd9ba315b9b3df14606a0ef9404c029d",
      "repairs": ["relations[0].reason","relations[1].reason","relations[2].reason"],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b",
          "reason": "Orca-aligned three-layer requirement closes its remaining main-side clauses here"
        },
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e968d1ae-593c-4a7e-b2a0-aba9fcb12f82",
          "reason": "Windowed renderer slice owns the detail surface this slice feeds with prose and resume"
        },
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2",
          "reason": "Pull-mode transcript backfill lends the bounded parsers this slice reuses for detail reads"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-22-agent-note-transcript-detail-reads-plus-provider-resume-runs--1a6947ed.md",
      "sourceHash": "14faf6ccdb49fb925c8828ae482bbe11cd81de77024e10e39b22ce138da90167",
      "originalBodyHash": "328a3e334641b8454743d2ed0ffaf73ae288132022a50a50fed842dc5f0a7103",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Transcript detail reads plus provider resume runs. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-22-session-resume-detail.md",
        "sourceHash": "14faf6ccdb49fb925c8828ae482bbe11cd81de77024e10e39b22ce138da90167",
        "originalBodyHash": "328a3e334641b8454743d2ed0ffaf73ae288132022a50a50fed842dc5f0a7103"
      }
    }
  },
  "updated": "2026-10-11T14:45:04Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/0cb931e1-e33c-4e38-a9d9-9d652796d935"
}
---

# Transcript detail reads plus provider resume runs

## Problem

用户报告 Claude 的“在新会话中继续”可以恢复，而 Codex 只打开终端并填入首条 prompt。源码确认旧路径没有执行 Codex 原生恢复，Opencode 的显式 Continue 也绕过恢复辅助函数。此次先记录问题，再按用户确认的范围修复 Claude、Codex、Opencode。

| 实际问题 | 修复行为 |
| --- | --- |
| Codex 不在 Continue 恢复白名单 | 三引擎同引擎 Continue 共享恢复判断 |
| 主进程在显式 Continue 时绕过 Opencode | 删除绕过守卫，符合条件即原生恢复 |
| 内部记录缺少独立 Resume 入口，提示仅针对 Claude | 卡片和详情都有 Resume，三引擎提示统一 |
| 显式 Resume 缺少身份时可能落入交接 | 报错，不创建空恢复终端 |
| 原历史、cwd 与配置来源未验证 | 启动前校验目录、精确身份及活动存储 |
| 新恢复记录缺少已有显示历史 | 继承 prompt、回合与计数，移除旧检查点关联 |
| Codex 摘要忽略精确转录路径 | 优先记录路径，其次按提供方 ID 匹配配置存储 |
| 交接记录借用外部原会话身份 | 新会话等待新 Hook 身份，不借用旧 ID/路径 |
| Hook 补上 ID 后确认弹窗仍显示旧交接提示 | 弹窗跟随最新记录，防止文案与主进程分流不一致 |

交接的 delivered 只表示观察到输入就绪并向 PTY 写入文本和 Enter，不证明提供方接受了 prompt。用户报告的输入框现象与旧交接路径一致，其精确提交故障没有在真实 Codex 会话中复现。此次原生恢复移除了这条路径的首条 prompt 注入。

## Decision

`src/shared/ipc/session.ts` 的恢复参数同时供 Copy、前端判断及主进程使用。Claude 使用 `--resume <id>`，Codex 使用 `resume <id>`，Opencode 使用 `--session <id>`。同引擎、已有提供方 ID 的 Continue 和显式 Resume 都在新终端继续同一个提供方对话，不自动发送首条 prompt 或交接。无 ID 的 Continue 明确说明并保留交接；切换引擎也属于交接。显式 Resume 拒绝引擎切换或缺少身份。

三引擎内部和外部记录在卡片、详情窗口都有“回到原会话”。JanusX 归档影响检查点和列表状态，原 cwd 和提供方历史仍存在时，归档记录也能恢复。缺少 ID 时按钮禁用，历史在点击时校验，失效会显示错误。

`src/main/sessions/session-recovery.ts` 在建立新记录和 PTY 前校验 cwd。Claude/Codex 优先使用记录路径；无路径时只按精确 ID 搜索配置存储，最多遍历 10,000 项，不按目录或时间借用其他对话。文件必须存在、非空、可读、文件名匹配 ID 且位于原生存储布局。Codex 支持 sessions 和 archived_sessions。Claude 从 projects 祖先定位 CLAUDE_CONFIG_DIR；Codex 从 sessions/archived_sessions 定位原 CODEX_HOME。Hook 安装在选定配置目录，缓存按配置路径区分。Opencode 校验记录数据库等于活动存储（支持 XDG_DATA_HOME），要求 sqlite 精确 ID 探测为 present；absent/unknown 都报错，不悄悄打开新对话。

新终端使用原 cwd、对应 preset 和原 shell；外部记录缺少 shell 时用默认 shell，缺少 workspace 时用当前工作区。新 ledger 保留提供方 ID、转录路径和 continuedFrom，复制有限显示历史并为回合生成新 ID，不共享旧检查点。后续回合仍由 Hook 和 submit-line 跟踪。Hook 设置失败或创建失败释放绑定并归档失败记录；缺少历史的前置失败不会创建记录。

`transcript-reader.ts` 保持有界正文读取：最多 100 对，每侧最多 200,000 字符，源文件另有窗口。详情按 registry session ID 读取记录路径，不接受前端任意路径；Opencode 按 sqlite 提供方 ID 读取。Codex 摘要优先精确路径，随后按 threadId/providerSessionId 匹配配置存储；仅没有身份时保留旧 cwd 回退。正文窗口规则归 [会话内容真值](../requirements/session-content-truth.md)。

## Alternatives considered

统一重放首条 prompt 无法加载提供方历史，修改恢复白名单也不能修复主进程绕过分支。原生 Fork 能创建独立对话，但与用户要求的当前 Claude 恢复语义不同。因此三引擎统一原生 Resume，保留无身份和跨引擎的显式交接，并在建立终端前验证历史来源。

## Consequences

恢复同一对话、创建原生分支、交接新会话是三种操作。此次实现前者，原生 Fork、Pi、Janus CLI、DSH 及应用冷启动自动恢复仍待后续，矩阵归 [引擎能力](session-engine-capabilities.md)。恢复对话不会恢复仓库文件或旧检查点；同一对话可被多个终端打开，并发写入语义由 CLI 决定。

相比重放首条 prompt，原生恢复能加载已有上下文；相比只改白名单，统一主进程分流、前端入口与前置校验能避免按钮仍走错路径。严格校验会在不可读/锁定的 Opencode 数据库上要求稍后重试。JSONL 校验定位、权限和文件身份，不完整验证文件内容；CLI 版本、账户认证、服务可用性及外部 shell 的全部环境没有逐会话保存。历史迁移后记录路径失效会报错，不自动替换来源。

参考 [Orca 恢复命令](https://github.com/stablyai/orca/blob/08b65edc5c7d2fb07a00c9f22777344e5e365044/src/shared/ai-vault-resume-command.ts#L204) 与 [Codex 来源处理](https://github.com/stablyai/orca/blob/08b65edc5c7d2fb07a00c9f22777344e5e365044/src/main/codex/codex-session-resume-home.ts#L18)：恢复绑定提供方 ID，并定位历史所属配置来源。

## 验证

2026-10-11：11 个相关单元套件 121/121 通过，覆盖 session-continue-resume、session-recovery、agent-session-registry、agent-hook-config、transcript-excerpt、continue-handoff、handoff-delivery、agent-engine-capabilities、transcript-reader、external-session-scanner、opencode-sessions。`npm run build`、`npm run i18n:check` 通过，源文件 ESLint 无错误。

`npx playwright test tests/e2e/desktop-session-continue.spec.ts --project=desktop --workers=1` 的两个桌面演练均通过。演练使用最终构建的 Electron、真实 IPC/PTY 和本地模拟 CLI，逐一点击三引擎卡片 Continue 和详情 Resume，确认精确 argv、选定配置存储、已有正文、无自动 prompt、Hook 后续回合及源 ledger 不追加；并验证缺失 ID/历史、跨引擎 Resume 与 Hook 配置失败的拒绝和无活动幽灵卡片。旧无 ID 交接及外部 Claude 恢复也通过。本机演练让 loopback 直连并使用独立 JANUS_E2E_PORT。没有调用真实模型或验证真实账户的提供方恢复。

`npm run check:notes` 验证 292 个 harness Notes、0 错误，保留 17 个既有外链诊断；本轮路径的 `git diff --check` 通过。全仓差异仍有本轮未改动的 JanusIsland.tsx 既有尾空格。`codex features list` 只读检查显示本机 hooks 为 stable/true；这不是模型会话验证。

全仓 `npm run typecheck` 被 `src/main/blueprint/note-mcp-server.ts:48` 的既有 expectedHash 类型不匹配阻塞；该路径不属于本轮修改，未改动。此前分析阶段 26/26 测试记录了旧行为，不能作修复证明。
