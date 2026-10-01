---
schema: harness-note/1
id: b28d07a3-bc27-4be1-9868-87849e9efb16
kind: decision
lifecycle: active
created: 2026-09-30
updated: 2026-10-01
class: feature
tags: [dsh, terminal, external-cli]
---

# DSH 接入实施方案

## 目标
将 DeepSeek Harness (DSH) 作为外部工具接入 JanusX，类似 claude/codex/opencode。

## 背景
- DSH 官方只提供 Web UI 和 headless 模式，无原生 TUI
- TUI 选用 ccch1mneyyy/dsh-TUI（`@deepseek-harness-tui/dsh-tui`），通过 `dsh --profile dsh-tui` 启动
- JanusX 现有外部工具机制：PTY 终端 + headless 子进程，UI 自动渲染

## 创新功能规划

### 第一阶段：基础接入（PTY 终端）
- DSH 作为外部 CLI 工具注册
- 终端预设 `dsh --profile dsh-tui`
- 设置面板显示安装状态

### 第二阶段：状态感知（Hook 管线）
- DSH TUI 输出解析（类似 janus/pi 的 PTY 解析）
- 运行状态显示：running / wait / needs-approval / degraded / error
- 灵动岛通知集成

### 第三阶段：上下文识别 + 用量统计
- 历史扫描（~/.dsh/ 目录）
- PTY 文本解析（模型检测、用量行）
- 会话绑定与用量统计
- **关键修复**：解决现有终端统计缺陷（见下方"用量统计修复"）

### 第四阶段：高级功能
- headless 模式后台任务
- 多 Agent 并行（worktree 隔离）
- 模型配置同步

---

## 第一阶段实施方案：基础接入

> 已落地（2026-09-30）：union 类型（external-cli/terminalLaunch/companion）、tool-registry
> （`@deepseek-ai/dsh` + `manualInstallCommand` 新 TUI 口径）、终端预设 `dsh --profile dsh-tui`、
> UI（TerminalSelector/TerminalArea/ExternalCliManager 自动行/Sidebar/Blueprint）、官方鲸鱼图标
> （双路径旧文件已清理，以 `src/renderer/src/assets/icons/dsh.svg` 为准）+ 品牌色 `#4D6BFE`、
> hook 管理器 dsh no-op（不再误装 opencode 插件）、i18n（`terminal:provider.dsh`、
> `settings.cliTools.tools.dsh` 中英）。另修：`TERMINAL_FILE_META.dsh=null`（dsh 无外部模型文件）。

### 1. 类型扩展（3 处 union type）

#### `src/shared/ipc/external-cli.ts`
```typescript
export type ExternalCliToolId = 'claude' | 'codex' | 'opencode' | 'pi' | 'janus' | 'dsh'
export const EXTERNAL_CLI_TOOL_ORDER: readonly ExternalCliToolId[] = ['janus', 'claude', 'codex', 'opencode', 'pi', 'dsh']
```

#### `src/shared/terminalLaunch.ts`
```typescript
export type TerminalPreset = 'shell' | 'claude' | 'codex' | 'opencode' | 'janus' | 'pi' | 'dsh'
```

#### `src/main/companion/session-state.ts`
```typescript
export type CompanionEngine = 'claude' | 'codex' | 'opencode' | 'janus' | 'pi' | 'dsh'
```

### 2. 工具注册

#### `src/main/external-cli/tool-registry.ts`
```typescript
export const EXTERNAL_CLI_TOOLS: Record<ExternalCliToolId, ExternalCliToolDescriptor> = {
  // ... existing tools
  dsh: {
    id: 'dsh',
    displayName: 'DeepSeek Harness',
    binaryNames: ['dsh'],
    npmPackage: '@deepseek-ai/dsh',
    manualInstallCommand: 'npm i -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui && dsh-tui',
    latestStrategy: 'npm-dist-tags',
  },
}
```

### 3. 终端预设

