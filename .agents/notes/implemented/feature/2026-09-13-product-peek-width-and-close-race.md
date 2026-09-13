# Agent Note: 产物工作区关闭竞态修复与 peek 胶囊满宽对齐

Status: implemented

## Problem

两个用户可复现缺陷：

1. **peek 胶囊左右大留白**：`.janus-peek-core` 是 flex 内容宽度（`min-width:180px`，不撑满），在 380px 宽的一级胶囊里居中——文本挤在中间，两侧是大片空玻璃，与 hifi 设计稿（`cap-row` 满宽：LED 贴左缘、meta 贴右缘）不符。
2. **工作区关闭后点监控区文件只开面板不显示文件**：`ProductWorkspacePanel` 的卸载清理会 `releaseWorkspace` 清空该工作区全部 tabs + 停租约。dev 模式 `StrictMode`（main.tsx 开启）对每次首挂载执行 mount→cleanup→remount：工作区关闭后首次点文件，`openPreview` 在挂载前同步创建的 tab 被清理周期 `releaseWorkspace` 清掉；office 分支还因 epoch 被 bump 而放弃就绪回填。工作区已打开时点文件不触发 remount 所以正常——与"没打开时点文件只开面板不显示文件"的现象完全吻合。

## Decision

**peek 满宽**（`08-janus-peek-capsule.css`）：`.janus-island-shell[data-stage="peek"] .janus-peek-core { width:100%; min-width:0 }`，胶囊行铺满 380px——LED 贴左、meta 贴右，空态舱同样满宽。

**关闭语义上移**：`closeProductWorkspace` 从纯 `visibleWorkspaceId: null` 升级为「置空 + `releaseWorkspace(workspaceId)`」（tabs 清空 + 租约停止），即关闭产物工作区的会话清理职责由显式关闭动作承担；面板卸载清理删除（附注释说明 StrictMode 原因）。工作区切换的 `releaseWorkspace(previous)`（prop-change effect）保留——切换不触发 remount，无 StrictMode 风险。App 层补一个守卫：`productVisible` 变真时取消 pending 关闭定时器并复位 `productClosing`——否则关闭动画期间点监控区文件重开，200ms 前的关闭定时器会把刚打开的工作区再次关掉（timer 判等 `visibleWorkspaceId === closingWorkspaceId` 对同工作区重开恒真）。

## Alternatives considered

- 面板卸载清理改为只停租约不清 tabs——否决：office tab 持死端口引用，重开需依赖 openPreview 的 existing 分支旁路，错误状态会跨会话残留；清理职责放显式关闭动作语义最干净。
- openProductFile 延迟 openPreview 到面板挂载后——否决：违反产物工作区 Note 的「tab 创建与舞台挂载同 commit、无延迟队列」决策。
- App 守卫改为 timer 触发前二次确认 productVisible——与现有 `visibleWorkspaceId === closingWorkspaceId` 判等冲突（同工作区重开恒真），必须显式取消。

## Consequences

获得：peek 内容满宽与设计稿一致；工作区关闭→点监控文件 → 面板打开 + 文件即显（StrictMode dev 与 production 一致）；关闭动画期间的重开不再被吞。代价：`closeProductWorkspace` 变为含异步副作用（停租约 fire-and-forget）的动作，单测补 `closeProductWorkspace releases tabs and leases` 覆盖；面板不再承担卸载清理，若未来有第三处关闭入口（非 closeProductWorkspace 路径）必须走该动作才能清理会话（明确约定）。
