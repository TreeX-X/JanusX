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

设置导航按应用设置、知识与记忆、模型与用量、代理与协作分组，组内统一使用图标、标题、说明和选中指示。知识库与个人画像独立按创新开关显示，双域关闭时隐藏空分组；正在查看的领域关闭时回到通用设置。模型配置、模型目录与用量处于同组。桌面导航独立纵向滚动，窄窗口保留组名与分隔并横向滚动，键盘聚焦可到达末尾项目。

导航滚动条在 Chromium 中使用明确的 4px 宽高、透明轨道与圆角滑块，颜色由 shell-muted 混合透明度生成，悬停时提高可见度。scrollbar-width 保持 auto，让 WebKit 伪元素的尺寸生效；设置 thin 会优先使用浏览器预设，无法保证四像素。

创新功能入口在统一分组中保留强调色边框、浅渐变、星光图标与“实验”徽标，深色使用琥珀色，planche 使用主题强调色。该标识用于区分实验能力；选择其他页面后仍可见，不使用持续闪烁动画。

创新功能六项开关的开启和关闭均先展示确认框，确认后才调用保存接口。弹窗展示对应功能影响及注意事项，蓝图保留 WorkflowX Agent 的格式要求。原生 dialog 通过 showModal 进入浏览器顶层，使用独立样式，不依赖蓝图工作台样式加载。取消或 Esc 不提交，Esc 不关闭父级设置窗口；保存期间禁止重复操作，失败保留原状态并显示错误，用户可重试。

确认框显式设置 fixed、inset: 0 和 margin: auto，避免 globals.css 的通用 margin: 0 重置覆盖浏览器默认居中。宽高受视口安全边距约束，长内容在弹窗内滚动；组件测试加载真实全局样式，否则会遗漏应用外壳造成的定位差异。

## Alternatives considered

保留三个入口具有一步直达优势，但不能减少右侧种类。只合并 Assist 和画像减少改动，但审核仍割裂更正流程。合并三者增加分区切换，因此保留数量提示和审核直达。

直接拉宽单列表格复用最多，却缺少分类和宽屏阅读层级。完全复制工程卡片有利于外观一致，但工程评分不等于个人确认状态；本实现复用视觉与操作模式，按个人数据语义组织卡片。

沿用平铺设置导航保留现有位置，但不能表达知识与画像、模型与用量的关联。折叠分组能缩短导航，却增加展开步骤和状态维护；固定组名与按需滚动让全部启用项目保持可达，代价是低高度窗口需要滚动。

仅在开启蓝图时确认减少点击次数，但其他开关直接改变运行行为，不能满足双向确认要求。复用蓝图 PromptDialog 可减少样式代码，但把设置确认与蓝图样式及父层键盘事件耦合。局部原生 dialog 提供顶层显示和焦点约束，代价是维护一份设置确认样式，适用范围限定创新功能开关。

## Consequences

右侧种类减少，完整画像具备分类和详情阅读能力。代价是两个尺寸的呈现组件和旧入口别名需要维护。审核数量是定期更新的显示信息，不是事务授权依据；真实操作仍读取并校验最新快照。卡片正文可截断，详情必须完整可读。

## Verification

居中回归在加载 globals.css 后复现修复前水平中心偏移 380px；修复后 npx vitest run tests/unit/knowledge-automation-ui.test.ts --maxWorkers=2 --reporter=dot 的 10 项通过，覆盖 1200×850 和 640×720 中心误差小于 2px、六项双向确认及 1200×520 导航滚动到末尾。证据位于 artifacts/memory-domain-acceptance/experimental-centering-before.log 和 settings-scroll-centering-tests.log；滚动条深浅主题截图使用 settings-scrollbar-*.png。

创新入口及确认流程：npx vitest run tests/unit/knowledge-automation-ui.test.ts tests/unit/experimental-features.test.ts --maxWorkers=2 --reporter=dot，共两文件 14 项通过。其中浏览器测试遍历六项功能的双向切换，检查确认前零写入、取消与 Esc、父窗口保留、原生顶层显示、保存失败原值保留及重试、保存中防重复提交。严格类型、隔离构建、i18n 与变更组件 ESLint 通过；截图 experimental-confirm-*.png 和 settings-groups-dark.png 位于 artifacts/memory-domain-acceptance/。

设置分组与 Shell MCP 排除的定向检查：npx vitest run tests/unit/knowledge-automation-ui.test.ts tests/unit/assistant-ui.test.ts tests/unit/knowledge/external-mcp.test.ts tests/unit/knowledge/mcp-client-config.test.ts tests/unit/knowledge-ipc-contract.test.ts --maxWorkers=2 --reporter=dot，共五文件 34 项通过。分组测试检查领域四种组合、当前页禁用回退、模型与用量切换，以及 640×720 窗口末尾导航可达且没有页面横向溢出。截图 settings-groups-dark.png 与 settings-groups-narrow.png 位于 artifacts/memory-domain-acceptance/，使用真实导航组件与内容面板替身；截图不代替完整桌面验收。

分组最终复验中 knowledge-automation-ui 的 8 项通过；npm run typecheck:strict-unused、npm run build:check、npm run i18n:check 与变更源码 ESLint 通过。npm run check:notes 检查 237 篇 Note，0 个结构错误、27 项既有链接诊断。日志位于 artifacts/memory-domain-acceptance/settings-groups-*.log。

设置卡片与图标调整使用现有 assistant-ui、knowledge-automation-ui、laya-settings-ui 三个浏览器测试文件复验，共 16 项通过，覆盖独立保存、禁用、本地控制与 MCP 更新操作。截图检查深色、planche 和窄窗口；类型检查与 i18n 检查通过。知识库四环节、个人三张设置卡片与 MCP 图标沿用实际组件，未增加仅比对样式常量的测试。

2026-10-04：tests/unit/assistant-ui.test.ts 使用真实 React 组件与浏览器 IPC 替身，检查三个助手分区、四种开关组合、无工作区画像、旧审核跳转、1440×900 完整工作台、搜索及来源详情、640×720 窄屏与主题布局。截图在 artifacts/memory-domain-acceptance/personal-board-*.png，人工检查正文、操作入口和横向溢出；测试产物不入库。

最终定向测试覆盖 assistant-ui、right-tool-state、right-tool-dock、knowledge-automation-ui、memory-review-ui、knowledge-ipc-contract 以及 knowledge 下 external-mcp、mcp-client-config、mcp-access、knowledge-mcp-tools，共十文件 85 项通过；命令为 npx vitest run 后接上述 tests/unit 路径，参数 --maxWorkers=2 --reporter=dot。真实桌面命令 JANUSX_DESKTOP_ENTRY=artifacts/build-check/main/index.js npx playwright test --config playwright.desktop.config.ts tests/e2e/knowledge-pipeline.spec.ts 通过一项，覆盖真实采集、审核、画像操作及四种开关组合，耗时 8.7 秒。

全仓 npm run test:unit -- --run --maxWorkers=3 --reporter=dot 为 2712 项通过、1 项失败、5 项跳过；唯一失败仍为既有六处跨仓 Note 源码链接失效。后续新增的客户端配置测试与独立进程测试另行执行，不计入这一全仓数字。严格类型、隔离构建、i18n、包边界与排除检查通过；变更源文件 ESLint 无错误，KnowledgeWorkbench 既有 refresh effect 依赖警告保留。MCP 接入和真实客户端验证由[终端覆盖决策](./2026-10-04-mcp-terminal-coverage--b74b3c92.md)维护。
