---
{
  "schema": "harness-note/2",
  "id": "e640915e-10a0-4cf4-9bf6-9ee698302172",
  "kind": "note",
  "lifecycle": "accepted",
  "created": "2026-10-18",
  "updated": "2026-10-18T10:07:34Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c",
  "codeRefs": [
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/renderer/src/components/onboarding/OnboardingHost.tsx","symbol":"OnboardingHost","role":"entry"},
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/renderer/src/stores/onboarding.ts","symbol":"useOnboardingStore","role":"implementation"},
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"src/renderer/src/features/onboarding/model.ts","symbol":"isIntroStepSatisfied","role":"implementation"}
  ]
}
---

# 首次入门与再次学习

## 入口与课程范围

首次入门包含选择项目、启动终端、拖拽分屏和查看文件四步。它只使用本地工作区与 Shell，不要求配置模型、安装外部 AI CLI 或开启蓝图。特色功能的独立课程是后续方向，本次没有实现 Island、蓝图或运行配置课程，也不显示尚不可用的课程按钮。

App 等待工作区初始化成功与创新功能开关加载，再决定首次介绍。无项目且没有学习记录时显示可关闭的欢迎页；已有项目的用户不自动弹窗。团队登录或组织挡板出现时让出界面，关闭后再介绍。右上角、空工作区页和设置侧栏的“帮助与学习”共用同一学习中心，可开始、继续和从头重学。

## 实操与状态

导引以非模态小卡片和稳定 DOM 标记高亮目标，允许继续使用项目和终端。下一步仅在检测到实际结果时可用；跳过单独记录。项目目录显示当前工作区或 worktree，Shell 与外部 CLI、Island 配置的区别在终端步骤说明。用户自行创建的项目和终端同样可被识别，重学不自动创建资源或恢复旧布局。缺少活动项目时提供返回项目步骤的入口。

工作区步骤要求有效活动项目；终端步骤要求当前项目中有已取得 pid 且未报错的终端；分屏步骤要求两个 pane 分别包含可用项目终端，空分屏或两个标签放在同一 pane 不算完成。文件步骤接受成功加载的嵌入编辑器文件，或独立编辑器上报的成功读取事件；路径必须属于当前 scope，读取失败和不支持预览的二进制文件不算完成。

文件树通过双击打开独立编辑器。StandaloneFileEditor 在内容成功读取、切换有效标签或重新打开当前标签后发送 `editor-window:viewed`；主进程只转发已注册编辑器窗口的事件到主窗口。导引在当前挂载期间监听，不持久化文件路径或内容。用户查看独立窗口后返回主窗口推进步骤。普通模态对话框出现时暂时隐藏实操卡片；浏览器原生视图沿用遮挡租约，退出导引时释放。

本轮测试复现新项目添加后文件树为空：`chooseAndCreateWorkspace` 在切换前加载，随后 `setActiveWorkspace` 清空了旧树。现在选择函数只创建项目并失效缓存，空页面、侧栏和导引三个调用方都在激活项目后执行带 scope 守卫的树加载，避免导引进入文件步骤时无内容可学。

## 持久化与取舍

`janusx:learning:v1` 保存在当前应用 profile 的 localStorage，包含介绍标记和入门课程进度，界面开关本身不持久化。退出或重启后不强制弹出未完课程，用户从学习中心继续原步骤。再次进入会检查当前真实条件；已关闭的终端或已删除的工作区不会被当作仍可操作。

跳过和验证分开计数，只有四步全部验证才写入完成时间。重学重置本轮步骤与结果，同时保留曾完成课程的记录。损坏或未知版本数据回退到可用默认状态；存储不可用时仍能学习，但不能保证跨启动续学。后续新增独立课程应拥有独立进度与版本，不以应用版本升级为理由重置入门记录。

复用静态教程的成本更低，但无法判断用户是否完成操作；全屏强制导览容易阻断开发流程。本方案保持主动操作与明确退出，代价是用户需要在完成后手动点击下一步，且拖拽不便时只能跳过。若后续观察到分屏步骤持续难以完成，应优先补充替代交互或短演示，再增加更多入门步骤。

## 验证

`tests/unit/onboarding.test.ts` 覆盖首次介绍、退出续学、重学保留历史完成、跳过语义、损坏和不可写存储，以及终端、分屏和文件 scope 验证。`editor-viewed-ipc.test.ts` 与 `remaining-ipc-contract.test.ts` 检查已注册编辑器的事件转发、类型化桥接和取消订阅。

`tests/e2e/onboarding.spec.ts` 使用真实 App、终端布局、文件树和 StandaloneFileEditor，仅替换 IPC。覆盖拖拽分屏、独立文件窗口、终端失败重试、选目录取消、重启续学、旧项目手动进入、设置入口、跳过、团队挡板，以及浅深色主题 800×480 的布局、键盘焦点和遮挡租约释放。浏览器测试的窗口事件通过测试边界转发；这不替代打包安装版或真实 PTY 的整套验收。

最终验证：`npx vitest run tests/unit/onboarding.test.ts tests/unit/editor-viewed-ipc.test.ts tests/unit/editor-window-manager.test.ts tests/unit/remaining-ipc-contract.test.ts tests/unit/editor-tabs.test.ts tests/unit/workspace-pane.test.ts tests/unit/file-tree-load-pressure.test.ts tests/unit/file-tree-refresh-pressure.test.ts` 共 8 个文件、60 项通过。`npx playwright test tests/e2e/onboarding.spec.ts --project=island --workers=1 --output=artifacts/onboarding` 共 7 项通过，含实际鼠标拖拽；运行时将 `JANUS_E2E_PORT` 设为 `47983`、`NO_PROXY` 设为 `127.0.0.1,localhost`，避免继承本机代理后被误判为端口占用。已检查浅深色截图，矮窗欢迎页固定操作区、实操卡片为侧栏标题和标签条留出操作空间。

`npm run typecheck`、`npm run typecheck:strict-unused`、`npm run build:check`、`npm run i18n:check` 与 `npm run check:notes` 通过。Note 校验为 0 错误，另保留 17 项既有外部链接诊断。新增导引代码 ESLint 为 0 错误、0 警告；所涉独立编辑器有 2 条既有依赖警告。`npm run theme:check` 的 CSS 生成比对通过，审计仍报告 21 项既有问题，涉及关于页、蓝图、CPA、Island 和用量统计，未修改这些无关样式。未运行安装包实机或真实 PTY 的端到端验收。
