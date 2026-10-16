---
{
  "schema": "harness-note/2",
  "id": "607e1d4b-8bf4-43c7-af1f-97da9ae9e30b",
  "kind": "note",
  "lifecycle": "draft",
  "created": "2026-10-16",
  "updated": "2026-10-16T06:05:23Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/1aef97e6-77fe-4bae-af51-ff560a737282",
  "relations": [
    { "type": "related-to", "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/96a2f5cd-166e-4982-a444-7640858f0a5f" },
    { "type": "related-to", "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/80e8b427-d263-42f4-b7cd-8313548c9e2a" },
    { "type": "related-to", "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bd06538e-063f-4de8-a3da-11b0dccd41d5" }
  ]
}
---

# 插件平台分阶段交付计划

## 排期定位

已确认先建设扩展架构，将现有右侧文件树、Git 和会话管理按内置扩展管理，再开放第三方插件和市场。中部工作区与右侧工作区都提供通用贡献入口；插件可单独提供一种视图，也可同时提供两种。维护目标是让插件作者使用公开接口独立开发，接入已有能力时无需逐插件修改宿主容器。

本计划按依赖安排 S1 至 S5，尚未指定版本或工期，不挤占既有版本事项；统一列入[工程排期的未归入节点](engineering-milestones.md)。2026-10-16 按 xdo 交付 S1 可信渲染器扩展基础、S2 内置工具迁移与 S3 CPA 内嵌及双区域验证，并补充用户确认的本地 CPA 托管；S4、S5 待实施。阶段通过以所属需求的验收与实际证据为准，普通 xdo 不创建执行 Task。

## 当前基础与实施边界

S1 已在 `src/renderer/src/extensions/` 提供注册／注销、启用／停用、同步激活与清理、稳定视图 ID、React 订阅和视图宿主。右侧注册表与状态管理合并动态贡献，中部通过通用 extension pane 和已有 `+` 菜单承载。S2 已将文件树、Git、会话管理注册为内置扩展，移除它们在右侧容器中的专属渲染与图标分支；兼容适配保留旧 ID、入口和宽度偏好。当前接口不加载第三方包。

内置扩展随应用发布，保留可信 React 运行方式，通过宿主服务访问文件、Git 与会话能力；第三方插件使用隔离容器与按权限开放的通信桥。两者共享贡献语义，不共享全部权限。外部管理网页使用独立承载规则，不因嵌入而获得插件桥。文件系统、Git 操作、会话执行与持久化继续由原宿主模块负责，本轮不重写底层服务。

设计和验收归[插件架构需求](../workbench/requirements/plugin-architecture-forms.md)，导入、隔离和调试归[第三方导入需求](../workbench/requirements/plugin-import-debug.md)，CPA 与 Figma 的产品边界归[服务集成](../workbench/service-integrations.md)。本轮不捆绑迁移 Island、助手等其他工具；共享容器调整仍需覆盖它们的行为回归。

## 交付顺序

| 阶段 | 前置条件 | 交付内容 | 阶段出口 |
|---|---|---|---|
| S1 扩展核心与视图协议 | 无阶段前置；实施时盘点现有注册及状态接口 | 稳定扩展与视图 ID、注册与注销、激活与停用、资源清理；中部与右侧贡献接口；应用级／项目级作用域；主题和上下文适配；SDK 类型及最小示例 | 示例可分别打开中部与右侧视图，新增贡献无需修改容器；停用清理入口与资源，未知 ID 恢复不崩溃 |
| S2 内置工具迁移 | S1 出口通过 | 按 S2a 文件树 → S2b Git → S2c 会话管理逐个迁移为内置扩展，替换容器中的工具专属分支，保留稳定身份与既有偏好 | 三个工具通过统一协议注册，行为与布局恢复无回归；不以迁移界面为由改写底层服务 |
| S3 CPA 与双区域验证 | S2 出口通过 | 官方 CPA 集成在中部内嵌既有管理前端；验证全局实例配置与跨项目复用；提供同时贡献中部和右侧视图的最小示例 | CPA 登录、导航、页面打开／关闭验证通过或明确不可嵌入并提供系统浏览器回退；双视图共享状态、停用与恢复验证通过 |
| S4 第三方本地导入与调试 | S3 的通用宿主验证通过；明确第三方信任规则 | 冻结清单与 SDK、文件夹导入、隔离页面、受限桥、授权、启用／禁用／卸载、日志及开发重载 | 外部作者仅依赖公开 SDK 即可完成中部或右侧插件；导入全生命周期、权限拒绝、崩溃隔离和失效布局恢复通过 |
| S5 插件市场与分发 | S4 出口通过 | 发现、已安装、插件详情、兼容性、官方推荐、版本更新与卸载；先做官方精选目录，再扩展社区来源 | 安装、连接、实际可用三个状态可区分；不兼容版本可拒绝，权限扩大可重新授权，更新失败可保留可用版本 |

