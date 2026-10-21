---
{
  "schema": "harness-note/2",
  "id": "3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b",
  "kind": "requirement",
  "lifecycle": "draft",
  "created": "2026-09-22",
  "class": "feature",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/b3704d91-c17d-4492-ae71-a44cfec8bbd7"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/e782007f-d07b-4f60-be32-63d1b22ec1f8"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/7cc69d43-fa82-4b5e-9ac1-fe32fa4f0d5f"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/99a80260-0bb2-48a2-99ae-71275e2cb100"}
  ],
  "extensions": {
    "r5Migration": {
      "sourceHash": "c7bc9d083a19ff84d5d9e9d9709013b4b6b1e4a2cd2d437953d4f499fbe9866a",
      "repairs": [
        "relations[0].reason",
        "relations[1].reason",
        "relations[2].reason",
        "relations[3].reason",
        "relations[4].reason"
      ],
      "originalRelations": [
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b3704d91-c17d-4492-ae71-a44cfec8bbd7",
          "reason": "V1 session ledger owns identity and scoped checkpoints this requirement re-presents"
        },
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/e782007f-d07b-4f60-be32-63d1b22ec1f8",
          "reason": "Unified inline timeline plus modal diff is the layout this requirement retires from the right dock"
        },
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2",
          "reason": "Pull-mode transcript backfill is the scanner this requirement extends into detail reading"
        },
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7",
          "reason": "Turn-owned prompt plus excerpt fields seed the preview layer this requirement keeps"
        },
        {
          "type": "related-to",
          "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22",
          "reason": "Workspace session plus checkpoint requirement is the parent scope this requirement narrows to presentation and restore"
        }
      ]
    },
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-22-agent-note-orca-aligned-session-management-with-restore-points-and-windo--3e9ec8d6.md",
      "sourceHash": "1b420af1667bc3dc8db091d8aafc07b77e3c9e0f25c1faee2a0b6d66ffff7e20",
      "originalBodyHash": "69806e70a43113f48db3ef49e3d00a3bc50a91b2cecc9e49c7956d1e7a5789c3",
      "category": "formal",
      "reason": "Retains the source requirement in draft lifecycle; body documents Orca-aligned session management with restore points and windowed reading. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/proposed/feature/2026-09-22-session-mgmt-orca-restore.md",
        "sourceHash": "1b420af1667bc3dc8db091d8aafc07b77e3c9e0f25c1faee2a0b6d66ffff7e20",
        "originalBodyHash": "69806e70a43113f48db3ef49e3d00a3bc50a91b2cecc9e49c7956d1e7a5789c3"
      }
    }
  },
  "updated": "2026-10-21T15:37:53.642Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662"
}
---

# Orca-aligned session management with restore points and windowed reading

## Expected behavior

JanusX renders the whole conversation inside the narrow right dock. Each expanded card stacks every turn with its bound checkpoint strip, file list, review box, and success banner, so a long session pushes the list off screen and forces timeline-versus-diff scroll fights. The ledger holds only turn snapshots plus excerpts, and full transcript prose stays unreachable from the panel even though the transcript path persists on every record. External rows share the same checkpoint chrome as internal rows, which implies restorable state where none exists. Orca solves the adjacent problem without inventing new storage: its Agent Session History scans each CLI's on-disk transcript store, shows a concise row per session, expands to first prompt plus recent turns, and resumes through the provider's own resume command. JanusX must borrow that presentation and scanner discipline while keeping its own restore-point model that Orca never built.

Scope split: the L1/L2/L3 layering below owns presentation and windowed reading; transcript prose truth (what the input and answer sides actually display) is carried by [会话内容真值](./session-content-truth.md), and restore mechanics (capture timing, reversible restore, conflict semantics) are carried by [还原点可靠性](./restore-point-reliability.md). The restore-point model itself stays JanusX-owned as stated above.

## Proposal

