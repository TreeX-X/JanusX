---
{
  "schema": "harness-note/2",
  "id": "7cc69d43-fa82-4b5e-9ac1-fe32fa4f0d5f",
  "kind": "requirement",
  "lifecycle": "draft",
  "created": "2026-10-10",
  "class": "feature",
  "tags": ["session","transcript"],
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/3e9ec8d6-9ccc-44ee-ba3f-c1b577d88b7b"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/c23ebb35-2d89-4c56-8dee-03bb7e277a22"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/36a4c7d5-fc0f-4436-9fc0-f925ef8fc4f7"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/fc8ba315-f289-423c-babc-2b048bc2726b"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/e29da5b4-dc65-40a9-883d-9026e3b280b1"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/bc53c6cc-29fb-59db-a0cf-1e32eaf2fc0a"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/bfb75f46-e26d-4e35-b25c-6e6e0c7f4638"}
  ],
  "updated": "2026-10-10T09:22:54.066Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/dc1aca7c-408f-406d-add4-ba78d556b662"
}
---

# 会话内容真值：transcript 驱动的输入与输出显示

## Expected behavior

会话面板的对话内容来自三个各自可失败的来源：回合只在 turn-end hook 触发时存在，问题文本只来自 submit-line 捕获或关联检查点的 prompt，答案侧没有正文来源。hook 载荷里的 message 到达知识记录器却被会话账本丢弃，`SessionTurnRecord` 只有 prompt 与 excerpt 两个可选字段，Stop 载荷不带答案正文，provider transcript 路径虽持久化在会话记录上却从不为显示而读取。直接在 TUI 输入的会话首问为空，卡片标题退化为引擎名；答案侧只剩状态徽章。

解析层另有确定性缺陷。会话扫描与详情读取不排除 Codex `event_msg` 镜像记录，而知识管线已在其解析器中排除，turnCount 因此翻倍并产生无提问的幻影回合。一个真实提问下的多条 assistant 记录（agentic 多步）被计为多回合且问答错配。Claude 的 sidechain/subagent 记录、`isMeta` 与 compact 摘要进入 firstPrompt 与计数。超过 512KB 的转录按 head+tail 读取时，缺口两侧被配对成虚构问答。hook 会话行与外部扫描行竞态出双卡：Codex 的 `thread_id` 被 Windows hook 白名单丢弃，provider id 晚到也不合并既有行。workspace scope 用子串判定，相邻工作区的会话互相串入。

Codex 的环境上下文注入进一步污染首问：rollout 把仓库指令写成 `role:"user"` 记录（`# AGENTS.md instructions for <path>` 加 `<INSTRUCTIONS>` 全文，实测数千字符），其 `metadata` 为空；真实用户输入的记录才带 `metadata.user_input_order` 数字与 `retained_source`。只取「首个 user 文本」的规则因此把每张 codex 卡的首次提示固定成 AGENTS.md 内容。orca 不在原始 rollout 上取首个 user 文本：它先把 provider 记录规范化为带 root/child 与 command/message 分类的 journal item，取首问时跳过非 root 与 command 条目、只取 text 块、要求正文含字母数字、并按 4000 code unit 代理对安全截断（`firstStructuredAgentSessionPrompt`、`clampConversationNameFirstPrompt`）。

目标行为是 orca 的方式：显示正文的唯一真源是各 CLI 自己的落盘 transcript，展示时有界读取；hook 只承担状态与身份，pty 文本不参与归属与状态判定。L3 详情窗显示全量文本对话——用户输入全文与 Agent 文本回复全文；工具调用与 thinking 块不渲染。L1 卡片显示过滤包装噪声后的真实首问与正确回合数，L2 显示完整首问与最近问答对。一条用户提问构成一回合，跨引擎计数口径一致；同一对话只出现一张卡并归属正确工作区。

## Proposal

四个切片按序落地，解析内核先行。

统一 per-engine 解析内核：将扫描器、详情读取、摘要提取的各引擎提取逻辑收敛到单一模块，吸收知识解析器已证的规则——Codex 只采用 `response_item` 源记录、排除 `event_msg` 镜像，Claude 排除 `isMeta`、sidechain 与 compact 摘要；只提取 text 类内容块，工具调用与 thinking 天然不进显示管道；多块文本以换行拼接而非无分隔连接。首问过滤 `<command-name>`、`[Request interrupted by user]`、system-reminder 与摘要包装，取首个真实用户提问。Codex 真实输入以记录元数据判别：`metadata.user_input_order` 为数字（或带 `retained_source`）的 user 记录才是用户输入，缺失者视为环境上下文注入（AGENTS.md 指令、`<ENVIRONMENT_CONTEXT>` 等）整条跳过；旧版 rollout 无元数据时回退内容判据（`# AGENTS.md instructions for`、`<INSTRUCTIONS>`、`<user_instructions>`、`<ENVIRONMENT_CONTEXT>` 前缀）。

统一回合语义：一条用户提问计为一回合，其下连续 assistant 记录归并为同一回合的回复正文；各引擎 turnCount 采用同一口径；重复的回合终结事件（Stop 与 SessionEnd）不产生幻影回合；重扫时 turnCount 重算而非只增。

