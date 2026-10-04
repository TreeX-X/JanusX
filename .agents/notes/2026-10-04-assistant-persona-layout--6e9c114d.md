---
schema: harness-note/1
id: 6e9c114d-2b74-40b4-9dbf-a24163328e61
kind: decision
lifecycle: implemented
created: 2026-10-04
class: architecture
tags: [memory, persona, right-dock, ui]
---

# 右侧助手合并入口与个人画像完整布局

## Problem

工程知识检索、个人画像与审核属于连续的查看和更正流程，分别占据右侧入口会增加寻找成本。个人工作台复用窄侧栏单列布局时，展开文字不能充分利用宽屏，也缺少分类、搜索与完整来源阅读层级。

现有领域授权与保留期语义由[领域控制决策](./2026-10-04-memory-domain-controls--908d675a.md)维护，界面合并不能改变它们。

## Decision

右侧仅注册文件、Git、助手、会话四类工具。助手内部提供工程知识、个人画像、待审核，关闭某域后仅显示仍启用领域的内容与审核；双域关闭隐藏入口。无工作区时个人功能仍可使用。旧 persona/review 调用转为助手的对应分区，旧打开集合规范化为一个助手；启动仍遵守既有仅恢复宽度、保持栏关闭的规则。

助手图标显示启用领域的待审核数量。首次挂载、窗口获得焦点、审核完成及可见页面每十五秒刷新；读取失败不伪装为零条。审核仍复用 MemoryReviewTool，保留来源、快照校验及人工确认语义。个人更正完成后按当前承载界面打开审核，完整工作台不会意外跳到侧栏。

个人完整视图铺满工作台可用区域，提供个人资料、已确认、待确认、近期记忆分类及内容搜索。中央网格按空间排列卡片，详情按需展示完整文字、来源、更新时间或到期信息，以及编辑、更正、遗忘操作。窄屏详情占用内容区，通过返回按钮恢复列表。长期确认记忆与近期记录的语义独立，来源编号放在详情折叠区。

侧栏保留摘要，完整工作台使用 PersonalMemoryBoard；两者复用 UserPersonaTool 的读取与写操作。共享导航状态使助手打开工作台时落到相应领域。个人设置继续复用独立设置面板，工程模型配置不混入个人卡片。

设置页面按功能使用有边框、内边距、标题分隔和主题背景的卡片。知识库分为采集、自动处理与 MCP 接入，自动处理内部的四环节和连接配置有独立边界。个人设置分为记忆积累、对话使用和近期记忆保留三张卡片，保留即时保存与原有开关语义。卡片共享 KnowledgeSettingsPanel.module.css，完整工作台中的个人设置也使用同一布局。

## Alternatives considered

保留三个入口具有一步直达优势，但不能减少右侧种类。只合并 Assist 和画像减少改动，但审核仍割裂更正流程。合并三者增加分区切换，因此保留数量提示和审核直达。

直接拉宽单列表格复用最多，却缺少分类和宽屏阅读层级。完全复制工程卡片有利于外观一致，但工程评分不等于个人确认状态；本实现复用视觉与操作模式，按个人数据语义组织卡片。

## Consequences

右侧种类减少，完整画像具备分类和详情阅读能力。代价是两个尺寸的呈现组件和旧入口别名需要维护。审核数量是定期更新的显示信息，不是事务授权依据；真实操作仍读取并校验最新快照。卡片正文可截断，详情必须完整可读。

## Verification

设置卡片与图标调整使用现有 assistant-ui、knowledge-automation-ui、laya-settings-ui 三个浏览器测试文件复验，共 16 项通过，覆盖独立保存、禁用、本地控制与 MCP 更新操作。截图检查深色、planche 和窄窗口；类型检查与 i18n 检查通过。知识库四环节、个人三张设置卡片与 MCP 图标沿用实际组件，未增加仅比对样式常量的测试。

2026-10-04：tests/unit/assistant-ui.test.ts 使用真实 React 组件与浏览器 IPC 替身，检查三个助手分区、四种开关组合、无工作区画像、旧审核跳转、1440×900 完整工作台、搜索及来源详情、640×720 窄屏与主题布局。截图在 artifacts/memory-domain-acceptance/personal-board-*.png，人工检查正文、操作入口和横向溢出；测试产物不入库。

最终定向测试覆盖 assistant-ui、right-tool-state、right-tool-dock、knowledge-automation-ui、memory-review-ui、knowledge-ipc-contract 以及 knowledge 下 external-mcp、mcp-client-config、mcp-access、knowledge-mcp-tools，共十文件 85 项通过；命令为 npx vitest run 后接上述 tests/unit 路径，参数 --maxWorkers=2 --reporter=dot。真实桌面命令 JANUSX_DESKTOP_ENTRY=artifacts/build-check/main/index.js npx playwright test --config playwright.desktop.config.ts tests/e2e/knowledge-pipeline.spec.ts 通过一项，覆盖真实采集、审核、画像操作及四种开关组合，耗时 8.7 秒。

全仓 npm run test:unit -- --run --maxWorkers=3 --reporter=dot 为 2712 项通过、1 项失败、5 项跳过；唯一失败仍为既有六处跨仓 Note 源码链接失效。后续新增的客户端配置测试与独立进程测试另行执行，不计入这一全仓数字。严格类型、隔离构建、i18n、包边界与排除检查通过；变更源文件 ESLint 无错误，KnowledgeWorkbench 既有 refresh effect 依赖警告保留。MCP 接入和真实客户端验证由[终端覆盖决策](./2026-10-04-mcp-terminal-coverage--b74b3c92.md)维护。