S1、S2 优先形成可独立验收的内置扩展基础，不等待市场完成。各阶段按出口进入下一阶段，阶段内部按主 Agent 顺序推进，不安排并行 Agent 或隐含独立评审。

### S2 迁移验收重点

- S2a 文件树：保留目录展开、搜索、文件打开、拖拽、现有写操作授权，以及项目切换后的正确归属；停用视图不遗留其订阅和监听。
- S2b Git：保留变更查看、暂存、提交、历史与远端操作，状态跟随项目；插件视图生命周期不重复创建监听或修改既有写入授权。
- S2c 会话管理：保留列表、筛选、打开与导航、相关实验开关和状态恢复；关闭面板不终止正在执行的会话，不改变会话持久化和 CLI 的原生交互。
- 三次迁移分别记录受影响的单元、界面及真实桌面检查证据，覆盖顺序、图标、快捷键、宽度偏好、快速开关、错误重试和已有其他工具；不以浏览器替身检查替代桌面验证结论。

### S3 CPA 范围

CPA 作为官方推荐集成候选，主要用于账号额度及重置次数、时间等信息查看；转 API 按需配置。优先复用现有管理界面，不重建完整原生账号面板。具体前端和各供应商字段覆盖需核实，调用统计不能替代供应商剩余额度。

双区域示例用于验证宿主能力，不要求 CPA 首版实现原生右侧额度摘要。初始 S3 未包含托管下载、升级与进程管理；用户后续明确选择首次启用下载，已按末节补充交付。完整原生额度摘要仍不在范围内。若所选管理前端无法内嵌，需先明确调整 CPA 交付范围；浏览器回退不能作为“内嵌已验收”的证据。

### S4 与 S5 的进入条件

现有架构需求要求拒绝执行未签名目录，导入草案又要求授权后加载本地开发目录。S4 实施前须明确受控开发模式与正式发布的信任规则，并同步两篇需求；本计划不以用户确认界面代替代码信任验证，也不承诺当前已支持签名。

首批第三方网络、凭据、写入、终端与模型后端权限仍受原导入草案限制。CPA 官方集成不能成为绕过第三方权限边界的样板。S5 再确定来源审核、完整性验证、更新与回退机制；ZIP、远程源、签名和社区发布分别评估，不从“有市场页面”推导成已具备分发能力。

## 后续接入

Figma 保留为后续服务集成候选，围绕项目设计链接、所选 CLI 的 MCP／Skills 接入及服务授权单独定范围，不作为上述五阶段的阻塞依赖。中部与右侧开放也不自动包含视图拖动换区、跨容器迁移或全部视图后台保活，这些能力待真实工作流证明需求后再排期。

## S1 交付与验证

可信扩展通过一个定义贡献中部页面和右侧面板，入口由宿主自动生成；示例见 `src/renderer/src/extensions/examples/workspace-tools.tsx`，使用方法见同目录上级的 `README.md`。示例不在生产中自动启用。项目页面按项目快照恢复，项目右侧视图切换时重挂载；应用级中部页面随当前项目转移，快照不复制其身份。跨项目或容器重挂载后需要保留的业务状态由扩展自己的状态存储管理，当前不增加页面磁盘持久化。

停用或注销清理中部活动树、后台项目快照和右侧打开集合；清理函数异常仍移除贡献，重新启用得到新挂载身份。单视图渲染错误使用局部错误边界，注册订阅者异常不阻止其他订阅者收到更新。已有内置工具 ID 和宽度偏好保持兼容。

