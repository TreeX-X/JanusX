# 右侧 Git 提交历史增强方案

> 状态：持续实施中（本版已完成 ADE 场景所需的基础 Git 交互）  
> 范围：右侧 Git 工具面板、Git IPC、提交历史内联浏览  
> 目标版本：0.9.x 分阶段完善

## 当前功能状态

| 功能 | 状态 | 说明 |
|---|---|---|
| 提交历史悬浮预览 | 已实现 | 显示标题、hash、作者、时间、文件数、增删行数和前 5 个文件 |
| 提交节点内联展开 | 已实现 | 点击节点展开/收起修改文件，不创建独立窗口 |
| 工作区文件打开 | 已实现 | 文件名或打开图标进入编辑器 |
| 暂存/取消暂存 | 已实现 | 文件行提供独立操作按钮 |
| 放弃更改 | 已实现 | 确认后恢复已跟踪文件或删除未跟踪文件 |
| 提交文件具体 Diff | 未实现 | 当前仅显示 numstat，后续按文件内联展开 patch |
| 提交正文、邮箱、父提交、tag | 未实现 | 当前日志仍使用摘要字段 |
| 历史搜索、筛选、加载更多 | 未实现 | 保留为后续增强项 |
| 提交图谱与高级 Git 操作 | 未实现 | ADE 当前不作为必要 IDE 能力 |

## 1. 背景与问题

当前右侧 Git 面板提供分支状态、工作区变更、提交、Push 和 Pull，但提交历史仍是摘要列表，无法支撑代码审查和变更追溯。

### 1.1 当前实现

- `src/main/git/service.ts` 的 `getLog` 只读取 `%H|%h|%s|%an|%ai` 五个字段。
- `src/shared/ipc/git.ts` 的 `GitCommit` 只有 hash、shortHash、message、author、date。
- `src/renderer/src/components/GitPanel.tsx` 将提交标题单行 `truncate`，只显示短 hash、作者和相对时间。
- 主进程已经存在 `getCommitDiff(cwd, hash)`，但没有接入 Git IPC、preload、renderer store 或 GitPanel。

### 1.2 用户问题

1. 长提交标题会被截断，提交正文完全不可见。
2. 点击提交没有详情，也无法知道改了哪些文件和具体代码行。
3. 历史列表没有搜索、筛选、分页或分支关系，提交多时难以定位。
4. 提交消息使用 `|` 分隔解析，标题中包含 `|` 时可能导致字段错位。
5. 部分中文 Git 文案和符号存在编码异常，影响可读性。

## 2. 产品目标

### 2.1 核心目标

建立“提交列表 → 提交详情 → 文件列表 → Diff 内容”的完整闭环，优先解决以下两个问题：

- 用户能看到完整的提交说明。
- 用户能确认某次提交实际修改了什么。

### 2.2 非目标

首期不实现完整 Git 客户端能力，不在右侧面板中加入复杂的 rebase、交互式暂存或冲突编辑器。此类功能另立方案，避免扩大首期风险。

## 3. 目标交互

1. 用户打开 Git 面板，看到当前分支、工作区状态和提交历史。
2. 用户悬浮某条提交，左侧出现快速预览浮层，不需要点击即可扫读核心信息。
3. 用户点击提交条目后，右侧面板内展开详情（窄屏时使用抽屉或弹窗）。
4. 详情顶部显示完整标题、正文、作者、时间、完整 hash、父提交和标签。
5. 详情中显示变更统计和文件列表：状态、新增行、删除行。
6. 点击文件后查看该文件的 patch；支持复制 hash、复制路径和在编辑器中打开文件。
7. 返回列表后保留滚动位置和筛选条件。

## 4. 数据与 IPC 设计

### 4.1 扩展提交摘要

将 `GitCommit` 扩展为兼容旧字段的结构：

```ts
interface GitCommit {
  hash: string
  shortHash: string
  subject: string
  body?: string
  author: string
  email?: string
  date: string
  parents?: string[]
  refs?: string[]
}
```

`message` 可以在过渡期保留为 `subject` 的别名，避免一次性修改所有调用方。

### 4.2 新增提交详情接口

建议在 `GIT_CHANNELS` 和 `GitAPI` 中新增：

```ts
commitDetails(cwd: string, hash: string, maxBytes?: number): Promise<GitCommitDetails>
```

建议返回：

```ts
interface GitCommitDetails extends GitCommit {
  files: Array<{
    path: string
    status: 'M' | 'A' | 'D' | 'R'
    additions: number | null
    deletions: number | null
    patch?: string
    patchTruncated?: boolean
  }>
  totalAdditions: number
  totalDeletions: number
  fileCount: number
}
```

### 4.3 主进程实现要求

- 使用稳定的控制字符或 NUL 分隔符解析 `git log`，不能继续依赖未经转义的 `|`。
- 提交详情使用 `git show` / `git diff-tree` 获取 metadata、stat 和 patch。
- 对 hash 做格式校验，并确认对象是 commit，避免读取任意对象。
- 为 patch 设置 `maxBytes`，返回 `truncated` 状态，避免大提交阻塞 IPC。
- 对不存在的提交、浅克隆、空仓库和二进制文件返回明确错误或空 patch。
- 保持现有 workspace 路径校验，不允许跨工作区读取。

