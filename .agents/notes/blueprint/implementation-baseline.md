---
{
  "schema": "harness-note/2",
  "id": "e07e80b9-7974-4114-a449-2b6c8dff5ccd",
  "kind": "note",
  "lifecycle": "accepted",
  "created": "2026-10-10",
  "updated": "2026-10-10T11:40:50Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/f12d99b4-c116-48dc-96d9-e3ac74ae41cd"
}
---

# 蓝图重构：实现与验收基线

本篇维护[交付计划](evolution-roadmap.md)的实现边界和实际验证结果。按主 Agent 串行 xdo 执行，未创建 Task，未修改用户的真实模型选择、自动审核开关或终端全局配置。工作区原有未提交变更保持保留。

## 当前代码边界

| 能力 | 实现位置与边界 |
| --- | --- |
| 原始 Note | 继续使用 agentX 的 NoteService、NoteChatEditor 和事务；共享 harness-node/node-hosts 增加 expectedHash 分页续读保护，源码已构建后通过正常安装接入，无 node_modules 补丁。 |
| 当前建议 | blueprint/suggestions 使用共享来源扫描与 SQLite 短事务，按 repo、真实 checkout、实际分支、Note UUID 和精确输入 hash 隔离；只保存当前意见和必要版本。已过时报告的再次依赖变化仍使旧请求失效；当前同内容新 ID 去重，不保存处理历史。 |
| 蓝图导航 | 保留模块浏览、原文预览、现有关系详情与连线；独立关系图谱已按用户决定移除。节点状态数组按值比较，避免无变化卡片被重建。 |
| 审核 | blueprint/review 读取原始 Note、归属模块、关系与显式代码引用；生成模型独立选择，JEV 可选；顶部显示启用、逐篇进度与最近一轮摘要。只有左侧手动或启用的 Git 调度生成建议，均不改正文。 |
| Git 调度 | first-parent 全提交计数、N 默认 5/关闭、普通合并专项、提交内一致取证、持久检查点与失败目标分开；一次临时重试、取消和重开恢复已接线。 |
| 独立 MCP | note-mcp 入口复用共享标准工具、当前建议和固定上下文；每次显式 workspacePath，不要求桌面或 WorkflowX。五客户端配置适配及 Pi 扩展限制见[接入专题](note-mcp.md)。 |
| 旧工程退出 | 工程提取、生成 Wiki/历史、图谱、检索、旧 MCP、自动审核及工作台入口已移除。启动按归属清理旧生成资产；混合事实只删除明确工程记录，未知或损坏记录保留。 |
| 个人与共享基础 | 保留个人确认、纠正、遗忘、来源、审计、画像、召回及队列；既有 opt-in 工程习惯来源只接纳可归因用户输入，CaptureInbox 在落盘及重放前过滤。Hook 状态、模型接入、加密凭据与已下载本地资源保留，本地部署 UI 隐藏。 |

## 已运行验证

自动审核反馈（2026-10-10）：31 项定向回归通过，路径别名补测 UI 10 项；类型、ESLint、双语与构建通过。C 盘满，临时配置和产物置于 D:/CodexTemp/JanusX-blueprint-feedback-20261010，原验证规则保持不变；未调用真实模型或修改用户开关。

蓝图设置局部修复（2026-10-10）：JEV 凭据增加 eye 查看，失焦不再清空本次输入，每次进入设置恢复已保存值并显示密码圆点，eye 直接切换当前值，切换页签再返回仍隐藏；生成模型测试提高到 1024 token，并返回可区分的脱敏原因。使用 dev 现有 Vertex AI / gemini-3.8-flash 及固定测试句进行只读配置复现，32 token 两次均返回 length（一次无正文，一次已有 OK 仍被截断）；1024 两次均完成，修复后的 checkReviewConfiguration 也返回 ready。未改写真实提供方、审核模型选择或自动开关，未调用真实 JEV，本次不改变其既有验收缺口。条件 live 用例为 tests/unit/blueprint-review-models-live.test.ts，定向 UI、模型分类、IPC 与引擎回归记录见审核专题；类型、ESLint、双语检查通过。页签返回交互修复后，blueprint-review-ui 的 7 项 Chromium 交互测试、类型检查与设置组件 ESLint 通过，未重复真实模型测试。