#### `src/shared/terminalLaunch.ts`
```typescript
export const TERMINAL_PRESET_META: Record<TerminalPreset, TerminalPresetMeta> = {
  // ... existing presets
  dsh: {
    name: 'dsh',
    label: 'DeepSeek',
    command: 'dsh',
    args: ['--profile', 'dsh-tui'],
  },
}
```
TUI 选用 ccch1mneyyy/dsh-TUI（`@deepseek-harness-tui/dsh-tui`，官方公众号收录，主兼容 DSH `0.2.0-rc.2`），
profile 名固定为 `dsh-tui`，与 `dsh-tui` 启动器等效（`dsh --profile dsh-tui`）。

### 4. UI 组件适配

#### `src/renderer/src/components/TerminalSelector.tsx`
- 在 `ICONS` Record 中添加 `dsh: dshIcon`
- 在预设数组中添加 `'dsh'`

#### `src/renderer/src/components/TerminalArea.tsx`
- 在 `PRESETS` 数组中添加 `createPreset('dsh')`

#### `src/renderer/src/components/ExternalCliManager.tsx`
- 自动渲染 DSH 行（通过 `EXTERNAL_CLI_TOOL_ORDER` 遍历）

### 5. 图标资源

#### `src/renderer/src/lib/cli-tool-icons.ts`
```typescript
export const EXTERNAL_CLI_TOOL_ICONS: Record<ExternalCliToolId, string> = {
  // ... existing icons
  dsh: dshIcon, // DeepSeek 官方鲸鱼图标，品牌色 #4D6BFE
}
```

#### `src/renderer/src/assets/icons/`
- `dsh.svg` 为官方图标（`src/assets/` 下的重复副本已删除，无任何引用）

### 6. 设置面板

#### `src/renderer/src/components/ExternalCliManager.tsx`
- 自动显示 DSH 行，状态检测逻辑复用现有 `CliDetector`
- 安装流程：`npm i -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`，然后运行一次 `dsh-tui` 自举 profile
- TUI 插件安装作为 `manualInstallCommand` 展示

### 7. Companion 集成

#### `src/main/companion/session-state.ts`
- `CompanionEngine` 类型已扩展
- `terminal-handlers.ts` 中解除 DSH 短路（类似 janus/pi 的处理）

---

## 第二阶段实施方案：状态感知

> 已落地（2026-09-30，针对 ccch1mneyyy/dsh-TUI 实测输出）：`runtime-telemetry.ts` 新增
> `DSH_STATUS_MODEL_PATTERN`（`<model> · Max effort` 锚定，`detectModelFromText` 精确识别）、
> `extractDshTurnStatus`（`模型醒了`→running，`turn error`→degraded，只断言正向状态、
> 永不推断 idle），`CLITerminal.writeLiveOutput` 仅对 dsh 预设应用状态（不同值才写，
> 不覆盖 needs-approval/needs-input/error），`getEstimatedContextWindow` 补 `dsh: 128_000`。
> 单测见 `tests/unit/runtime-telemetry.test.ts`（dsh 4 例）。
> 待后续（需配 key 的真实会话）：成功结束标记、approval/questionnaire 面板信号、
> context/tokens 数值解析（`statusBar.tokens/tps` 默认关闭，`contextUsage/contextBar` 需非零样本定格式）。

### 1. PTY 输出解析

#### `src/renderer/src/lib/runtime-telemetry.ts`
- 添加 DSH TUI 输出解析器
- 检测模型行、用量行、状态指示器

### 2. Hook 管线（可选）

#### `src/main/external-cli/terminal-handlers.ts`
- 如果 DSH 支持 hook 事件，接入 `AgentHookCoordinator`
- 否则维持 PTY 文本解析方案

### 3. 灵动岛通知

> 不适用：现架构 agent 通知走 hook→toast/侧栏通用链路，无按引擎投影函数；
> dsh 无 hook，故无 turn 通知（状态灯见 Phase 2 的 PTY 方案）。

