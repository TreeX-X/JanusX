---
schema: harness-note/1
id: 62e857d3-c7c8-45ab-b173-ef59c2342df4
kind: task
lifecycle: accepted
created: 2026-09-25
class: bug-fix
tags: [note, blueprint, workbench, migration]
relations:
  - type: parent
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
  - type: implements
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
    criteria: [AC-9, AC-10]
  - type: depends-on
    target: note://972afef3-2fc7-49de-a3ee-7e041225d28c/7be391fd-20f2-4a0f-b815-fcd3da220f06
work:
  scope:
    - repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      paths: [.agents/notes/, .codex/, .claude/, scripts/, src/, tests/]
  acceptanceRefs:
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
      criterionId: AC-9
    - uri: note://972afef3-2fc7-49de-a3ee-7e041225d28c/e7c03317-8bb8-4d1d-a1b2-832be6c5a3c5
      criterionId: AC-10
  verification:
    - id: V-1
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, typecheck]
    - id: V-2
      kind: command
      required: true
      repoId: 972afef3-2fc7-49de-a3ee-7e041225d28c
      cwd: .
      program: npm
      args: [run, 'check:notes']
---

# Note 组织与蓝图工作台修复

## Scope

修复用户在 d59d9a8 基线上发现的旧文档残留、重复顶部栏、左侧详情缺席、右侧对话受挤压和节点横排问题。以 design/blueprint-note-graph-v11.html 的两条紧凑横栏与三列主体为参考，保留当前正式 Note 元数据和真实维护事务。

文档整理、工作台结构、图布局是独立实现范围；各自通过独立审查后进行整体验收。主代理维护本任务与实施计划状态，实施代理不得修改 execution 或本契约验收项。

## Acceptance criteria

- [x] AC-1: 逐文件盘点既有 Note，区分正式资产、历史资产和迁移产生的演示/测试资产；将生命周期目录中的文档迁至扁平目录，更新受影响的 Markdown 链接和代码反向引用。保留 UUID、创建日期、事实、关系和原始内容追溯，不根据文件名猜测并删除资产；.agents/.local 原有资料保留。旧正文元信息与章节规范化具有明确映射及幂等验证，历史或样例内容不能伪装为当前有效设计。
- [x] AC-2: 工作台对齐 v11：仅两条紧凑顶部横栏，主体的左侧详情、中央画布、右侧对话默认同时显示；左侧首次显示当前根节点的正式 Note 详情，选择节点后同步，折叠可恢复。工作台中不再显示多余的内部标题/操作栏。
- [x] AC-3: 右列主体为 JanusChat，输入框在视口内可见可用；消息区域独立滚动，审批、任务与审计按需展开且高度受限。保留节点上下文、流式、停止、重试、提案、应用、冲突与撤销的真实链路。
- [x] AC-4: 中央布局按显式 parent 层级确定性排列，父在子上方且居中；多根/孤立节点使用紧凑森林布局，不将所有节点铺成单行；缺失父、循环关系不崩溃、不凭标题推断语义。保留本机用户拖拽坐标和视口，提供可达的重新布局入口来修复此前保存的横排坐标。
- [x] AC-5: 定向单测、typecheck 和 Note 校验通过。Chromium fixture 在常见桌面窗口验证两条横栏、三列同时可见、实际选中详情、图的多层坐标、视口内可输入的聊天框及原有维护流程。每个实现范围由独立 evaluatorX 给出结果，最终记录实测证据及未运行项。

## Verification

Note 整理使用迁移前后 UUID/正文追溯与链接对账、重复运行预览及 npm run check:notes。布局使用父子、多根、循环、缺失父与已有坐标的单测。工作台使用实际组件 Chromium fixture 的尺寸与交互检查、截图人工核对及既有维护流程回归。npm run typecheck 验证集成接口。

## Results

2026-09-25：AC-1 至 AC-5 完成，文档迁移、图布局和完整工作台分别通过独立只读验收。固定验收契约的原始字节 SHA-256 为 11314d4e7bf640786bb13d30eb7ec3fb9fe26ca9a73196340f54d892927fc182；本节与勾选状态在验收后更新，不补造 task.execution。

全量 187 篇 Note 保留既有 UUID，其中 180 篇正式资产、3 篇历史资产、4 篇迁移样例。175 篇旧目录资产使用扁平的日期、原主题与 UUID8 文件名，13 个空旧目录清理完成。172 个 Agent Note 标题前缀与 123 个重复 Status 行被规范化；非平凡历史处置理由保留。180 篇受影响文档保存原始文件字节、正文及其哈希；父子、正式关系、创建日期和原有执行信息对账一致。

四篇迁移样例保留原 kind 和 draft 状态，并使用历史样例标题、正文提示、标签与来源记录。原样例没有正式 AC 或 work 契约；为了改成 archived 而补造这些字段会改变事实。保留历史草稿是最终处置，无待批准的归档步骤。既有 .agents/.local 内容继续保留。

迁移验收核对 215 个相对目标，60 处搬迁导致的断链全部修复；源码、脚本与测试注释中的 164 处精确 Note 引用均可解析。终端 Store 的既有坏链接按明确的 DraftCard 改名证据修复。pelican-bicycle.html 是迁移前已缺失的历史产物，校验器以固定 Note 身份报告该诊断，不将其冒充为已解析目标。27 个跨仓相对目标在本机可解析。

工作台采用两条紧凑顶部栏，默认同时显示详情、画布与 JanusChat。详情从根节点开始并随选择同步，折叠可恢复；正式字段与原文入口保留。右侧聊天占据余下高度，审批、设置、任务和历史按需展开。画布按显式 parent 构造确定性视图；多根紧凑分行，循环保留原始关系并安全断开视图边，用户坐标优先。已有横排坐标通过“恢复默认布局”确认后更新，并可撤销。

实际机器证据：图布局三份 suite 共 37 项通过；维护与 Note wiki 五份 suite 共 17 项通过；Note 迁移、组织与校验三份 suite 共 49 项通过。Chromium 工作台、维护及 wiki 共 16 项通过，另在 1440×900 与 1280×720 检查截图及几何边界。npm run typecheck、npm run build、npm run check:notes 和 npm run check:skills-sync 通过。Note gate 实际解析 187/187 文件、0 错误；重复 flatten 预览 ready/nested/blocked 均为 0。独立探针确认锁拒绝先于写入、创建/删除共享事务日志，预览前后 1133 个受保护文件字节一致。

独立审查记录为本机 .agents/.local/r6-graph-review-final-result.md、r6-ui-review-final-result.md 与 r6-note-review-final-result.md。图审查 thread 为 01a0d7ec-db50-7d03-979a-65e0a71a9e43；UI 审查进程 PID 63000 与实施进程 PID 41548 独立；Note 审查 thread 为 01a0d802-fef2-7390-9db0-ccffa5877c2c。三项均 PASS，无未解决阻断项。全量固定基线对账保留在本机验收证据中；永久测试覆盖迁移边界和实际扫描覆盖率，允许后续合法新增或更新 Note。

WorkFlowX 源规则与 JanusX、janus-agentX 的受管配置一致：新 Note 直接写入 .agents/notes/，lifecycle 由 frontmatter 表达。标准验证、三仓受管同步检查与 JanusX 43 个双端共享文件检查通过；本机模型、权限和其他非受管配置保留。

验证边界：浏览器使用当前源码、真实组件及聊天 controller，传输与事务反馈在 IPC 边界模拟；本次没有执行真实供应商或 live Electron 后端联调。先前旧构建的截图不作为本任务验收证据。