### 4.4 Renderer 状态

在 `useGitStore` 中增加：

- `selectedCommitHash`
- `selectedCommitDetails`
- `commitDetailsLoading`
- `fetchCommitDetails(cwd, hash)`
- `clearCommitDetails()`

详情请求应按 `cwd + hash` 缓存，避免重复点击反复执行 Git 命令；切换工作区时清空选中提交。

## 5. UI 设计

### 5.1 提交列表

- 标题最多显示两行，完整内容通过 Tooltip 或展开状态查看。
- 鼠标悬浮提交条目时，在条目左侧显示轻量预览浮层；不要求点击即可查看核心信息。
- 悬浮预览建议包含：完整提交标题、提交正文首段、作者、绝对时间、短 hash、文件数量、新增/删除行数和前 5 个变更文件。
- 悬浮浮层只承担快速浏览，不默认加载完整 patch；这样可以避免鼠标快速扫过历史时触发大量 Git 请求。
- 悬浮触发增加约 250~350ms 延迟，离开条目后延迟关闭；鼠标从条目移动到浮层时保持打开，避免闪烁。
- 浮层应限制最大高度并支持内部滚动，超出内容显示“点击查看详情”提示。
- 点击提交条目或浮层中的详情入口后，进入完整提交详情视图，展示全部文件和 Diff。
- 使用 `subject` 作为主标题，`body` 仅在详情中展示。
- 显示短 hash、作者、相对时间、文件数和增删行摘要。
- 根据 Conventional Commits 前缀显示轻量状态色：`feat`、`fix`、`refactor`、`docs`、`test`。
- 当前 HEAD、分支、tag 和 merge commit 使用明确标记。
- 增加搜索框、作者筛选、当前分支/全部分支切换。
- 首期保留 100 条默认历史，增加“加载更多”，不要一次性渲染无限列表。

### 5.2 提交详情

- 顶部显示完整 subject、body、作者、邮箱、绝对时间和 hash。
- 提供复制 hash、复制路径、返回列表按钮。
- 展示文件数量、总新增行、总删除行。
- 文件按状态分组，点击后展开 patch。
- patch 使用等宽字体和新增/删除行配色；大 patch 分段加载。
- 对二进制文件显示“二进制文件，无文本 Diff”。
- 提供“在编辑器中打开”入口，复用现有文件编辑器导航能力。

### 5.3 悬浮预览与点击详情的关系

采用“两级信息密度”设计：

| 触发方式 | 信息密度 | 主要用途 | 是否加载完整 Diff |
|---|---:|---|---|
| 鼠标悬浮 | 低到中 | 快速扫读、比较相邻提交 | 否 |
| 点击提交 | 高 | 代码审查、定位具体改动 | 是，按需加载 |

实现约束：

- 同一时间只允许一个预览浮层，切换条目时更新内容而不是叠加多个浮层。
- 首次悬浮可使用提交列表已有字段直接渲染；正文、文件统计等扩展字段应通过 `cwd + hash` 缓存请求。
- 预览请求需要可取消或忽略过期响应，避免快速移动鼠标时旧提交覆盖新提交。
- 浮层不能遮挡当前提交条目的点击区域；右侧面板空间不足时，自动改为条目上方或下方定位。
- 键盘聚焦提交条目时应触发同样的预览；按 Enter/Space 进入详情，Escape 关闭预览。
- 触摸设备没有 hover，应保持点击打开详情的行为。

### 5.4 提交前预览

在提交按钮附近增加 staged diff 预览入口，让用户在提交前确认暂存内容。该入口可以复用现有工作区 diff 能力，首期只读，不改变暂存状态。

### 5.4 可读性与国际化

- 修复 `zh-CN/git.json` 的编码异常和缺失引号问题。
- 删除源码中损坏的箭头、勾选符号，统一使用 lucide 图标或合法 Unicode。
- 新增详情、Diff、加载、空状态、错误、复制成功等 i18n key，并同步中英文 locale 与 `i18n/types.ts`。
- 日期格式根据当前语言切换，不能固定使用 `zh-CN`。

## 6. 实施序列

### Phase 0：基线与清理

1. 修复 Git 中文 locale 和 GitPanel 中的乱码符号。
2. 为 `getLog` 增加包含特殊字符、长标题和空仓库的单元测试。
3. 统一 `GitCommit.message` 与 `subject` 的兼容策略。

交付物：稳定的提交摘要数据和可读的基础面板。

实施记录：本次 xdo 已先实现提交历史悬浮快速预览：悬浮约 280ms 后在条目左侧显示 Portal 浮层，离开后延迟关闭并允许移入浮层；支持键盘聚焦触发预览。当前浮层仅使用已加载摘要字段，完整正文、文件统计和 Diff 仍留给 Phase 1 的提交详情接口。