#### `src/renderer/src/components/janus/islandNotifications.ts`
- ~~添加 `dshNotification` 投影函数~~（设计已变更，无需）
- ~~注册到 `assembleNotifications`~~

---

## 第三阶段实施方案：上下文识别

> 已落地（2026-09-30，针对 0.2.0 + dsh-TUI 磁盘结构实测）：`history.ts` 接入 dsh 预设——
> 无 sessionId 走 `readDshBootstrapTelemetry`（`~/.dsh-tui/model-recents.json` 首项，
> 回退 composed 默认 `deepseek-flash`，deepseek 系窗口 128k，source configuration/declared）；
> 有 sessionId 走 `scanDshHistory`（`~/.dsh/sessions/<workspace-key>/<uuid>/` 精确 cwd 目录，
> key 形如 `--C-Users-…-JanusX-dsh--`，id 子串 + mtime 过滤，返回 id/path/recency）。
> 约束：日志是 `session.v4.jsonl.zstd`（无解码器，只绑定不读用量）；pid→session 挂载匹配不可行
> （conpty 中间层 pid 与 `session-mounts.json` 内层 pid 不一致）；无 hook 故终端永不自动绑定，
> 扫描仅在外部传入 sessionId 时生效。单测见 `runtime-telemetry-history.test.ts`（dsh 3 例）。

### 1. 历史扫描

#### `src/main/runtime-telemetry/history.ts`
- 添加 DSH preset 的声明模型解析
- 扫描 `~/.dsh/` 目录下的会话历史

### 2. 会话绑定

#### `src/main/runtime-telemetry/history.ts`
- 为 DSH 添加会话文件匹配逻辑
- 绑定 conversationId 到终端

---

## 第四阶段实施方案：高级功能

> 已落地（2026-09-30，针对 dsh 0.2.0-rc.2 实测 `--json` 协议）：
> - Headless：`parsers/dsh-parser.ts`（`DshParser`：text→text-chunk、thinking→phase、
>   tool_call/tool_result→tool-start/end、turn_end error→error；final/session 忽略，
>   close 接管 done），注册进 `createParser`，`stream-manager.buildArgs` 走
>   `dsh --profile headless --json <prompt>`（model/approval 归 profile，无透传 flag）。
> - 多 Agent 并行：worktree 隔离与引擎无关（`activePaths`→ 终端 cwd），dsh 零改动直接生效。
> - 模型配置同步：**不做**——dsh 无外部模型文件（bundle 默认 + TUI 内 `/model` 会话 fork；
>   `cordis.patch.yml` 是 !!js YAML，不可 surgical 投影）。`TERMINAL_FILE_META.dsh=null`
>  （设置页 Live 行隐藏，与 janus 一致），`terminalModelUnsupported('dsh')` 给出指向性文案。
>   模型感知已由 Phase 2/3（状态栏 + bootstrap）覆盖。

### 1. Headless 模式

#### `src/main/janus-runner/parsers/dsh-parser.ts`（新建，已落地）
- 实现 `DshParser` 解析 headless `--json` 输出
- 注册到 `createParser`（headless 子进程统一入口，非 ExternalCliService）

### 2. 多 Agent 并行

- 依赖 worktree 隔离机制（已有 note：`2026-09-19-worktree-isolation-parallel-agents`）
- DSH 终端在独立 worktree 中运行

### 3. 模型配置同步

#### `src/main/external-cli/terminal-projectors.ts`
- 添加 DSH model 配置投影
- 支持 JSON 格式的配置文件

---

## 用量统计修复（关键）

> 2026-09-30 决策：暂不做。dsh 侧感知已用锚定识别规避散文误判（Phase 2）；
> 通用累加逻辑与 `UsageStatsPanel.tsx` 属全引擎改动，需独立任务验证，不随 dsh 合并。

