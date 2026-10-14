---
{
  "schema": "harness-note/2",
  "id": "18fffeff-4922-423d-9f15-0e27f69048d2",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-22",
  "class": "feature",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/e29da5b4-dc65-40a9-883d-9026e3b280b1"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/b3704d91-c17d-4492-ae71-a44cfec8bbd7"}
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "5e5575ebcff31bd9063c9006337de34c020ae48c438245702724f06520c138d4",
      "repairs": ["relations[0].reason","relations[1].reason","relations[2].reason"],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e29da5b4-dc65-40a9-883d-9026e3b280b1",
          "reason": "The capability table owns the sessionStore resolvers this backfill walks"
        },
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7",
          "reason": "Turn prompt and excerpt fields give the imported timeline its readable Q/A pair"
        },
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b3704d91-c17d-4492-ae71-a44cfec8bbd7",
          "reason": "The session ledger owns identity and Continue handoff that external rows reuse read-only"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-22-agent-note-external-session-backfill-from-provider-transcript-stores--18fffeff.md",
      "sourceHash": "8a74de6f28666602bd8c61f5e42d976d74aa68fc30774614bf8a603a3624eab9",
      "originalBodyHash": "d75b6a69ea929b002351054701cdc5850a2a11fbe35159a6c512400c317a0574",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents External session backfill from provider transcript stores. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-22-external-session-backfill.md",
        "sourceHash": "8a74de6f28666602bd8c61f5e42d976d74aa68fc30774614bf8a603a3624eab9",
        "originalBodyHash": "d75b6a69ea929b002351054701cdc5850a2a11fbe35159a6c512400c317a0574"
      }
    }
  },
  "updated": "2026-10-14T15:45:43.560Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/0cb931e1-e33c-4e38-a9d9-9d652796d935"
}
---

# External session backfill from provider transcript stores

## Problem

外部 CLI 没有 JanusX 的终端 Hook。原实现只在启动和打开面板时扫描，正文详情只读取一次；文件变化既不触发新的扫描，也不刷新已打开的正文。Codex 大于 512KB 的文件只读取头部 16KB 和尾部 64KB，而本机近期 session_meta 记录约 22KB，头部整条记录丢失，尾部大量工具输出还会挤掉正文和 cwd，导致会话被跳过。

## Decision

[流式快照](../../../../src/main/sessions/transcript-snapshot.ts)逐条读取固定文件大小的 JSONL 快照，跨 64KB 数据块保留完整记录后再解码 UTF-8。识别元数据和对话正文，工具、推理与上下文注入不进入回合。Codex 源消息与旧式 event_msg 镜像分别聚合，有有效源消息时使用源侧，避免双计数。计数覆盖已读取的全部有效回合，详情只保留最近 100 回合，每段提问及聚合回答最多 200000 字符。单条记录最多 2MiB，超限跳到下一个换行并标记 truncated；该异常情况下计数也可能不完整。坏行容错，写入中的半条记录等下一次扫描补齐。内存不随工具历史总量增长。

扫描保留每引擎最近 200 个文件的发现范围。每个 registry 缓存文件路径、大小、mtime 与解析摘要，未变化的文件不重新读取；缓存随候选范围收缩清理。每次扫描仍向 registry 幂等导入，保证裁剪后的会话可以重新出现；无变化导入不触发持久化和事件。一次批次合并为一次写盘和一次通知，主进程复用进行中的扫描。

可见会话面板先显示缓存列表，120ms 后扫描；每次请求完成后等待 5 秒再次检查。窗口隐藏时暂停读取，focus 或恢复可见时立即检查。面板关闭后停止，清理时不再续排定时器，同一订阅不并发请求。未发生变化的文件只检查元数据；这不是对转录内容的追加游标。首次扫描与发生变化的文件仍完整流式遍历。

外部行按 engine 加 providerSessionId 去重，并保存最近两轮的有界预览。内部行保留 Hook 拥有的状态、终端和回合身份；扫描单独维护 transcriptTurnCount、transcriptPreview 和 transcriptUpdatedAt。列表显示 Hook 与转录计数较大者，卡片优先显示不早于账本的转录预览。过期转录不会覆盖较新的投影，外部会话增长不再依赖 Hook。内部恢复后的历史投影不改写 Hook 计数，避免后续完成事件重复累加历史。

详情窗在同一个 600ms 防抖事件上同时更新账本和转录正文，读取期间保留旧视图，失效请求不回写。转录中已有的回合对正文拥有完整权威：若最新问题尚未回答，不从旧种子回答补齐；仅转录范围以外的账本回合保留缓存正文。Codex 的回合结束摘要也复用流式快照；无身份时的 cwd 查找从真正的文件头逐块读取 session_meta，不再错误地读取文件尾。

## Alternatives considered

只扩大头尾字节窗口能临时容纳 22KB 元数据，但工具输出和长消息增长仍会丢失正文。完整 readFile 会保留整份工具历史，增加内存峰值。流式读取保留完整记录并限定正文工作集，首次读取仍付出顺序 IO 成本。

文件监听需要处理各提供方的目录递归、原子替换与事件风暴。当前选择面板可见时低频检查、未变文件复用解析，改善外部实时性且不引入后台常驻监控。若文件规模或扫描延迟显著上升，再评估按文件追加游标与目录监听。

## Consequences

外部变化在下一次可见扫描完成及事件防抖后进入列表、预览与已打开的详情。它不承诺逐 token 实时显示，外部行的运行状态仍不等同于终端进程状态。文件发现上限与 registry 的 200 条保留上限保持原有边界；本轮没有清除或改写提供方转录。

本机只读对比：同一批最近 200 个 Codex 文件，从原实现导入 94、跳过 106，改善到导入 199、跳过 1；首次约 2.8 秒，缓存后约 0.33 秒。这是当前机器的观测，不作为性能保证；运行使用无持久化接收器，未写入用户会话账本。

验证：`npm run typecheck`、`npm run build:app`、变更源码 eslint、`npm run i18n:check` 与 `npm run check:notes` 通过；Note 校验保留 17 条既有外部链接诊断。11 个相关单测文件 127/127 通过，新增测试先复现大文件丢失和未回答问题错误补入旧答案，再验证修复；覆盖解析缓存、重复扫描无事件、后台轮询生命周期、内部投影隔离和镜像去重。严格未使用检查仍有其他路径的四个 TS6133：TerminalArea 的 QuickNote、TerminalManagerPanel 的 useEffect/load，以及 workspace store 的 getBrowserPaneContent，本次路径没有报错。

桌面证据：`npx playwright test tests/e2e/desktop-session-continue.spec.ts --project=desktop --workers=1` 在 `NO_PROXY=localhost,127.0.0.1,::1`、`JANUS_E2E_PORT=41749` 下最终 3/3 通过。外部 Codex 用长元数据和大型工具输出模拟真实格式，详情窗保持打开，先追加无回答问题确认不串旧答案，再追加回答确认正文、卡片预览与计数自动更新；另两项覆盖单次任务交接和 Claude/Codex/Opencode 原生恢复。未调用真实账户模型。