验证：`npx vitest run tests/unit/extensions.test.ts tests/unit/right-tool-state.test.ts tests/unit/right-tool-dock.test.ts tests/unit/workspace-pane.test.ts tests/unit/workspace-front-surface.test.ts tests/unit/workspace-remote-terminal-sync.test.ts tests/unit/workspace-sidebar.test.ts tests/unit/side-panel-collapse-ui.test.ts` 共 121 项通过。浏览器真实组件测试 `tests/e2e/extensions.spec.ts` 5 项通过，覆盖纸面／深色主题、双区域状态、项目隔离和恢复、菜单与关闭、停用／注销清理及错误隔离；原有 `pane-tab-drag` 与 `right-dock-motion` 25 项通过。曾复现全局页面插入抢走项目 Tab 的选中态，已修复并补回归用例。浏览器使用 IPC fallback，不作为真实 Electron 集成结论。

严格类型检查、变更范围 ESLint、`npm run build:app`、包边界、i18n 与 Notes 检查通过。真实 Electron 回归 `npx playwright test tests/e2e/desktop-smoke.spec.ts --project=desktop --workers=1 --grep 'built desktop' --output=artifacts/extensions-s1/desktop` 1 项通过，覆盖既有工作区、终端及右侧工具关键路径；新扩展本身的双视图验证仍为前述浏览器组件测试。主题 CSS 生成检查通过；全仓主题审计在本轮未改的 `AboutSettingsPanel.module.css:132` 和 `:133` 报两处固定颜色，未修改其他功能来消除此失败。第三方隔离、清单权限校验、独立发布的 SDK 包与脚手架仍待后续阶段，不能据此宣称完整插件平台已完成。

## S2 交付与验证

S2a 文件树、S2b Git、S2c 会话管理统一在 `extensions/builtins.tsx` 声明：扩展身份为 `janusx.files`、`janusx.git`、`janusx.sessions`，各贡献一个右侧 `panel`。适配层将命名空间视图映射回 `files`、`git`、`sessions`，避免重复面板并保留调用入口、快捷键及 `janusx:right-tools:v1` 宽度偏好。顺序、图标、翻译键、宽度配置与会话实验开关跟随定义。停用卸载视图并移除入口，重新启用保持关闭，宽度仍保留；应用重启仍默认启用内置扩展，本阶段未增加插件管理页或停用状态持久化。

元数据在偏好恢复前注册，业务组件按需加载，避免注册表、组件与 store 的循环初始化。三个内置外壳使用应用级挂载身份，继续通过既有 store 读取项目／worktree；这样保留原来的空项目界面与切换项目时的局部 UI 状态。宿主服务及其后台监听继续运行，视图自身订阅、定时器和 DOM 监听随原组件卸载清理。右侧所有贡献共用原有重试／关闭错误边界；关闭或停用会话视图不终止 PTY，也不修改会话记录。

单元验证：`npx vitest run tests/unit/builtin-extensions.test.ts tests/unit/extensions.test.ts tests/unit/right-tool-state.test.ts tests/unit/right-tool-dock.test.ts tests/unit/workspace-pane.test.ts tests/unit/workspace-front-surface.test.ts tests/unit/workspace-remote-terminal-sync.test.ts tests/unit/workspace-sidebar.test.ts tests/unit/side-panel-collapse-ui.test.ts tests/unit/file-tree-utils.test.ts tests/unit/file-tree-drag.test.ts tests/unit/file-tree-move.test.ts tests/unit/file-tree-refresh-pressure.test.ts tests/unit/git-store.test.ts tests/unit/session-continue-resume.test.ts tests/unit/external-session-sync.test.ts` 共 176 项通过。覆盖三种工具的兼容 ID、重复打开、停用／启用、宽度保留、会话开关，以及既有文件、Git 和会话逻辑。

