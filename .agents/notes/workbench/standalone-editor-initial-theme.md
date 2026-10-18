---
{
  "schema": "harness-note/2",
  "id": "426a6a02-88c3-4b47-9a95-4bb45e1693b4",
  "kind": "note",
  "lifecycle": "accepted",
  "created": "2026-10-18",
  "updated": "2026-10-18T10:24:38Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# 独立编辑窗口的首屏主题

文件树双击打开的编辑预览窗口原先使用固定浅色原生底色，组件挂载后才读取主题；黑色主题用户会先看到浅色窗口和加载页，再切换到黑色。

`EditorWindowManager.open` 在创建前读取持久化主题，通过共享主题注册表获得窗口底色，以隐藏状态创建窗口，首次可绘制时显示。开发 URL 与打包文件查询参数均携带主题快照。HTML 头部在样式和模块加载前设置主题标记、明暗方案与背景回退值；背景优先使用主题 CSS 变量，后续切换主题不会被启动快照锁住。渲染入口等待主题与语言初始化后才挂载 React，使加载占位和 Monaco 的首次渲染采用同一主题。

主题快照仅服务首屏，持久化配置和现有主题变更广播仍负责运行时同步。并发打开同一项目的文件仍复用一个窗口，未就绪窗口不会因第二次打开而提前显示。修复范围为独立编辑预览窗口，主窗口与独立浏览器的启动策略未调整。

## 验证

`npx vitest run tests/unit/editor-window-manager.test.ts` 共 4 项通过，覆盖浅深主题的原生底色、开发与打包启动参数、并发复用及首次绘制前隐藏。`npm run typecheck` 与 `npm run build:app` 通过。

`npx playwright test tests/e2e/editor-window-tabs.spec.ts --project=desktop --workers=1 --output=artifacts/editor-initial-theme` 通过 1 项真实 Electron 测试：将主题读取延迟 400ms，逐帧记录有内容时的主题，确认均为黑色且未出现浅色背景；检查原生背景为黑色、窗口内切换浅色后背景正常更新，并继续验证多文件标签复用、切换及窗口操作。人工核对产出的黑色编辑器截图。该测试使用构建产物，未运行安装包验收。

所涉源文件 ESLint 为 0 错误，独立编辑器保留 2 项既有 effect 依赖警告；测试文件受仓库 lint 忽略规则排除。`npm run check:notes` 为 0 错误、17 项既有外部链接诊断。
