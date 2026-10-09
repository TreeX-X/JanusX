---
{
  "schema": "harness-note/2",
  "id": "df528098-263f-456f-8cf3-6d6906163263",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-05",
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/a568cc88-94af-5ffe-af61-7b60f787cd43",
  "class": "process",
  "tags": ["github","community","projects","discussions"],
  "updated": "2026-10-08T03:43:42.569Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5"
}
---

# 社区机制先行 Projects，Discussions 延后

## Problem

社区机制尚未搭建完成，Issue 模板与里程碑承担全部公开协作流量，版本发布窗口临近，单维护者同时搭建看板与讨论区会分散巡检精力。无人值守的讨论区比没有讨论区更损害信任，无人梳理的看板比里程碑列表更容易过时。排序必须先定下来，否则两个机制都会烂尾。

## Decision

Projects 先行，Discussions 延后。仓库只维护一个组织级 Projects 看板并关联本仓库，视图复用既有里程碑与标签语义，承担版本范围与交付状态的可视化。Discussions 保持关闭状态，不在设置中启用，不在 Issue 模板与文档中预告开放时间。正式版交付完成后，维护者按重访信号重新评估是否启用。过程规范的唯一入口仍是 [CONTRIBUTING.md](../../../CONTRIBUTING.md)，本决策的归属依据是[GitHub 维护标准](../desktop/github-maintenance.md)。

看板只设一个，字段只保留状态、优先级与里程碑归属，自动流转只接 Issue 与拉请求的状态变更。维护者拥有梳理义务，贡献者不直接改看板结构，只通过 Issue 与标签参与。Discussions 的启用条件、分类与版主规则不属于本次范围，启用前必须另立决策。

## Alternatives considered

- 双轨并行，同时启用 Projects 与 Discussions：最强理由是一次到位覆盖规划与讨论，但维护者在发布窗口内同时承担两种巡检，任一失守都会留下公开的无人区。
- 先开 Discussions，Projects 延后：最强理由是公开预览前承接提问与想法，降低无效 Issue，但问答沉淀需要分类、版主与转 Issue 规则先行，否则讨论无法转化为交付。
- Do nothing / reuse：只保留 Issue 模板、标签与里程碑，成本为零且与当前流程完全兼容，但版本范围缺少状态视图，多工作流并行时只能靠逐条翻 Issue 还原进度。

## Consequences

 收益方面，版本范围与交付状态集中在一个看板内可见，Issue 与里程碑的既有分流保持不变，Discussions 的治理成本在发布窗口内为零。新参与者阅读单个看板即知当前重点，无需在多个半成品机制之间猜测入口。

 成本方面，维护者承担看板梳理责任，过期卡片必须在版本收尾时归档；提问与想法在启用前继续走 Issue 通道，部分轻量讨论会被模板挡回。重访信号为正式版交付完成、重复提问明显增多、或有明确版主人选出现，任一成立即重新评估启用，未成立则继续关闭。