Land presentation and restore as one requirement in three progressive layers. L1 collapsed cards stay concise orca-style with three summary rows: engine icon with type name, truncated first prompt as title, external marker where applicable, and status badge in the header; a muted single-line preview of first prompt for quick scanning; and one mono meta line carrying turn count, checkpoint count, and recency. L2 inline preview expands inside the right dock and shows the capped first prompt with Copy behind the display cap plus an explicit expand-to-full affordance, session metadata (working directory, branch, model, message count), and the two most recent turns as question-plus-excerpt pairs with kind badges and timestamps (without duplicating L1 status or count meta lines). L2 never renders checkpoint file lists, review boxes, or diffs. A single 查看详情 action leaves the dock and opens the L3 reading window.

The L3 window owns full reading. It centers over the workbench under the shared traffic-bar title, carries session metadata plus transcript reference in its header, and scrolls the full turn list with per-turn prompts, excerpts, kind badges, and timestamps. Transcript prose resolves orca-style at open time: the renderer requests a bounded server read of the persisted transcript path, parses first prompt plus turn pairs with head-plus-tail fallback above 512KB, tolerates unknown shapes and corrupt lines per file, and never blocks turn recording or card listing on parse failure. Registry turns stay authoritative for ordering and status; transcript text supplies only display prose, and cached excerpts render instantly while the full parse streams in.

Restore points exist only for software-internal sessions. Every mutating internal turn binds exactly one checkpoint through the existing session plus turn linkage; pure question turns without file changes bind an empty checkpoint record so the timeline stays aligned and renders a dashed no-change strip. External sessions carry no checkpoint binding, show an explicit 外部会话 · 无还原点 marker in L1 through L3, and expose transcript actions only (Copy prompt, Copy log path, Open log, Open cwd). Internal turns render a one-line checkpoint summary (index, file count, aggregated additions plus deletions, kind badge, timestamp) with 查看 diff and 恢复 actions; diff expands inline inside the L3 window as a file list plus code pane with binary and oversized rows labelled and unexpanded, and restore keeps the existing two-step review with prune warning, confirm, success, and conflict disclosure scoped to the owning session. Restoring one session must never prune checkpoints of another session.

2026-10-11 用户明确将 Claude、Codex、Opencode 的会话管理和恢复优先统一，其他终端后续处理。三引擎内部与外部记录不再按来源区分 Continue：同引擎且有提供方 ID 时在新终端恢复原生历史，不注入首条 prompt；无 ID 或切换引擎才交接。显式 Resume 拒绝身份缺失、历史失效及引擎切换。原 cwd、配置来源、历史及 Hook 先校验；归档的原生历史仍存在时可以恢复，旧检查点不继承。当前事实与验证归 [转录详情与原生恢复](../records/session-resume-detail.md)。

## Alternatives considered

- Keep the v5 unified inline timeline and add paging — strongest case is zero new surfaces while long sessions shrink page by page. The driver that rules it out is geometry: every page still competes with the dock column for scroll, and full reading never gains a comfortable width.
- Render L3 as a second right-dock column instead of a window — strongest case is no overlay plumbing with dock state reuse. The driver that rules it out is the reported symptom: two narrow columns side by side preserve the readability problem the window removes.
- Open diff in a separate Electron window stacked above L3 — strongest case is a true editor-grade surface isolated from conversation scroll. The driver that rules it out is plumbing plus focus cost: a second window needs registration, navigation, and focus handling, while an inline diff section inside L3 keeps one reading context with per-file focus.
- Bind checkpoints to external sessions through on-open snapshots — strongest case is uniform restore chrome across all rows. The driver that rules it out is ownership: snapshots of a foreign working directory invent state the provider never asked for and risk washing user files outside JanusX task scope.
- Store full transcript text per turn in the registry — strongest case is lossless history with no file IO at read time. The driver that rules it out is storage: unbounded per-turn copies duplicate the provider store the transcript path already references.
- Do nothing / reuse the v5 dock timeline — no churn. The cost is persistent dock铺开 on long sessions, unreachable full prose, and checkpoint chrome implying restore on external rows.

