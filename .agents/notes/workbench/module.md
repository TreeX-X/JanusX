---
{
  "schema": "harness-note/2",
  "id": "19cd1394-b2cb-4819-8fde-5f12de16574c",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-09-26",
  "class": "architecture",
  "tags": ["product","surface"],
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/93151b7b-6a33-5e5d-bf83-f2109fc85389"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/b1978fa7-4732-553a-83c3-12aefd34c248"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/671574ba-c6e4-54ab-8fee-8d762e72f622"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/48db2e15-9318-5068-b300-b1913abf5463"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/b32f92b5-0256-5402-8a15-d19e9fa4db73"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/5c873080-4f76-597f-9fbd-0bdcc59a02a3"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/8688b5ab-1f7f-5ff9-ba1b-ef75b7fd5917"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/c0b4743b-71be-462a-97da-27e40bc5d67a"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/a162efb4-23a7-4468-95e6-7163fe7efdc0"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/7b4800da-0ea0-4f63-9f15-7ce60e721bd7"}
  ],
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/right-tools/RightDock.tsx",
      "symbol": "RightDock",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/product-workspace/ProductWorkspacePanel.tsx",
      "symbol": "ProductWorkspacePanel",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/renderer/src/components/janus/JanusIsland.tsx",
      "symbol": "JanusIsland",
      "role": "implementation"
    }
  ],
  "updated": "2026-10-16T05:56:00Z",
  "moduleState": "partial"
}
---

# 工作台与产物界面

## Responsibility

组织 Island、右侧工具栏、产物预览与共享编辑器的交互和视觉。RightDock 负责工具承载与布局，ProductWorkspacePanel 负责生成文件的预览，JanusIsland 负责工作状态及通知入口。文件事实由既有读取服务提供，会话耐久、Agent 执行与工程 Note 事务分别由对应模块负责。

## Design

[长时间使用性能分析](./long-session-performance.md)记录 0.9.2 便携版进程风暴、应用数据自监听、审查注册、遥测与界面更新风险，区分实测证据、已有修复和待验证方向。

生成文件面板统一显示“预览”，本地 Markdown／文本及应用状态界面跟随主题，HTML／Office 文档保留自身配色。[预览实现与主题检查](./product-workspace.md)记录统一扫描入口、历史迁移预算和固定色例外；新增主题可集中定位遗留项，verify 拒绝新增扫描问题。

右侧[工具 Tab](./right-dock.md)采用中部工作区的圆角、无描边浅底色选中态与主题化交互反馈，同时保持 36px 标题栏、26px 标签、原有 11px 字体和紧凑自适应宽度。关闭按钮支持清晰的键盘焦点及 Enter 关闭；工具注册顺序与横向滚动行为保留。

通用设置的[主题选择](./settings-theme-preview.md)以预览小卡片替代下拉框。每张缩略界面读取对应主题令牌，点击即保存应用；原生单选支持键盘切换，选中状态以轻描边与勾标记表达。说明与卡片根据设置区域实际宽度重排，保存失败保留原主题并显示错误。

[设置布局](./settings-layout.md)以平铺分区、按需展开和一致的操作区组织配置。通用页管理偏好与开发环境，关于页集中版本、更新与 GitHub 求赞入口；通知关闭时收起关联字段，通知与 Agent 权限显示未保存状态；模型测试与保存位于底部。外部 CLI 参考 MCP 接入采用品牌、状态与操作组成的通栏列表，保留安装、检测及入口显隐语义。

分屏落点与 Tab 插入占位统一使用灰色半透明底色和弱灰描边；侧栏原生拖入与 Tab 指针拖动共用预览及圆角提示样式，避免拖动时出现大面积强调色。浮动 Tab 保留清晰的主题底色，排序和分屏在松手后提交。

左侧“工作区”标题行不保留下方横线，40px 高度与中央 Tab 栏对齐，通过标题和列表留白区分导航层级；侧栏与内容之间的竖向边界保留。[底部用量栏](./runtime-drawer-cards-resize.md)收起时无贯穿横线，整行为支持键盘的展开按钮，圆角反馈集中到“用量”入口。展开时保留弱分隔与高度调整，卡片以浅底色和当前终端标记分组，避免重复描边；摘要布局按中部实际宽度收拢。

