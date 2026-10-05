---
schema: harness-note/1
id: 4f49c9ba-45cf-4fee-9f5b-343852512fc7
kind: requirement
lifecycle: accepted
created: 2026-10-04
class: feature
tags: [blueprint, harness, empty-state, janus]
---

# 蓝图按工作区切换与空工作区初始化生成

## Problem

如果蓝图切换器只枚举成功解析出的投影，未初始化和读取失败的工作区就会消失。活动工作区没有投影时回退到其他工作区，还会让画布内容与项目上下文不一致。空工作区需要可执行的初始化或起草入口，解析失败则需要诊断和重试。状态扫描可以携带未绑定外部仓库的引用诊断；若在投影加载期间直接展开这些信息，正常工作区也会呈现成故障页面。

## Expected behavior

工作台和内嵌蓝图统一枚举 Janus 已添加的工作区，以工作区 ID 选择当前项，蓝图状态作为副标。选择同步活动工作区，随后加载该工作区的投影或空态；空态和失败均不回退到其他工作区。较早请求晚返回时不得覆盖当前选择。同一工作区刷新保留当前画布，切换工作区立即清除旧内容。

未初始化的工作区提供“初始化蓝图”，先展示全部新增文件清单，正文按需展开，再由用户确认写入 `.agents/harness.json` 与一份 initiative 草稿。已有配置但没有 Note 的工作区提供“让 Janus 起草蓝图”：在该工作区的项目会话中读取源文件，展示逐条 Note 提案，用户确认后通过已有 Note 写入链路保存选中的 draft。生成入口本身发出只读请求，要求来源依据、未勾选验收项和完整正文。仅含无效 Note 或身份配置异常的工作区不提供初始化覆盖入口；读取失败保留重试。

加载态只显示当前工作区和读取进度。正常或空工作区不展开索引诊断，原始数据仍保留在状态及图谱诊断中。需要修复或读取失败时，主界面提供简明说明，去重后的原始原因放入默认折叠的“查看诊断详情”；可定位的项目文件保留打开入口。初始化及撤销错误采用相同展示方式。切换工作区重置预览和诊断展开状态。

空态使用应用主题的正文、背景和强调色，工作区名称、状态标题、说明和主次操作形成清晰层次。只有当前工作区的图谱加载出节点后，工作台才显示搜索、筛选和布局保存控件；同一工作区后台刷新保留已有画布工具。预览取消后焦点返回初始化按钮，文件正文可以独立滚动，外来内容确认框和最终写入确认继续生效。

通用文件生成、身份保护和撤销使用 agentX 的 `previewHarnessInit/applyHarnessInit/undoHarnessInit`。Janus 持有预览令牌、提供界面和会话入口。令牌绑定窗口与工作区，正文不作为确认参数重新传入。外来 `.agents` 内容需额外确认保留。撤销只删除初始化生成且未经修改的文件；存在其他 Note 时，共享撤销接口保守拒绝。撤销凭据在当前窗口保留，可跨工作区切换及蓝图面板开关使用，窗口重载或 24 小时到期后不恢复。

## Scope

范围包括工作区切换、每工作区状态、初始化预览与撤销、只读起草请求和失败诊断。打开工作区不自动初始化；不包含启动催促、设置接入档位、外部工具配置安装、一工作区多蓝图选择或任意旧格式迁移。WorkflowX 在 agentX 内置并默认执行，项目数据初始化不以设置接入为前置。

本篇是[整体优化](./2026-10-04-janus-ecosystem-note-optimization--24617149.md)的第 2 步，依赖[共享底座](./2026-10-04-agentx-harness-inheritance--bd7fd0c6.md)。布局保存、已有 Note 对话写入和跨仓依赖刷新继续复用原有链路。

## Acceptance criteria

- [x] AC-1: 未初始化、已初始化但空、仅无效 Note 分别展示原因与初始化、起草或修复入口。
- [x] AC-2: 初始化仅新增最小文件集、幂等且有受保护的撤销，已有 `harness.json` 不覆盖，`foreign` 状态需额外确认。
- [x] AC-3: 初始化模板为 draft；起草入口发送只读提案请求，要求逐条确认后保存 draft、验收项未勾选，入口不直接写入生成内容。
- [x] AC-4: 无投影时由 `BlueprintWorkspaceSetup` 保留工作区名称、简明状态与操作出口；加载和正常状态不展开技术诊断，故障详情默认折叠并可主动查看。
- [x] AC-5: 两个切换器的数据源均为工作区列表，无投影时可选，选择同步活动工作区并加载其投影或空态。
- [x] AC-6: 状态表以工作区 ID 存储 ok/empty/not-found/foreign/invalid/error，当前项按 ID 判定；旧请求不得覆盖新选择。
- [x] AC-7: 空态和预览使用主题字体与控件层级；没有可用图谱时隐藏画布工具，窄窗口仍能预览、确认和取消初始化。

## Verification

2026-10-05：`tests/unit/blueprint-workspace-init.test.ts` 使用真实临时目录覆盖预览无写入、草稿投影、幂等、已有身份保护、诊断、外来内容确认、令牌作用域、冲突与撤销。`tests/unit/blueprint-workspace-selection.test.ts` 覆盖工作区完整列表、空态选择、状态与投影竞态、读取失败和后台状态更新。

`npx vitest run tests/unit/blueprint-workspace-init.test.ts tests/unit/blueprint-workspace-selection.test.ts tests/unit/note-refresh.test.ts --maxWorkers=1 --minWorkers=1`：22 项通过。

`npx playwright test tests/e2e/blueprint-workbench.spec.ts tests/e2e/blueprint-workspace-init.spec.ts --workers=1` 覆盖工作台交互、预览确认、撤销、全部工作区无投影、起草会话归属及加载期间的跨仓诊断。补充外来内容确认与深色主题后，`npx playwright test tests/e2e/blueprint-workspace-init.spec.ts --workers=1` 的 8 项全部通过，连同工作台的 15 项共 23 项。正常图谱的延迟响应测试固定复现诊断在加载期间泄漏的缺陷。

浏览器测试使用真实界面与会话控制器，IPC 边界模拟；未调用外部模型验证生成内容质量。1280px 浅色与 900px 深色窗口截图人工检查了空态及展开预览，自动断言覆盖按钮可达、取消后的焦点、横向溢出、错误详情默认折叠及跨工作区重置。

`npm run typecheck:strict-unused`、`npm run build:check`、`npm run i18n:check` 和 `npm run check:notes` 通过。Note 检查保留 27 条历史跨仓链接诊断，结构错误为 0。
