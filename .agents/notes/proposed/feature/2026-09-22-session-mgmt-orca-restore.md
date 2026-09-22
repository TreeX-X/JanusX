---
schema: harness-note/1
id: 3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b
kind: requirement
lifecycle: draft
created: 2026-09-22
class: feature
relations:
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/b3704d91-c17d-4492-ae71-a44cfec8bbd7
    reason: V1 session ledger owns identity and scoped checkpoints this requirement re-presents
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e782007f-d07b-4f60-be32-63d1b22ec1f8
    reason: Unified inline timeline plus modal diff is the layout this requirement retires from the right dock
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fffeff-4922-423d-9f15-0e27f69048d2
    reason: Pull-mode transcript backfill is the scanner this requirement extends into detail reading
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7
    reason: Turn-owned prompt plus excerpt fields seed the preview layer this requirement keeps
  - type: related-to
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22
    reason: Workspace session plus checkpoint requirement is the parent scope this requirement narrows to presentation and restore
---

# Agent Note: Orca-aligned session management with restore points and windowed reading

## Problem

JanusX renders the whole conversation inside the narrow right dock. Each expanded card stacks every turn with its bound checkpoint strip, file list, review box, and success banner, so a long session pushes the list off screen and forces timeline-versus-diff scroll fights. The ledger holds only turn snapshots plus excerpts, and full transcript prose stays unreachable from the panel even though the transcript path persists on every record. External rows share the same checkpoint chrome as internal rows, which implies restorable state where none exists. Orca solves the adjacent problem without inventing new storage: its Agent Session History scans each CLI's on-disk transcript store, shows a concise row per session, expands to first prompt plus recent turns, and resumes through the provider's own resume command. JanusX must borrow that presentation and scanner discipline while keeping its own restore-point model that Orca never built.

## Proposal

Land presentation and restore as one requirement in three progressive layers. L1 collapsed cards stay concise orca-style: engine icon with type name, truncated first prompt as title, status badge, and one mono line carrying turn count, checkpoint count, and recency. List rows keep only a short preview for search; the untruncated first prompt loads on expand. L2 inline preview expands inside the right dock and shows the full first prompt with Copy, session metadata (working directory, branch, model, message count), and the two most recent turns as question-plus-excerpt pairs with kind badges and timestamps. L2 never renders checkpoint file lists, review boxes, or diffs. A single 查看详情 action leaves the dock and opens the L3 reading window.

The L3 window owns full reading. It centers over the workbench under the shared traffic-bar title, carries session metadata plus transcript reference in its header, and scrolls the full turn list with per-turn prompts, excerpts, kind badges, and timestamps. Transcript prose resolves orca-style at open time: the renderer requests a bounded server read of the persisted transcript path, parses first prompt plus turn pairs with head-plus-tail fallback above 512KB, tolerates unknown shapes and corrupt lines per file, and never blocks turn recording or card listing on parse failure. Registry turns stay authoritative for ordering and status; transcript text supplies only display prose, and cached excerpts render instantly while the full parse streams in.

Restore points exist only for software-internal sessions. Every mutating internal turn binds exactly one checkpoint through the existing session plus turn linkage; pure question turns without file changes bind an empty checkpoint record so the timeline stays aligned and renders a dashed no-change strip. External sessions carry no checkpoint binding, show an explicit 外部会话 · 无还原点 marker in L1 through L3, and expose transcript actions only (Copy prompt, Copy log path, Open log, Open cwd). Internal turns render a one-line checkpoint summary (index, file count, aggregated additions plus deletions, kind badge, timestamp) with 查看 diff and 恢复 actions; diff expands inline inside the L3 window as a file list plus code pane with binary and oversized rows labelled and unexpanded, and restore keeps the existing two-step review with prune warning, confirm, success, and conflict disclosure scoped to the owning session. Restoring one session must never prune checkpoints of another session.

Continue behavior splits by origin. Internal sessions continue through the existing Continue in New Session focused handoff in the original working directory with original shell and preset. External sessions resume through the provider resume command in a fresh terminal at the recorded working directory (for example `claude --resume <id>` or `codex resume <id>`), re-exporting recorded environment such as `CODEX_HOME` where present; rows whose resume prerequisites are missing disable Resume with the reason stated and keep Copy resume command available.

## Alternatives considered

- Keep the v5 unified inline timeline and add paging — strongest case is zero new surfaces while long sessions shrink page by page. The driver that rules it out is geometry: every page still competes with the dock column for scroll, and full reading never gains a comfortable width.
- Render L3 as a second right-dock column instead of a window — strongest case is no overlay plumbing with dock state reuse. The driver that rules it out is the reported symptom: two narrow columns side by side preserve the readability problem the window removes.
- Open diff in a separate Electron window stacked above L3 — strongest case is a true editor-grade surface isolated from conversation scroll. The driver that rules it out is plumbing plus focus cost: a second window needs registration, navigation, and focus handling, while an inline diff section inside L3 keeps one reading context with per-file focus.
- Bind checkpoints to external sessions through on-open snapshots — strongest case is uniform restore chrome across all rows. The driver that rules it out is ownership: snapshots of a foreign working directory invent state the provider never asked for and risk washing user files outside JanusX task scope.
- Store full transcript text per turn in the registry — strongest case is lossless history with no file IO at read time. The driver that rules it out is storage: unbounded per-turn copies duplicate the provider store the transcript path already references.
- Do nothing / reuse the v5 dock timeline — no churn. The cost is persistent dock铺开 on long sessions, unreachable full prose, and checkpoint chrome implying restore on external rows.

## Acceptance criteria

- [ ] AC-1: L1 cards show engine icon, truncated first prompt, external marker where applicable, and expand affordance only.
- [ ] AC-2: L2 preview shows engine, status, counts, recency, the full first prompt with Copy, working directory, branch, model, message count, and the two most recent turns with kind badges.
- [ ] AC-3: L3 window opens from 查看详情, centers under the traffic bar, and scrolls full turns with prompts, excerpts, badges, and transcript reference.
- [ ] AC-4: L3 prose resolves from a bounded transcript read with head-plus-tail fallback, corrupt-line tolerance, and excerpt-first instant render.
- [ ] AC-5: Internal mutating turns bind one checkpoint each; pure question turns render a dashed no-change strip preserving alignment.
- [ ] AC-6: External sessions show no checkpoint chrome in any layer and expose transcript actions only.
- [ ] AC-7: Internal L3 turns expose inline diff with file list plus code pane, binary and oversized rows labelled unexpanded, and session-scoped two-step restore with prune warning and conflict disclosure.
- [ ] AC-8: Internal Continue uses focused handoff; external Resume runs the provider resume command with missing-prerequisite disable plus Copy command fallback.

## Risks

- Transcript schema drift across CLI versions breaks full prose parsing; mitigation is the excerpt-first fallback plus per-engine parsers isolated in the scanner module.
- Large transcripts regress window open time; mitigation is the 512KB bounded read with head-plus-tail windows and lazy per-turn fill.
- Windows path casing plus synonym paths misattribute external rows to workspaces; mitigation is the single normalizing cwd resolver already owned by the registry.
- Restoring from L3 while the live conversation appends turns races the prune count; mitigation is recompute-on-confirm with the review box as the single confirm site.
- Cross-session prune regression returns if restore drops the session scope parameter; mitigation is session-scoped restore IPC with legacy terminal fallback covered by unit checks.