### 问题现状
目前所有终端类型（claude/codex/opencode/janus/pi）的统计方法存在缺陷：
- **模型检测错误**：PTY 文本解析容易误判模型（如把散文中的 `model` 当作模型声明）
- **上下文不积累**：用量数据没有正确累加，导致上下文窗口显示始终为 0 或初始值

### 修复方向
1. **DSH 上下文检测时同步解决**：在实现 DSH 的 PTY 解析时，修复通用的用量统计逻辑
2. **统一用量统计功能**：参考 ccs（Claude Code Settings）的设计，在设置面板中做一个全局的用量统计功能
   - 跨终端类型聚合用量数据
   - 显示历史累计 token 消耗
   - 支持按时间范围筛选（今日/本周/本月）

### 实现要点
- 修复 `src/renderer/src/lib/runtime-telemetry.ts` 中的用量累加逻辑
- 新增设置面板组件 `UsageStatsPanel.tsx`
- 数据源：各终端的 PTY 解析结果 + 历史文件扫描

---

## 注意事项
- TUI 插件安装需手动完成，JanusX 只负责启动 `dsh --profile dsh-tui`
- DSH TUI 基于 React/Ink，在 xterm.js 中渲染兼容性需实测
- headless 已接入：`dsh --profile headless --json` 经 `DshParser` 进后台任务流
- DSH 的 npm 包名和 TUI 插件包名已验证：`@deepseek-ai/dsh` + `@deepseek-harness-tui/dsh-tui`
- **已验证可用的版本组合（2026-09-30，Windows + node-pty 实测 TUI 点亮，当前推荐）**：
  - `npm i -g @deepseek-ai/dsh @deepseek-harness-tui/dsh-tui`（dsh 为 `0.2.0-rc.2`，TUI launcher `0.12.0`）
  - 运行一次 `dsh-tui` 自举 `dsh-tui` profile（需 pnpm，缺构建脚本时按提示补 `allowBuilds`）
  - JanusX 启动 `dsh --profile dsh-tui`，与 `dsh-tui` 等效，实测渲染会话管理全 UI
- 旧路线（`@dsh-tui/dsh-tui@0.1.2` + `tui` profile）已废弃：其 peer 只到 `0.1.0-rc.6`，
  在 `0.2.0-rc.2` 下全部插件被 disable；降级到 `0.1.0-rc.8` 又会撞上
  `cordis-plugin-hmr@1.0.19` 删除 `registerConfig` 导致 boot 崩溃（1.0.16 才有）。
  如需复现旧 profile：`dsh@0.1.0-rc.8` + hmr 手工 pin 回 1.0.16。

## 验证清单
- [x] `npm run typecheck` 通过
- [ ] `npm run test:unit` 通过（全量有 9 个 pre-existing 失败套件：theme/yaml，与 dsh 无关；dsh 相关单测全过）
- [ ] 终端选择器显示 DSH 卡片（代码就绪，需启动 App 目检）
- [ ] 设置面板显示 DSH 行（代码就绪，需启动 App 目检）
- [x] `dsh --profile dsh-tui` 能正常启动（node-pty 实测渲染会话管理全 UI）
- [x] 安装流程正常工作（本机 `npm i -g` + `dsh-tui` 自举 + `dsh plugin add` 全走通）

## 状态
- [x] 第一阶段：基础接入
- [x] 第二阶段：状态感知
- [x] 第三阶段：上下文识别
- [x] 第四阶段：高级功能

---

## 合并记录（2026-10-01，main）

- `feature/dsh-integration`（5630594）已合并到 `main`，6 处冲突按新架构取舍：
  - `Sidebar/TerminalArea/TerminalSelector`：保留 `TerminalPresetIcon` 共享图标入口，dsh 只加预设列表与 `provider.dsh` 文案，不回退旧直引图标表。
  - `BlueprintCanvas`：main 已移除终端预设创建区，dsh 侧旧 `TERMINAL_PRESETS` 块直接丢弃。
  - `agent-hook-config.test.ts`：保留 main 新增的 Windows runner 3 例 + dsh hook-less 1 例。