侧栏项目与终端选中态使用中性底色，分支与终端采用单行名称，路径和启动类型移入悬浮提示；[终端分组与导航](../terminal/sidebar-terminal-hierarchy.md)拥有终端点击定位、跨项目恢复和 worktree 归属规则。项目[悬浮操作](../sessions/workspace-row-hover-reveal.md)预留固定按钮位，以淡入显示保持名称宽度和菜单锚点稳定。

右侧[工具区](./right-dock.md)使用中性选中态，工具入口位置固定，折叠按钮位于栏底部；文件与会话搜索统一高度和间距。会话采用标题优先的轻量列表，短提示去重，展开后才抬升详情底色；Git 只显示非零变更统计，分组标题减少底色和小字。各工具宽度偏好、标签与业务操作保留。宽度切换由工作区网格统一执行 240ms 过渡，内容按目标宽度排版并以 160ms 淡入，避免逐帧挤压文字；拖拽即时跟手，减少动态效果偏好禁用这两项动画。

负责布局、预览、导航及可达交互，不承诺所有插件、主题或预览提案均已交付。下面保留历史阅读链，Note 工具的界面承载在本模块，文档身份和蓝图解析见 [Note 与蓝图](../blueprint/module.md)。

中央工作区以 pane 树统一承载终端、浏览器与 Markdown 内容；[工作区标签拖拽与布局](./pane-tab-reorder.md)负责排序、跨 pane 合并与分屏。工作区直角铺满，不保留外侧留缝、双层描边与阴影；圆角和轻底色集中到标签，分屏焦点由当前标签表达。每个 pane 的标签区独立横向滚动，右侧操作区固定，纯浏览器工作区也可分屏。分屏边界为 1px 细线、9px 拖动命中区，支持键盘调整和双击平分；底部监控条弱化分隔并移除身份、模型和其它终端摘要的胶囊边框。

备忘录与圆桌羊皮纸、角色结果及问题池已共用 components/island/islandMotion.ts 的开合生命周期、可见内容编排、220ms 动效参数及最终几何展示，components/island/islandLayout.ts 按左右方向求解主附岛布局。memo 与 useAuxiliaryIslandLayout 分别适配宿主；业务状态和材质仍由原模块负责，关闭后恢复所占样式、inert 和焦点。旧独立展示清理定时及固定偏移已移除。羊皮纸快速关开、窄窗两岛边界和关闭恢复通过浏览器检查；其它两种附岛完整业务仍未单独端到端验收，取舍及证据见[里程碑设计评审](../knowledge/milestone-design-review.md)。

Chat 会话删除确认框虽通过 portal 挂到 body，仍属于 island 的交互范围。JanusChat 在确认框及遮罩外层标记 data-island-companion，并阻止指针和键盘事件继续向宿主传播；因此确认／取消不会被判为岛外点击，Esc 只关闭确认框。删除非当前会话保留当前回复；删除当前会话中止其回复并选择剩余会话，删完最后一条则创建空会话，均保持 island 展开。弹窗消失后正常的岛外点击收起仍有效。

2026-10-14 回归：修复前真实组件测试复现点击删除确认后 data-stage 变为 collapsed；修复后 `npx playwright test tests/e2e/chat-conversation-delete.spec.ts --project=island --workers=1 --output=artifacts/chat-delete/verified` 5 项通过，覆盖置顶／未置顶、取消／Esc／遮罩、Enter 删除末会话、删除进行中回复与保留另一会话回复。使用真实组件和会话控制器，持久化与流式 IPC 为测试替身；未另跑桌面删除持久化。`npm run typecheck` 与 `npm run build:app` 通过；JanusChat 范围 ESLint 为 0 错误、4 条既有中文字符串警告。

槽位演进链（非重复，保留先后）：[island-slots](./requirements/island-rightdock-slots.md)、[right-dock](./right-dock.md)、[empty-collapse](./right-dock-empty-collapse.md)、[toggle-motion](./right-rail-toggle-motion.md)、[drawer-resize](./runtime-drawer-cards-resize.md)、[run-orb](./run-orb-budding.md)、[hifi-alignment](./island-hifi-optimized-alignment.md)、[capsule](./island-notification-capsule.md)；turn 双件[island](./turn-change-island.md)与[card](./turn-change-card-external-cli.md)同属本域。

