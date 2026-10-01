---
schema: harness-note/1
id: b28d07a3-bc27-4be1-9868-87849e9efb16
kind: decision
lifecycle: draft
created: 2026-09-30
class: feature
tags: [dsh, terminal, external-cli]
---

# DSH 接入调研

## Problem

DeepSeek Harness（DSH）官方只提供 Web UI 与 headless 模式，无原生 TUI；JanusX 需要一个多 CLI 通用的壳侧接入方案，把 DSH 作为外部工具收进终端面板，与 claude/codex/opencode 同等对待。

## 目标
将 DeepSeek Harness (DSH) 作为外部工具接入 JanusX，类似 claude/codex/opencode。

## 背景
- DSH 官方只提供 Web UI 和 headless 模式，无原生 TUI
- 社区有第三方 TUI 插件（dsh-tui、nexlineai/dsh-tui），通过 `dsh --profile tui` 启动
- JanusX 现有外部工具机制：PTY 终端 + headless 子进程，UI 自动渲染

## 接入方案：PTY 终端预设

### 需要改动的文件
1. **`src/main/external-cli/tool-registry.ts`** — 加 `dsh` descriptor
   - `id: 'dsh'`
   - `displayName: 'DeepSeek Harness'`
   - `binaryNames: ['dsh']`
   - `npmPackage: '@deepseek-ai/dsh'`
   - `manualInstallCommand`: 包含 TUI 插件安装步骤

2. **`src/shared/terminalLaunch.ts`** — 加 `dsh` 预设
   - 命令: `dsh`
   - args: `['--profile', 'tui']`

3. **类型扩展** — 在以下 union type 中加入 `'dsh'`：
   - `ExternalCliToolId`（`src/shared/ipc/external-cli.ts`）
   - `CompanionEngine`（`src/main/companion/session-state.ts`）
   - `TerminalPreset`（`src/shared/terminalLaunch.ts`）

### UI 自动适配
- `TerminalSelector.tsx` — 自动渲染新卡片
- `TerminalPresetCapsule`（TerminalArea.tsx）— 自动出现在 "+" 菜单
- `ExternalCliManager.tsx` — 自动出现在设置面板

### 设置界面集成
- `ExternalCliManager.tsx` 自动渲染 DSH 行，显示安装状态（not-installed / ready）
- 安装流程与 claude/codex 一致：检测 `dsh` 二进制 → 显示安装按钮 → 执行 `npm i -g @deepseek-ai/dsh`
- TUI 插件安装作为 `manualInstallCommand` 展示给用户手动执行：
  ```bash
  dsh plugin --profile tui add @dsh-tui/dsh-tui
  ```
- 可选：检测 TUI 插件是否已安装（`dsh --profile tui --version` 或检查 profile 目录），未安装时显示提示

## 注意事项
- TUI 插件安装需手动完成，JanusX 只负责启动 `dsh --profile tui`
- DSH TUI 基于 React/Ink，在 xterm.js 中渲染兼容性需实测
- headless 模式（`dsh --profile headless "job"`）暂不接入，如需后台任务运行需额外写 DshParser

## 状态
- [ ] 待开发