浏览器验证：`npx playwright test tests/e2e/builtin-extensions.spec.ts tests/e2e/extensions.spec.ts tests/e2e/right-workspace-design.spec.ts tests/e2e/right-dock-motion.spec.ts tests/e2e/right-tool-tooltips.spec.ts --project=island --workers=1 --output=artifacts/extensions-s2/browser` 首轮 16 项通过、1 项因按钮定位器失败；修正定位器及补齐语言设置 IPC 测试桩后，重跑 `builtin-extensions.spec.ts` 的 2 项通过，结果在 `artifacts/extensions-s2/browser-fixed`，合计 17 项不同用例通过。覆盖文件搜索保留、Git 暂存调用、三个扩展停用及重开、两套主题与窄宽面板、双区域示例、错误隔离，以及会话失活／关闭／开关／停用时订阅归零、重开不累积和项目归属。随后增强 `extensions.spec.ts` 的错误用例，实际点击重试恢复视图，单项通过，证据在 `artifacts/extensions-s2/retry`。浏览器使用 IPC fallback。

桌面验证：构建后运行 `npx playwright test tests/e2e/desktop-smoke.spec.ts tests/e2e/desktop-session-continue.spec.ts --project=desktop --workers=1 --grep 'built desktop|Continue in New Session mints' --output=artifacts/extensions-s2/desktop`，2 项通过。真实 Electron 覆盖文件树、Git、工作区与终端关键路径，以及会话继续／恢复。新增检查关闭会话面板后向已有 PTY 发送标记，测试 CLI 收到输入且会话记录保留，重开恢复列表。CLI 为隔离的测试进程，不访问真实供应商账号；本轮未对真实远端执行 push／pull。

严格类型检查、生产变更范围 ESLint、应用构建、包边界、i18n 与 Notes 检查通过；Notes 为 315 份、0 错误，另有 17 条显式外部链接诊断。主题生成检查通过，全仓主题审计仍被未改动的 `AboutSettingsPanel.module.css:132`、`:133` 两处固定颜色阻断。AC-6 按以上迁移和回归证据完成；CPA 内嵌、第三方加载与市场继续归 S3 至 S5。

## S3 交付与验证

CPA 通过 `janusx.cpa` 注册应用级中部页面，设置的“应用设置 → 服务集成”保存已有实例的管理页地址并打开页面，中部 `+` 菜单也提供入口。使用原生网页承载原版管理前端，复用原浏览器的加载错误、重试与对话框遮挡机制；保留系统浏览器入口。S3 初始交付连接已有实例，后续按用户确认补充下节本地托管；仍不新增 JanusX 模型 API 配置或原生额度摘要。

初始交付的已有实例模式全局配置只存地址，管理密钥由原前端处理，按 origin 隔离的持久分区保留其登录；跨项目复用同一原生页面，关闭释放视图，重启可恢复前端自己记住的登录。页面无 preload、Node 或宿主桥，原生浏览器仅通过内部选项配置独立分区及 HTTP(S) 导航限制。后续托管增加的配置与密钥职责见末节及[服务集成](../workbench/service-integrations.md)，不据此完成第三方权限验收 AC-8。

单元验证：`npx vitest run tests/unit/cpa.test.ts tests/unit/browser-surface-manager.test.ts tests/unit/browser-ipc-contract.test.ts tests/unit/browser-occlusion.test.ts tests/unit/builtin-extensions.test.ts tests/unit/extensions.test.ts` 共 80 项通过，覆盖地址和 IPC 边界、只保存地址、并发打开、重复保存、关闭重开、分区变化、系统浏览器调用和受限导航，日志为 `artifacts/cpa-s3-unit.log`。

浏览器验证：`npx playwright test tests/e2e/extensions.spec.ts tests/e2e/builtin-extensions.spec.ts --project=island --workers=1 --output=artifacts/cpa-s3/browser` 共 7 项通过。复用 S1 双区域示例，覆盖中部／右侧共享状态、项目隔离与恢复、主题、停用／注销清理和错误恢复；内置工具回归通过。此组使用 IPC fallback。

真实 Electron：`tests/e2e/desktop-cpa.spec.ts` 的本地页面用例验证跨项目同一 guest、独立网页登录、无宿主桥、对话框遮挡、HTTP 弹窗标签、关闭释放和应用重启后登录恢复。原版 CPAMC v1.26.5 用例验证渲染、登录、配额页导航及刷新恢复，使用校验 SHA-256 的上游单文件前端与本地模拟管理 API；没有真实供应商账号或 OAuth 证据。原有 `desktop-smoke.spec.ts` 的 `Browser load failure` 用例通过。原版前端和浏览器回归结果位于 `artifacts/cpa-s3/desktop-final`，生命周期最终结果位于 `artifacts/cpa-s3/desktop-lifecycle`。运行原版用例需设置 `JANUSX_E2E_CPA_HTML` 与 `JANUSX_E2E_CPA_SHA256`；默认无资源时显式跳过，不联网下载。最初失败的预期及定位器已修正，不作为通过证据。