## Acceptance criteria

- [ ] AC-1: L1 cards show engine icon with type name, truncated first prompt as title, short preview line, status badge, mono line carrying turn count, checkpoint count, and recency, external marker where applicable, and expand affordance.
- [ ] AC-2: L2 preview shows capped first prompt with expand-to-full affordance and Copy, session metadata (working directory, branch, model, message count), and the two most recent turns with kind badges, without duplicating L1 status or count meta lines.
- [ ] AC-3: L3 window opens from 查看详情, centers under the traffic bar, and scrolls full turns with prompts, excerpts, badges, and transcript reference.
- [ ] AC-4: L3 prose resolves from a bounded transcript read with head-plus-tail fallback, corrupt-line tolerance, and excerpt-first instant render.
- [ ] AC-5: Internal mutating turns bind one checkpoint each; pure question turns render a dashed no-change strip preserving alignment.
- [ ] AC-6: External sessions show no checkpoint chrome in any layer and expose transcript actions only.
- [ ] AC-7: Internal L3 turns expose inline diff with file list plus code pane, binary and oversized rows labelled unexpanded, and session-scoped two-step restore with prune warning and conflict disclosure.
- [x] AC-8: Claude/Codex/Opencode same-engine Continue and Resume restore native history for internal/external rows without prompt injection. Missing ID disables Resume; unavailable history or engine changes on explicit Resume reject. Continue without ID retains an explained handoff, and Copy command remains available with a native identity.
- [x] AC-9: The card fold control renders borderless: no hairline frame on the chevron button, with hover/focus affordance and the 240ms rotation motion preserved.
- [ ] AC-10: The L2 first-prompt block caps its display (line or character budget with surrogate-safe truncation) and offers an explicit expand-to-full affordance; unbounded first prompts never push the card open.

AC-8 保留编号并按用户确认的三引擎范围修订；原“内部均交接”验收属于此前行为。执行侧由 `tests/e2e/desktop-session-continue.spec.ts` 的真实 IPC/PTY、模拟 CLI 演练覆盖（该演练对应 `workspace-session-checkpoint-continue.md` 的 AC-4 演练，不覆盖本需求 AC-4 的 L3 转录读取）；缺少 ID、Copy 参数及归档入口判断由 session-continue-resume 单测覆盖，历史与配置来源由 session-recovery 单测覆盖。具体运行结果归恢复 Note，不代表真实账户模型调用已验证。AC-9 仍由 planche-theme 的无边框钉选覆盖。AC-1 与 AC-2 按 [Session card L1 carries the v6 summary rows](../../workbench/session-card-surface.md) 架构决策明确层级边界：L1 拥有引擎、状态、计数与新鲜度；L2 承载目录分支、受截断首 prompt 与最近轮次，与 AC-10 截断预算（四行 clamp、160 字符预算及展开入口已实现，Copy 始终复制全文）保持一致；本需求 AC-4（L3 prose 解析与容错）仍待独立验证，本文件 AC-4 保持未勾选，其余验收状态本轮不变。

## Risks

- Transcript schema drift across CLI versions breaks full prose parsing; mitigation is the excerpt-first fallback plus per-engine parsers isolated in the scanner module.
- Large transcripts regress window open time; mitigation is the 512KB bounded read with head-plus-tail windows and lazy per-turn fill.
- Windows path casing plus synonym paths misattribute external rows to workspaces; mitigation is the single normalizing cwd resolver already owned by the registry.
- Restoring from L3 while the live conversation appends turns races the prune count; mitigation is recompute-on-confirm with the review box as the single confirm site.
- Cross-session prune regression returns if restore drops the session scope parameter; mitigation is session-scoped restore IPC with legacy terminal fallback covered by unit checks.
- The fold-control border is pinned by `tests/unit/planche-theme.test.ts` (`.foldBtn` plus accent-border literals), so the borderless revision must update that pin in the same change.