- 终端类型补齐（dsh 分支遗漏、main 新增架构要求）：
  - `TerminalPresetIcon` 加 `dsh.svg`（否则全站 dsh 显示空白）。
  - `shared/office.ts` `TERMINAL_PRESETS` 运行时集合加 `dsh`（类型早有，校验无）。
  - `shared/ipc/terminal.ts` `TerminalWarmupRequest.engines` / `TerminalCreatedEvent.preset` 加 `dsh`。
  - `BlueprintActionBar.DISPATCH_PRESETS` 加 `dsh`；`SessionPanel.sessionEnginePreset` 接纳 `dsh`。
  - `history.ts inferDeclaredContextWindow` 类型接纳 `dsh`；`companion/gateway.ts` 注释同步 `janus/pi/dsh` 均为本地状态、永不远控。
  - 外部包 `@janus-agent/agent-core` 的 `CheckpointEngine` 需含 `dsh` 才能过 `typecheck`：
    源码（`../janus-agentX/packages/agent-core/src/shared/ipc/checkpoint.ts`）已有未提交的 dsh 扩展，
    本次仅把其构建产物同步进 `JanusX/node_modules` 副本，未改 sibling 仓库；其提交需在 janus-agentX 侧单独落。
- 验证：`npm run typecheck` 通过；dsh 相关 6 套件 105 例全过
 （runtime-telemetry / history / dsh-parser / agent-hook-config / tool-matrix / terminal-projectors）。

## 模型识别与上下文识别优化（2026-10-01，随合并实施）

针对本文“用量统计修复”所述两缺陷实施的最小安全加固：

1. **模型误判**（散文 `model` 被当作模型声明）：
   - `detectModelFromText` 的显式 `model[:=]xxx` / `--model xxx` 分支此前无合理性校验，
     `model: the behavior` 会返回 `the`。现统一走 `isPlausibleModelId`（单 token + 版本/分隔符 hint），
     不通过则继续尝试锚定与宽松模式。
   - 宽松 `MODEL_PATTERNS`（裸 `opus`/`codex`/`o1` 等）同样加门：散文提及不再成为模型声明；
     真实 id（如 `gpt-5-codex`、`deepseek-chat`）均含数字或分隔符，不受影响。
   - dsh 状态栏模式保持 `· effort` 锚定 + 合理性校验，已有单测覆盖散文排除。

2. **上下文误累积/误解析**：
   - `extractExplicitContext` 的 `used/window` 分数此前无量级校验，`tokens 5/10` 类帮助文本会成为遥测。
     现要求窗口具备真实量级（4k..10M）且 `used <= window`，否则丢弃该分数。
   - `parseTokenAmount` 本就拒绝 0/负数；dsh turn 头的 `3.2k tokens` 因无 `ctx/context` 锚定，
     本就不进入上下文（属单轮用量而非窗口），保持忽略是正确的。
   - 合并侧 `mergeRuntimeTelemetrySnapshot` 的累积语义（`next >= previous`、低置信不覆盖高置信、
     会话切换清零）保持不变，本次不改。

3. **dsh 历史扫描精度**：
   - `scanDshHistory` 由“子串 + mtime 取最新”改为 exact-UUID 优先：全等匹配有结果时忽略前缀碰撞，
     无全等才回退子串（兼容 8 位前缀调用与既有单测）。
   - 新增 `resolveDshWorkspaceDir`：workspace key 先精确匹配，缺失时对 `~/.dsh/sessions` 做
     大小写不敏感回退（Windows 检出大小写漂移时仍能绑定）。

未做（仍需真实 keyed 会话样本，绝不臆测格式）：
- dsh 成功结束标记、approval/questionnaire 面板信号、`statusBar.tokens/tps` 与
  `contextUsage/contextBar` 的数值解析；
- 跨引擎全局 `UsageStatsPanel`（全引擎改动，需独立任务验证）。