严格类型检查、生产变更范围 ESLint、`npm run build:app`、包边界、i18n 和 Notes 检查通过；Notes 为 315 份、0 错误、17 条显式外部链接诊断。主题生成检查通过，全仓主题审计仍在未改动的 About 页报上述两处固定颜色。S3 出口限定为管理前端与通用宿主验证，实际后端及供应商额度兼容性需连接部署实例再核对；S4 进入前仍须解决本计划所列开发目录与正式发布信任规则。

## S3 补充：本地 CPA 托管

用户已选择首次启用下载、自定义端口、自动更新，并认可 CPA 随 JanusX 运行。本地托管与已有实例两种模式已交付，旧地址配置继续归已有实例。托管初始未启用，启用保存或按需打开时准备组件并启动，关闭页面保持服务，停用或应用退出停止自有进程。支持端口校验、占用提示、运行状态、停止／重启、立即更新、日志及加密管理密钥的显式复制。配置、账号目录与版本文件分开，主安装包不包含 CPA 二进制。产品边界和平台限制归[服务集成](../workbench/service-integrations.md)。

组件从固定官方仓库选择支持主版本的稳定资源并校验 GitHub SHA-256 digest，限制解压文件，保留许可证。自动更新每日检查并暂存，下一次 CPA 启动时应用；立即更新会重启。新版本启动失败尝试保留的当前版本，恢复启动前配置，账号不参与覆盖。受控托管不提供第三方本机执行权限，AC-8 保持未完成，S4 的信任规则仍须独立确定。

单元验证：`npx vitest run tests/unit/cpa.test.ts tests/unit/cpa-installer.test.ts tests/unit/cpa-runtime.test.ts tests/unit/app-shutdown.test.ts tests/unit/browser-surface-manager.test.ts tests/unit/browser-ipc-contract.test.ts tests/unit/extensions.test.ts` 共 101 项通过，日志 `artifacts/cpa-managed-unit.log`。覆盖摘要与来源、归档过滤、取消、组件篡改、版本保留／清理、端口冲突、加密存储不可用、幂等启动、密钥复用及并发生成、退出竞态、更新暂存、失败回退及原浏览器和扩展回归。更新跨版本与下载失败为单元替身证据，不等于真实未来版本升级兼容性。

桌面验证：构建后设置 `JANUSX_E2E_CPA_ZIP`、`JANUSX_E2E_CPA_HTML` 与 `JANUSX_E2E_CPA_SHA256`，运行 `npx playwright test tests/e2e/desktop-cpa.spec.ts tests/e2e/desktop-smoke.spec.ts --project=desktop --workers=1 --grep 'CPA|CPAMC|Browser load failure' --output=artifacts/cpa-managed/desktop-final`，4 项通过。密钥并发生成修复后，以 `--grep 'managed CPA' --output=artifacts/cpa-managed/desktop-key-final` 重跑托管用例，1 项通过。新托管用例替换网络传输为本地校验资源，但生产安装器、提取、safeStorage、真实 Windows CPA 8.0.31、CPAMC 1.26.5 与进程托管原样执行；验证设置页首次启用、原前端登录／配额导航、关闭页继续运行、修改端口、冲突不结束外部监听、应用退出后端口释放及整应用重启后的密钥与账号目录测试文件保留。未接入真实供应商账号，未验证 OAuth、额度、强杀全部进程或已签名安装包；网络资源曾实际下载并校验，但桌面用例不衡量 GitHub 可达性。

浏览器回归 `extensions.spec.ts` 与 `builtin-extensions.spec.ts` 7 项通过，结果在 `artifacts/cpa-managed/browser`。严格类型检查、生产变更范围 ESLint、构建、i18n、包边界和 Notes 检查通过；全仓主题检查仍被未改动的 About 页两处固定颜色阻断。Windows 子进程仍继承父进程权限，未实现降权；macOS／Linux 下载分支未作真实启动验收，不能从 Windows 结果推导跨平台完成。
