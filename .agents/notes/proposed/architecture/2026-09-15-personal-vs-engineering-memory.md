---
schema: harness-note/1
id: 4515fa0e-caa1-59ba-99a7-7cb7f2bc51d0
kind: decision
lifecycle: proposed
created: 2026-09-15
class: architecture
---
# Agent Note: 个人记忆与工程知识分离

Status: proposed

## Problem

工程知识与个人记忆共用同一个审核入口，导致两个不同生命周期的东西混在一起。工程知识量大、变化快、跟随工作区产生，来源包括 agent 执行、checkpoint、git 分析、工具调用和蓝图维护；个人记忆量小、要求跨工作区长期稳定，内容是身份、表达偏好、工具偏好、重复出现的操作习惯和个人固定的开发流程。当前 `src/renderer/src/components/knowledge/KnowledgeWorkbench.tsx` 的 `candidatesForTab` 把 `factCandidates`、`wikiPatches`、`graphCandidates` 全部合并为一个 `Inbox` 队列，仅靠 `candidateScopeTag` 补一个 `persona` 标签区分。工程候选一多，个人习惯候选就会被淹没，批量审核时也容易误批错域。

采集侧其实已经分开，但审核侧没有跟上。个人侧只有 `janus-chat` 会积累：`src/main/knowledge/user-turn-capture.ts` 的 `capturePersonChatTurn` 只处理无工作区的个人对话并写入 `user` 哨兵观测与 dated episode，`src/main/llm/janus-agent-ports.ts` 对空 `targets` 回落到 `USER_MEMORY_WORKSPACE_ID`，`source` 固定为 `janus-chat`。工程侧则由全通道采集并按真实 `workspaceId` 落盘。若不把分离写死，后续团队协作一旦共享知识库与蓝图，个人 traits 将面临泄露与污染共享召回的风险，届时再拆的成本远高于现在。

## Proposal

建立两域定义并在采集、审核、召回、共享四处落实，管线复用、视图与共享边界分离。

个人域指跟人不跟项目的记忆与知识。存储为 `profile/profile.json` 快照、`episodes/` 月度 JSONL 事件以及 `facts.jsonl` 中 `scope=user` 或 `provenance.workspaceId=user` 的事实，哨兵常量为 `src/main/knowledge/constants.ts` 的 `USER_MEMORY_WORKSPACE_ID`。内容限定为身份陈述、`formatPrefs`、`toolPrefs`、经 `habit-aggregator` 以频率三以上加 Ebbinghaus 衰减与 retrieval reheat 晋升的习惯，以及个人固定的开发流程习惯（`FactKind` 取 `procedure` 或 `preference`）。采集只允许 `janus-chat` 对话与 `user-memory.save` 的候选写入，禁止任何工程通道写入 `scope=user`。召回走 `user-recall-service` 的独立预算与独立 `<janus-user-memory>` 段，默认私有没有发布概念，`recall-service` 对非 `scope=user` 请求直接丢弃个人文档。

工程域指跟项目走的知识。存储为按工作区归属的 observations、`facts.jsonl` 中 workspace 域事实、`wiki/pages` 页面与 `graph/edges` 关系，来源为 `agent-stream`、`checkpoint`、`git-event`、`tool-call`、`blueprint-maintenance` 与人工沉淀。内容为项目决策、工程事实、沉淀 wiki 与关系图谱，项目级固定流程归这里而非个人域。召回保持按 `workspaceId`、`workspacePath` 与 `allowGlobal` 过滤的项目路径，蓝图作为工程工件与工程知识库处于同一共享域，可随团队协作共享。

审核保持单管线、双视图。复用现有的 processing queue、deterministic stage、budgeted LLM stage、`review-service` 与 audit，不分叉存储与结算逻辑。`Inbox` 必须按 `scope` 分栏或过滤展示个人与工程两列并各自计数，`persona` 工具的 `Open Inbox` 携带 `scope=user` 直达个人列；远期允许 `UserPersonaTool` 就地展示待审习惯并复用同一 `applyCandidate` 与 `rejectCandidate` IPC，避免跳窗审核。`listProposedUserFactCandidates` 作为个人候选的唯一读取口，视图层不得绕过它直读候选文件。

团队协作预留硬隔离。租户、成员、roundtable、remote、桌面通知与 `janusx-knowledge` 外部 MCP 等一切共享面默认只读工程 truth，`allowGlobal=false` 且 `scope!=user`；`profile`、`episodes`、个人习惯事实、个人候选与 `workspaceId=user` 的观测永不进入同步与共享 API。个人进入共享面必须经过显式的 publish 动作，该动作在本次提案中只定原则不实现具体交互。

## Alternatives considered

- 维持现状仅打 `persona` 标签 — 最强理由是零改动且单队列实现最简单。否决原因是标签无法解决淹没与误批，个人候选在工程洪峰下不可见，且未来共享时标签不构成安全边界。
- 彻底分叉两套存储与管线 — 最强理由是物理隔离最彻底。否决原因是分支成本过高，queue、cursor、deterministic 合并、LLM 预算、review 与 audit 都要 дублировать，`2026-09-03-knowledge-pipeline.md` 确立的 queue-owned 结构将被破坏。
- 个人记忆也按工作区分片存储 — 最强理由是实现与工程完全对称。否决原因是习惯的价值恰在跨工作区复用，按工作区分片会导致同一习惯在多处重复晋升、supersede 链断裂，且 `user-recall` 的独立预算与 succession 标注无处安放。
- Do nothing / reuse 项目记忆承载个人偏好 — 留在原地可保护冻结语义。代价是每会话重复追问偏好、近期问题不可答、新旧习惯静默冲突，与 `2026-09-10-personal-memory-persona.md` 的验收目标直接矛盾。

## Acceptance criteria

- [ ] `Inbox` 可按个人与工程分别过滤与计数，个人待审数与 `getUserMemoryOverview` 的 `pendingHabitCount` 一致。
- [ ] 非 `janus-chat` 与非 `user-memory.save` 通道无法产生 `scope=user` 候选，测试覆盖工程来源写入个人域的拒绝路径。
- [ ] 非 `scope=user` 的召回请求不可见任何个人文档，包括 `allowGlobal` 搜索，`recall-service` 过滤器测试覆盖该不变式。
- [ ] 团队、roundtable、remote、MCP 等共享面默认只返回工程 truth，个人快照、episodes 与个人事实不在共享快照中出现。
- [ ] 个人固定流程与项目固定流程各有归属示例，前者经个人审核晋升为 `scope=user` 习惯，后者经工程审核沉淀为 workspace wiki 或事实。

## Risks

- 个人晋升噪声在 `janus-chat` 高频追问下反弹，需保持高精度阈值并观测分 derivation 的提案压力。
- 个人习惯变更后旧事实以 succession 归档，若召回同时命中新旧两条会产生双重指导，需保持现有的 supersede 归档与标签逻辑。
- 显式 publish 尚未设计，在团队功能落地前任何共享 API 新增都必须默认排除个人域，以缺省安全代替事后补漏。
- `USER_MEMORY_WORKSPACE_ID` 哨兵若被当作普通工作区同步，将直接泄露个人域，需在同步层面对该哨兵做硬拒绝而非仅靠调用方自觉。