身份与归属：hook 载荷白名单透传 `thread_id` 与 `transcript_path`，provider id 提取覆盖 codex thread id；hook 行与外部扫描行按 engine 加 providerSessionId 合并，晚到的 provider id 合并既有行而不是新增，transcript 路径作为次级匹配键；workspace scope 使用归一化路径的前缀或相等判定，废除子串 fallback；continue/resume/replace 不重新铸造 sessionId，逻辑对话保持同一账本身份。

显示管道：L3 按窗口读取转录并逐回合懒加载，缺口两侧不虚构配对，坏行跳过，摘要即时渲染、全文按需填充；L1/L2 只显示摘要层。渲染合并按消息身份或时间对齐而不是按索引，转录只补 prompt 与回复正文，保留账本侧的回合种类、检查点关联与时间。历史行一次性重扫 heal 错误计数、错误首问（含 AGENTS.md 注入形标题与种子回合）与双卡，幂等且失败保留原行。

## Alternatives considered

- 以 hook 载荷作为正文真源 — 最强理由是零文件 IO 且链路已存在。排除原因：Stop 载荷只带状态与错误文本，从不带答案正文，UserPromptSubmit 也不稳定携带全文；orca 的源码核查结论同样是 hook 管状态与身份、transcript 管正文。
- transcript 原文全量渲染（含工具调用与 thinking）— 最强理由是信息无损。排除原因：agentic 会话中工具噪音压过对话正文，可读性差；产品定案为只显示文本回复。
- 把全量正文存进会话账本 — 最强理由是读取时无 IO。排除原因：无界复制 provider 存储，[会话正文决策](../records/session-conversation-content.md)已否决，保留摘要字段加按需读取。
- 按索引继续合并转录与账本回合 — 最强理由是改动最小。排除原因：转录配对与 hook 回合极少一一对齐，prompt 与回复挂错回合正是当前症状之一。
- 维持现状 — 零改动。成本即当前症状：输入缺失、输出空白、计数错误、双卡与串工作区。

## Acceptance criteria

- [x] AC-1: claude/codex/pi/opencode/janus 各引擎解析排除 codex `event_msg` 镜像、`isMeta`、sidechain 与 compact 摘要，fixture 下回合计数与问答配对与 knowledge-transcript 口径一致。
- [x] AC-2: 一条用户提问计为一回合，同一提问下的连续 assistant 记录归并为一条回复；各引擎 turnCount 口径一致。
- [x] AC-3: firstPrompt 为过滤包装与环境注入后的首个真实用户提问：覆盖 `<command-name>`、`[Request interrupted by user]`、system-reminder、摘要包装，以及 codex 的 AGENTS.md 指令与 `<ENVIRONMENT_CONTEXT>` 注入（以 `metadata.user_input_order` 判别真实输入）；codex 卡片标题不再固定为 AGENTS.md 内容。
- [ ] AC-4: L3 详情窗显示全量问答正文：用户输入全文与 Agent 文本回复全文；工具调用与 thinking 块不渲染。
- [x] AC-5: 超过 512KB 的转录按窗口读取，缺口两侧不虚构问答配对，坏行跳过；摘要即时渲染、全文逐回合懒加载。
- [x] AC-6: hook 会话行与外部扫描行按 engine+providerSessionId 合并，同一对话只出现一张卡；晚到的 provider id 合并既有行而非新增。
- [x] AC-7: hook 载荷透传 `thread_id` 与 `transcript_path`，codex 回合可解析正文与摘要，不再退化为 status-only。
- [x] AC-8: workspace scope 使用归一化路径的前缀或相等判定，相邻工作区会话不再互串。
- [x] AC-9: Stop 与 SessionEnd 重复终结不产生幻影回合；历史 turnCount 在重扫时重算而非只增。
- [ ] AC-10: `npm run typecheck`、`typecheck:strict-unused`、触达文件 eslint、`npm run i18n:check` 与新增解析 fixture 测试全部通过。

AC-4 的数据层（全文问答、工具/thinking 排除）与渲染合并已有测试，活界面显示待 Electron 演练后勾选。AC-10 中 `typecheck:strict-unused` 有一处与本需求无关的既有报错（`src/main/janus/maintenance/service.ts` 未使用导入，属工作区未提交改动），其余检查全部通过。实现取舍见 [统一转录解析内核、一问一回合与身份合并](../records/session-content-truth-kernel.md)。

## Risks

- provider transcript 形状随 CLI 版本漂移：fixture 锁定当前形状并逐行容错，未知形状降级为状态行而不是报错。
- 窗口读取与逐回合懒加载的性能预算：512KB、100 回台、2000 字符摘要上限继续生效，超额截断并标注。
- 存量 registry 数据带错误计数与碎片化身份：一次性重扫 heal 必须幂等，失败保留原行，不破坏用户可见历史。
- Windows 路径大小写与同义路径：归一化只用于比较与归属判定，不改写用户可见的记录路径。
- 渲染合并改按身份对齐后，无 id 的历史转录行需要时间戳退化路径，错位窗口内的旧数据可能仍显错配。
