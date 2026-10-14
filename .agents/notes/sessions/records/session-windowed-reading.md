---
{
  "schema": "harness-note/2",
  "id": "e968d1ae-593c-4a7e-b2a0-aba9fcb12f82",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-22",
  "class": "feature",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/e782007f-d07b-4f60-be32-63d1b22ec1f8"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7"}
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "a12ae1c493684dcda245733b5873d3af12e9d519117bf7370111dd329f8e574d",
      "repairs": ["relations[0].reason","relations[1].reason","relations[2].reason","relations[3].reason"],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b",
          "reason": "Orca-aligned three-layer requirement lands here as its first renderer slice"
        },
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e782007f-d07b-4f60-be32-63d1b22ec1f8",
          "reason": "Unified inline timeline plus modal diff is the dock layout this slice retires"
        },
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2",
          "reason": "Pull-mode transcript backfill supplies the external rows this slice presents read-only"
        },
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7",
          "reason": "Turn-owned prompt plus excerpt fields seed the preview and window prose"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-22-agent-note-windowed-session-reading-with-orca-aligned-preview-layers--e968d1ae.md",
      "sourceHash": "a852bfd5c8e806c1fc949e48514f86d82138792730c6be6ff88b72e769d3724b",
      "originalBodyHash": "2e905068650035aa8012b0d864ecab4cf09e053272712a881661fef79c948dce",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents Windowed session reading with orca-aligned preview layers. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-22-session-windowed-reading.md",
        "sourceHash": "a852bfd5c8e806c1fc949e48514f86d82138792730c6be6ff88b72e769d3724b",
        "originalBodyHash": "2e905068650035aa8012b0d864ecab4cf09e053272712a881661fef79c948dce"
      }
    }
  },
  "updated": "2026-10-14T14:27:41.271Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/0cb931e1-e33c-4e38-a9d9-9d652796d935"
}
---

# Windowed session reading with orca-aligned preview layers

## Problem

会话管理同时承载对话阅读和文件还原，使详情窗需要维护检查点列表、逐点文件记录、diff、裁剪提示、冲突和恢复状态。用户已要求移除会话管理中与还原点相关的功能，保留会话阅读与续接。

## Decision

卡片保留引擎、状态、首条提示、轮次计数和新鲜度；展开后提供目录分支、可展开的首条提示、最近两轮预览和操作入口。还原点计数与“外部会话无还原点”标记移除，通用展开文案归入 agentSession。

详情窗保留居中阅读布局、轮次导航、滚动定位、问题与回答、时间和状态，以及提示、日志路径、会话 ID、续接命令的复制操作。内部、外部和归档会话均从会话账本与有界转录读取内容，不再加载检查点列表、变更文件或 diff，不再显示恢复确认、成功、裁剪、冲突或孤立还原点。问题只从回合快照与转录合并结果读取。

原生 Resume 与 Continue 的引擎能力、身份校验和执行逻辑保持现有规则。底层快照服务仍被终端和知识模块使用，保留 IPC、存储和历史关联；本次不清空用户数据。

## Alternatives considered

只隐藏恢复按钮仍会保留文件、diff 与检查点请求，无法完成会话管理的功能收缩。彻底删除底层快照服务会同时影响终端和知识证据，超出本次界面范围。选择从会话界面删除完整调用链，服务独立保留。

## Consequences

会话阅读不再等待快照数据，详情窗只维护对话相关状态。仅存在于旧检查点中的 prompt 不再作为显示回退；已保存的回合 prompt 和转录不受影响。如需全局下线快照，应另行梳理终端、知识来源和历史数据策略。

验证：`npm run typecheck`、`npm run build:app`、组件 eslint、`npm run i18n:check` 和 `npm run check:notes` 均通过；Note 校验保留 17 项已有外部链接诊断。七个相关单测文件共 80/80 通过，覆盖转录合并、续接参数、原生恢复、会话注册、外部扫描、工作树状态与主题。`npx playwright test tests/e2e/desktop-session-continue.spec.ts --project=desktop --workers=1` 在设置 `NO_PROXY=localhost,127.0.0.1,::1`、`JANUS_E2E_PORT=41739` 后 2/2 通过，覆盖交接与三个引擎续接，且检查卡片、详情窗无还原点文案及恢复按钮。使用模拟 CLI，不代表真实账户调用验证。严格未使用检查仍被其他路径的四项 TS6133 阻挡：TerminalArea 的 QuickNote、TerminalManagerPanel 的 useEffect/load、workspace store 的 getBrowserPaneContent；SessionPanel 无报错。