本机 Node 24.15.0、Electron 内置 Node 22.16.0。类型检查、build:check 与新增/核心修改文件的定向 ESLint 通过。整组回归命令覆盖 tests/unit/knowledge、blueprint-review、blueprint-suggestions、note-mcp、个人助手 UI、用户记忆工具、Hook 和 Chat ports，使用 --maxWorkers=2，702 项通过、0 失败、3 项条件跳过；其后取消发布、上下文缺失和资产清理等 22 项定向补测通过（与前述测试有重叠，不累加为独立测试总数）。该数字不表示全仓测试通过。

真实生成模型使用用户选择的 Vertex AI / gemini-3.8-flash。三类 Note × 一致、矛盾、遗漏、材料不足、未实施共 15 个受控场景，整轮 14/15；需求/材料不足场景一次不完整输出被拒绝，单独重试通过。不能表述为单轮 15/15，也不能外推为任意项目质量通过。未启用 JEV 的结果标为未核验；开发凭据无法解密，真实有/无 JEV 对比尚未完成。报告保留在 docs/validation/blueprint-refactor/。

真实客户端进程使用隔离目录与本机确定性模型响应，验证工具传输而非模型推理质量。Claude Code、OpenCode、DSH、新构建的 Janus CLI 完成 list/read/write/suggestions/context，写后内容已核对。Codex 读取通过，写入被宿主 never 审批策略阻止，未记通过。Pi 安装说明明确无原生 MCP，本轮没有扩展适配。可重跑 scripts/verify-note-mcp-clients.mjs，用户配置不会被导入测试改写。

## 验收限制

真实 JEV 对比、Pi 扩展、Codex 宿主允许策略下的写入及安装包升级仍未通过。本轮测试不向用户真实工程启用自动审核；旧数据迁移以隔离样例验证，真实数据清理在应用下次启动执行。个人未来自动接入全部终端、提取优化和新工作台设计不在本轮范围。

开发测试脚本与脱敏验收证据可以保留；生产当前建议库不归档已处理意见。完整版本的未验收承诺继续由交付计划追踪，不能用构建成功替代安装包验收。

## 前次暂停检查点与后续局部验证

按用户要求在代码实现、受控回归和文档同步检查点暂停，未开始安装包发布。桌面端到端未通过：隔离 Electron 可以启动并从真实 IPC 读取同一 SQLite 的建议，但画布夹具节点定位/选择超时，尚未完成点击清理、设置探测及重开闭环。保留 tests/e2e/blueprint-review-desktop.spec.ts 作为待修验收，不计为通过。

后续已完善设置样式、自动审核命名、CLI 图标与 MCP 悬浮说明，并修复建议版本失效、重复累积和节点增量刷新，增加 MCP 模块筛选与摘要分页。独立关系图谱的实现、切换入口、文案和专用测试已移除，取消决定见[导航模块](navigation/module.md)。移除后运行建议生命周期、双进程、审核引擎、MCP、节点刷新、布局、导航及模块投影 10 个单元测试文件，86 项通过；`npx playwright test tests/e2e/blueprint-architecture.spec.ts tests/e2e/blueprint-v2.spec.ts --project=island --workers=1` 的 15 项模块浏览回归通过，覆盖内嵌和工作台入口、预览、搜索、进入和返回。类型与 i18n 检查通过；Note 结构检查 284 篇、0 错误，保留 17 项既有跨仓链接诊断。此处结果不替代尚未完成的 Electron 建议闭环与安装包验收。

最终类型检查、build:check、定向 ESLint、i18n、包边界与生成排除清单检查通过。Note 结构检查 281 篇、0 错误，保留 17 项既有跨仓链接诊断；完整 corpus 验证 0 错误、24 项读取诊断。验证摘要为 docs/validation/blueprint-refactor/checkpoint.json。完整桌面/MVP 出口仍未签收，F1/F3 的宿主兼容和真实 JEV 缺口继续保留；恢复后先修桌面验收，再推进对应阶段。代码与 Note 未提交，用户模型和自动审核配置未改写。
