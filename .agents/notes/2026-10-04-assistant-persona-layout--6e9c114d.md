---
schema: harness-note/1
id: 6e9c114d-2b74-40b4-9dbf-a24163328e61
kind: decision
lifecycle: proposed
created: 2026-10-04
class: architecture
tags: [memory, persona, right-dock, ui]
---

# 右侧助手合并入口与个人画像完整布局

## Problem

右侧注册文件、Git、Assist、画像、审核、会话六类工具。Assist 提供工程知识检索和上下文复制，画像提供个人资料、习惯和近期记忆；审核又单独占据入口。相关操作分散，增加用户寻找成本。Assist 的注册门禁始终返回可用，知识库关闭后仍占据右侧位置。

个人工作台复用窄侧栏的 UserPersonaTool 与 UserPersonaCards，采用连续单列条目；personalShell 限宽 1100px。展开正文并没有形成适合宽屏的完整布局。工程知识工作台已有导航、卡片内容与详情区域，可作为一致的视觉与交互基础。

现有独立开关与共用工作台行为见[领域控制决策](./2026-10-04-memory-domain-controls--908d675a.md)。本 Note 记录待实施建议，不声明入口合并或画像重设计已经完成。

## Proposal

将 Assist、画像、审核合并为右侧“助手”入口，内部提供工程知识、个人画像、待审核三个分区，右侧工具种类由六类减为四类。审核保留独立队列与人工确认语义，助手入口显示启用领域的待审核数量；更正提交后直接打开相应审核分区。统一处理旧 persona/review 打开状态与跳转目标，避免升级后恢复到失效工具。

保留知识库与个人画像独立开关：单域开启只显示该域内容及其审核；双域关闭隐藏助手入口。无工作区时个人分区仍可用，工程检索解释工作区要求。右侧提供摘要与快捷操作，并可进入“知识与记忆”的完整管理视图。

个人画像完整视图建议铺满工作台可用内容区域，保留应用导航。采用与工程知识一致的卡片、间距、字体与详情交互，按个人概览、已确认记忆、待确认内容、近期记忆组织。宽屏以分类导航、弹性卡片网格、按需展开详情组成；窄屏收为单列，详情进入独立阅读层。卡片呈现内容摘要、确认状态、更新时间或到期信息，来源在详情按需展开；编辑、更正、遗忘保留明确入口。长期确认事实与近期到期记录必须区分，不能因卡片视觉统一而混同。

完整管理视图与侧栏复用数据和操作能力，分别适配布局。功能设置继续使用现有独立设置面板，不在所有记忆卡片重复展示控制项。具体列宽、卡片密度、空状态与详情展开方式仍需原型和实际窗口验证。

## Alternatives considered

保留三个入口具有一步直达的优势，但不能减少右侧种类。只合并 Assist 和画像改动较少，但审核仍割裂同一条更正流程。合并三者增加一次分区切换，因此建议保留待审核数量提示及直接跳转。

直接拉宽现有画像列表可以最大化复用，但难以利用宽屏并维持阅读层级。完全复制工程知识卡片实现有利于外观一致，却会把工程置信度与个人确认状态混为一谈；应复用视觉规范，按个人数据语义设计卡片。

## Acceptance criteria

- [ ] AC-1：右侧只显示文件、Git、助手、会话；旧入口状态和审核跳转迁移有效。
- [ ] AC-2：四种开关组合、无工作区、处理中关闭领域和审核数量均按启用域隔离。
- [ ] AC-3：个人完整视图利用可用工作台宽高，宽屏卡片合理排列，窄屏无横向溢出；来源与长正文可以完整阅读。
- [ ] AC-4：编辑、更正、遗忘、审核、设置保存与关闭恢复不因布局调整退化；键盘与主题切换可用。

## Risks

助手入口可能被误解为聊天功能，名称和空状态需说明其知识与记忆用途。多层导航不能重复堆叠；工作台与侧栏应保持当前领域和审核跳转语义一致。

## Verification

2026-10-04 源码核对：src/renderer/src/right-tools/registry.ts、components/right-tools/RightToolHost.tsx、components/knowledge/UserPersonaCards.tsx、KnowledgeWorkbench.module.css。基线命令 `npx vitest run tests/unit/knowledge/external-mcp.test.ts tests/unit/knowledge/knowledge-mcp-tools.test.ts tests/unit/right-tool-state.test.ts tests/unit/right-tool-dock.test.ts --maxWorkers=2 --reporter=dot` 为四文件 48 项通过，包含既有 SSR/i18n 警告；不代表提议界面已实现或验收。