产物语义：[workspace 重构](./product-workspace.md)、[notice-matrix](./product-notice-matrix.md)、[peek-race](./product-peek-width-and-close-race.md)、[preview-p0](./product-preview-p0.md)、[tour](./product-tour.md)、[landing](../desktop/landing-page.md)。

Note 工具链三件各司其职：[drawer-toolbar](./note-drawer-markdown-toolbar.md)、[mechanical-gates](../blueprint/documents/note-mechanical-checks.md)、[rename-draftcard](./notecard-rename-draft-card.md)；[Markdown 独立 pane 与顶栏工具分组](./markdown-pane-entry.md)记录移出底部的已确定方向，以及终端解耦、保存与迁移建议，尚未实现。工作便签归属：[own-namespace implemented](../blueprint/documents/history/own-notes-namespace.md)与[own-namespace proposed](../blueprint/documents/history/own-notes-namespace-proposal.md)为生命周期对，成对保留。

配套：[github-maintenance](../desktop/github-maintenance.md)、[markdown-assets](./markdown-preview-local-assets.md)、[experimental-preview](./experimental-preview-features.md)、[file-glyph](./drawer-markdown-file-glyph.md)、[reveal-race](./file-tree-reveal-race.md)、[share-import](../blueprint/workspaces/share-import.md)、[plugin-forms](./requirements/plugin-architecture-forms.md)、[plugin-debug](./requirements/plugin-import-debug.md)、[entry-nav](./entry-switch-navigation.md)、[f12-nav](./f12-navigation.md)。

外部工作流工具探索：[Grok Bot 衔接](./grok-bot-workflow-integration.md)仍在讨论；[Docker 面板入口](./docker-management-entry.md)于 2026-10-14 放弃 Portainer 接入、改为自研首版七项基本能力（连接状态、容器列表与启停、实时日志、容器终端、访问服务、Compose 分组），承载为新的 pane 内容类型；配套的[HTTP 请求 pane](./http-request-pane.md)同批设计。两者均未实现。

服务集成：[CPA 账号管理复用与 Figma 接入](./service-integrations.md)维护中部与右侧扩展入口及服务边界。S1 提供可信注册与两处宿主，S2 将文件树、Git、会话管理迁移为内置扩展并保留原偏好及服务。S3 内嵌原版 CPA 管理页并跨项目复用；“设置 → 服务集成”现支持已有实例与本地托管，首次启用下载、自定义回环端口、启停／重启、加密管理密钥复制、日志和自动更新，关闭页面保持服务，退出应用停止自有实例。真实 Windows 后端与前端登录已验证，供应商额度、OAuth 和其他平台托管未验收。公开类型、内置定义及双区域示例位于 `src/renderer/src/extensions/`；第三方导入、市场与 Figma 接入仍待实施。

插件交付按[分阶段计划](../planning/plugin-platform-roadmap.md)先建立扩展核心，再将文件树、Git、会话管理依次迁移为内置扩展，通过 CPA 和双区域示例验证后开放第三方导入与市场。内置与第三方扩展共享贡献协议、按信任等级运行；工作台需求维护验收，规划模块维护顺序，版本及日期尚未指定。

运行与测试目标探索：[按当前 worktree 运行与测试项目](./worktree-run-test-target.md)记录现有快捷启动使用工作区根目录的限制，以及目标跟随、进程归属和测试结果标识的建议，作为 0.9.2 候选，尚未实现。

渲染与编辑器：[emphasis](./markdown-emphasis-orange-text.md)（强调色去填充块）、[standalone-refresh](./standalone-editor-auto-refresh.md)（独立编辑器外部变更自刷新）。

## Acceptance criteria

以下为 2026-09-26 整理的历史验收，原编号、条文与勾选状态保留给已有 Task。篇数与迁移样例记录不代表当前范围。

- [x] AC-1: 本域 31 篇直接子全部携带有效 parent。
- [ ] AC-2: own-namespace 生命周期对保留两篇，不判重复删除。
- [ ] AC-3: 历史迁移样例已清理（2026-09-27 随鹈鹕骑行 Note 一并移除），不再保留隔离样例。
