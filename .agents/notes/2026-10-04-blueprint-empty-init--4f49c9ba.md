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

如果蓝图切换器只枚举成功解析出的投影，未初始化和读取失败的工作区就会消失。活动工作区没有投影时回退到其他工作区，还会让画布内容与项目上下文不一致。空工作区需要可执行的初始化或起草入口，解析失败则需要诊断和重试。

## Expected behavior

工作台和内嵌蓝图统一枚举 Janus 已添加的工作区，以工作区 ID 选择当前项，蓝图状态作为副标。选择同步活动工作区，随后加载该工作区的投影或空态；空态和失败均不回退到其他工作区。较早请求晚返回时不得覆盖当前选择。同一工作区刷新保留当前画布，切换工作区立即清除旧内容。

未初始化的工作区提供“初始化蓝图”，先展示全部新增文件，再由用户确认写入 `.agents/harness.json` 与一份 initiative 草稿。已有配置但没有 Note 的工作区提供“让 Janus 起草蓝图”：在该工作区的项目会话中读取源文件，展示逐条 Note 提案，用户确认后通过已有 Note 写入链路保存选中的 draft。生成入口本身发出只读请求，要求来源依据、未勾选验收项和完整正文。只有无效 Note 或身份配置异常时显示诊断，不提供初始化覆盖入口；读取失败显示原因和重试。

通用文件生成、身份保护和撤销使用 agentX 的 `previewHarnessInit/applyHarnessInit/undoHarnessInit`。Janus 持有预览令牌、提供界面和会话入口。令牌绑定窗口与工作区，正文不作为确认参数重新传入。外来 `.agents` 内容需额外确认保留。撤销只删除初始化生成且未经修改的文件；存在其他 Note 时，共享撤销接口保守拒绝。撤销凭据在当前窗口保留，可跨工作区切换及蓝图面板开关使用，窗口重载或 24 小时到期后不恢复。

## Scope

范围包括工作区切换、每工作区状态、初始化预览与撤销、只读起草请求和失败诊断。打开工作区不自动初始化；不包含启动催促、设置接入档位、外部工具配置安装、一工作区多蓝图选择或任意旧格式迁移。WorkflowX 在 agentX 内置并默认执行，项目数据初始化不以设置接入为前置。

本篇是[整体优化](./2026-10-04-janus-ecosystem-note-optimization--24617149.md)的第 2 步，依赖[共享底座](./2026-10-04-agentx-harness-inheritance--bd7fd0c6.md)。布局保存、已有 Note 对话写入和跨仓依赖刷新继续复用原有链路。

## Acceptance criteria

- [x] AC-1: 未初始化、已初始化但空、仅无效 Note 分别展示原因与初始化、起草或修复入口。
- [x] AC-2: 初始化仅新增最小文件集、幂等且有受保护的撤销，已有 `harness.json` 不覆盖，`foreign` 状态需额外确认。
- [x] AC-3: 初始化模板为 draft；起草入口发送只读提案请求，要求逐条确认后保存 draft、验收项未勾选，入口不直接写入生成内容。
- [x] AC-4: 失败原因透传界面；无投影时由 `BlueprintWorkspaceSetup` 保留工作区名称、状态、诊断和操作出口。
- [x] AC-5: 两个切换器的数据源均为工作区列表，无投影时可选，选择同步活动工作区并加载其投影或空态。
- [x] AC-6: 状态表以工作区 ID 存储 ok/empty/not-found/foreign/invalid/error，当前项按 ID 判定；旧请求不得覆盖新选择。

## Verification

2026-10-05：`tests/unit/blueprint-workspace-init.test.ts` 使用真实临时目录覆盖预览无写入、草稿投影、幂等、已有身份保护、诊断、外来内容确认、令牌作用域、冲突与撤销。`tests/unit/blueprint-workspace-selection.test.ts` 覆盖工作区完整列表、空态选择、状态与投影竞态、读取失败和后台状态更新。

`npx vitest run tests/unit/blueprint-workspace-init.test.ts tests/unit/blueprint-workspace-selection.test.ts tests/unit/note-refresh.test.ts tests/unit/note-watch-startup.test.ts tests/unit/harness-ipc-contract.test.ts tests/unit/harness-service.test.ts tests/unit/note-chat.test.ts tests/unit/blueprint-maintenance-scope-ui.test.ts --maxWorkers=1 --minWorkers=1`：64 项通过。

`npx playwright test tests/e2e/blueprint-workbench.spec.ts tests/e2e/blueprint-workspace-init.spec.ts --workers=1`：19 项通过，覆盖两种窗口尺寸的现有工作台交互，以及新增预览确认、撤销、错误状态、全部工作区无投影和起草会话归属。浏览器测试使用真实界面与会话控制器，IPC 边界模拟；未调用外部模型验证生成内容质量。

`npm run typecheck:strict-unused`、`npm run build:check`、`npm run i18n:check` 和 `npm run check:notes` 通过。Note 检查保留 27 条历史跨仓链接诊断，结构错误为 0。
