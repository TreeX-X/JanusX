---
{
  "schema": "harness-note/2",
  "id": "99a80260-0bb2-48a2-99ae-71275e2cb100",
  "kind": "requirement",
  "lifecycle": "draft",
  "created": "2026-10-10",
  "class": "feature",
  "tags": ["session","checkpoint"],
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/94f306fb-8a21-5ef6-ae2f-34eea7a35f1a"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/bfc7dcb4-f257-4931-ae82-11ec0fcc55e1"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/bb3ef36c-f74e-4589-98c7-601f8823d367"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/b363ad92-ed9e-4a63-808b-032e16283edd"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b"}
  ],
  "updated": "2026-10-10T06:34:42.722Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662"
}
---

# 还原点可靠性：捕获时机、身份稳定与可撤销恢复

**排期状态**：滞后。本需求记录已定设计供日后启动，实施排在[会话内容真值](./session-content-truth.md)验收之后，本期不动还原点代码。唯一的例外是会话身份稳定性（continue/resume 不重铸 sessionId），它属于会话管理本身，随会话内容真值切片先行落地，本需求直接受益。

语义依据：orca 没有文件级还原点——其 worktree checkpoints 只是自由文本状态注释；文件恢复模型是 JanusX 自有设计，保留但须遵守 orca 的两条纪律：状态与归属判定不依赖 pty 文本，绝不静默修改用户文件。产品定案的恢复语义是「改动文件恢复加自动备份」，捕获时机是「hook 回合边界为主」。

## Expected behavior

还原点在实际使用中不稳定，基本不可依赖。快照在按键启发式判定的 submit 时刻异步全树拍摄，与该回合的文件改动竞态，快照可能撕裂或包含本回合自身的改动，diff 为空、恢复到从未存在过的状态；回合结束从不建点，finalize 是 no-op，「回合后」状态永远不是还原点。`checkpointManager.initialize` 失败后永久静默，此后每次 submit 被静默丢弃，用户看到零还原点且无任何报错；粘贴、IME 与注入路径绕过 submit 追踪，回合直接丢失还原点。continue/resume/replace 重新铸造 sessionId，检查点历史碎片化，恢复的 session 作用域剪枝实际剪不掉，而界面用恢复前的列表虚构 prune 文案。恢复是破坏性整树覆写加删除清扫：没有预恢复备份，conflicts 恒为空数组，捕获时读失败的文件在恢复时被删除，blob GC 与创建竞态可致恢复中途抛错留下半恢复状态；活跃回合期间恢复不做任何防护。

## Proposal

捕获时机按 hook 回合边界重建：UserPromptSubmit hook 触发「回合前」点（同时取得 prompt 正文，解除对 submit 启发式的依赖），Stop 或 session.idle 成功完成后触发「回合后」点；submit 启发式仅保留为无 hook 引擎的兜底。baselineId 在回合开始固定，turnId 为绑定权威，回合结束不再从易变的 state 反读。conversationIndex 在快照完成后分配，消除并发重复；同一逻辑对话（continue/resume/replace）保持同一 sessionId。

恢复语义改为改动文件恢复：只回滚该还原点记录的变更文件，删除的文件补回、本回合新增的文件移除，不做全树清扫；恢复前自动创建 pre-restore 备份点，界面提供一键撤销；冲突真实检测——目标文件自检查点之后被用户或其他终端改动的逐个列出待确认，conflicts 不再恒空；活跃回合期间拒绝恢复；执行范围限定在会话与工作树内，路径消失时大声拒绝；恢复结果（实际剪枝清单、跳过文件）由后端返回，界面不再用恢复前列表虚构。引擎加固：blob GC 与在途创建互斥，捕获时读失败的文件标记 unreadable 而不是省略（恢复不删），checkpoint JSON 原子写，工作区键归一化，init 失败重试且失败在界面可见，retention 改 per-session 配额并发事件。

## Alternatives considered

- 整树回滚加安全网（预恢复备份、冲突检测、活跃回合禁恢复）— 最强理由是改动最小。排除原因：删除清扫仍会误删检查点之后出现的用户文件，安全网只能补救不能消除；产品定案选改动文件恢复。
- Git commit 或隐藏分支承载还原点 — 最强理由是可靠性最高。排除原因：改动面大，非 git 工作区需要整套退化方案，与现有 blob 快照引擎的迁移成本不成比例。
- 恢复改为「反向 patch 预览加应用」— 最强理由是用户可见每一步。排除原因：patch 编辑器的交互成本高，pre-restore 备份加逐文件确认已覆盖安全需求。
- 维持 submit 启发式只修竞态 — 最强理由是不动 hook 链路。排除原因：粘贴/IME 丢点与无回合后快照是结构性缺失，修不掉。
- 维持现状 — 零改动。成本即当前症状：还原点缺失、恢复不可信且不可撤销。

## Acceptance criteria

- [ ] AC-1: UserPromptSubmit 触发回合前点（含 prompt 正文），Stop/session.idle 成功后触发回合后点；submit 启发式仅兜底；baselineId 在回合开始固定。
- [ ] AC-2: continue/resume/replace 保持同一 sessionId，conversationIndex 并发创建不重复，历史不碎片化。
- [ ] AC-3: 恢复只回滚该还原点的变更文件（删除补回、新增移除），不删除检查点之后的无关文件。
- [ ] AC-4: 恢复前自动创建 pre-restore 备份点并可一键撤销；误操作可完全复原。
- [ ] AC-5: 冲突真实检测并逐个确认，conflicts 不恒空；活跃回合期间拒绝恢复。
- [ ] AC-6: 捕获时读失败的文件标记 unreadable 且恢复不删；blob GC 与在途创建互斥，恢复不出现半途抛错的半恢复状态。
- [ ] AC-7: initialize 失败重试且在界面可见；恢复结果（实际剪枝与跳过）由后端返回，界面文案与实际一致。
- [ ] AC-8: 真实临时目录 round-trip 测试通过：create→改动→恢复→树相等、并发创建、缺 blob、锁定文件、跨 session 不误剪。

## Risks

- hook 依赖度上升：hook 必须 fail-open，submit 兜底路径保留，缺 hook 的引擎行为不劣于现状。
- 引擎改动位于 janus-agentX 子仓的 agent-core：需要两仓同步纪律与子仓测试先行，JanusX 侧补 IPC 与触发层测试。
- pre-restore 备份点与 retention 交互：备份点计入配额可能挤掉旧点，需要在剪枝策略中显式保护 pre-restore 点或单独限额。
- 存量检查点缺变更文件记录（旧格式只有全量快照）：迁移期恢复对旧点退化为安全受限模式或明确拒绝，不能静默全树清扫。