后续实施记录：本次 xdo 已优化工作区更改列表，移除整行点击即暂存的行为。每个文件行现在提供“打开文件”“暂存/取消暂存”“放弃更改”三个独立操作；放弃更改使用确认对话框，已跟踪文件执行 `git restore`，未跟踪文件在确认后删除。相关 Git IPC、preload、store 和中英文文案已同步更新。

交互调整记录：提交历史不使用独立窗口。点击提交节点后在节点下方内联展开修改文件，并显示绿色新增行、红色删除行统计；再次点击收起。该方案复用现有右侧滚动区域和 GitPanel 状态，开发成本低于新增详情窗口，后续可在文件行上继续接入 Diff 展开。

实施记录（内联提交变更）：已新增 `git:commit-changes` IPC，根据提交 hash 返回 `git show --numstat` 的文件统计；GitPanel 点击提交节点后在节点下方异步展开文件列表，绿色显示新增行、红色显示删除行，再次点击收起。未创建独立窗口，符合 VS Code 式紧凑交互。

实施记录（悬浮预览增强）：悬浮预览现在会按需加载提交文件统计，显示文件总数、总新增/删除行数和前 5 个变更文件；超过 5 个时显示剩余数量。预览仍不加载完整 patch，并复用提交文件缓存。

### Phase 1：提交详情闭环（P0）

1. 扩展 shared Git 类型。
2. 实现安全的 `getCommitDetails` / `getCommitDiff` 封装。
3. 增加 IPC handler、preload API 和 fallback API。
4. 增加 Git store 详情状态和缓存。
5. 在 GitPanel 中实现悬浮预览、点击提交、详情视图、文件列表和 patch 展开。
6. 增加复制 hash、复制路径和返回列表操作。

验收：悬浮任意提交可看到快速预览；点击任意提交可看到完整说明、变更文件和具体 Diff；大提交不会导致界面卡死。

### Phase 2：历史可浏览性（P1）

1. 两行标题、Tooltip、文件数和增删行展示。
2. 搜索、作者筛选和当前分支/全部分支筛选。
3. “加载更多”和加载/空状态。
4. 增加 HEAD、tag、merge 标记。

验收：在 1000 条以上提交的仓库中可以按关键字和作者定位提交，切换筛选不丢失滚动位置。

### Phase 3：提交前后工作流（P1）

1. staged diff 预览。
2. 标题 + 正文提交编辑器。
3. Conventional Commits 模板。
4. 提交后自动定位新提交并刷新状态。

验收：用户能在提交前确认 staged 内容，提交完成后能立即进入新提交详情。

### Phase 4：高级 Git 导航（P2）

1. 提交图谱和分支拓扑。
2. tag/release 展示。
3. 提交间父子导航。
4. amend、revert、cherry-pick 等操作另行增加审批和确认流程。

验收：复杂分支仓库中可以理解提交关系，危险操作均有明确预览和确认。

## 7. 测试计划

### 单元测试

- `getLog` 解析 `|`、换行、中文和超长消息。
- 提交详情解析文件状态、重命名、二进制文件和 merge commit。
- hash 校验、路径校验、maxBytes 截断。
- store 的加载、缓存、切换工作区和错误状态。

### IPC/集成测试

- preload API 与主进程 handler 契约一致。
- 空仓库、无 upstream、浅克隆、大 patch 和不存在 hash。
- Git 命令失败时 renderer 能展示可读错误。

### E2E 测试

- 点击提交后打开详情。
- 展开文件 Diff、复制 hash、返回列表。
- 搜索和筛选提交。
- 移动窗口宽度下详情不遮挡主面板。

## 8. 风险与约束

- 大型二进制或生成文件会产生巨大 patch，必须限制字节数并支持截断。
- Git 输出可能包含非 UTF-8 内容，需要保留现有错误处理并避免阻塞 UI。
- merge commit 的 Diff 语义比普通提交复杂，首期可以显示 combined diff 或明确提示。
- 右侧面板宽度有限，详情应采用面板内二级视图，而不是继续堆叠信息。
- Push、Pull、revert、cherry-pick 等操作必须继续沿用现有确认和错误反馈模式。

## 9. 推荐任务拆分

1. `git-log-data`: 提交日志结构化解析和类型扩展。
2. `git-commit-details-ipc`: 提交详情、stat、patch IPC。
3. `git-details-panel`: 提交详情 UI 和 Diff 展示。
4. `git-history-navigation`: 搜索、筛选、分页和标记。
5. `git-i18n-cleanup`: locale、编码和日期本地化。
6. `git-test-coverage`: 主进程、IPC、store 和 E2E 测试。

## 10. 完成定义

当以下条件全部满足时，Phase 1 才算完成：

- 长标题和提交正文可查看，不再被不可逆截断。
- 任意提交可查看文件列表、增删统计和文本 Diff。
- patch 有大小上限，并能明确提示截断。
- 不存在的提交、空仓库和 Git 错误都有可读反馈。
- 中英文 locale 完整，中文界面无乱码。
- 单元测试、IPC 契约测试和至少一条 E2E 主流程通过。
