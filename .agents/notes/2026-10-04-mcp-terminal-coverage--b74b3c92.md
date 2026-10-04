---
schema: harness-note/1
id: b74b3c92-914f-43df-8030-682786a1bba7
kind: decision
lifecycle: proposed
created: 2026-10-04
class: architecture
tags: [mcp, terminal, knowledge, verification]
---

# 知识库 MCP 终端覆盖与真实可用性检查

## Problem

知识库外部 MCP 注册仅支持 Cursor、VS Code、Claude Code，而终端预设包括 Shell、Claude Code、Codex、OpenCode、Janus、Pi、DeepSeek dsh。知识库导出缺少 Codex、OpenCode、Janus、Pi、dsh 注册适配；是否能接入仍需按对应客户端版本核实。Shell 本身不是 MCP 客户端。Office 有单独的 Codex MCP 配置能力，不能据此判断知识库已覆盖 Codex。

external-mcp.ts 为所有客户端写 mcpServers；VS Code 原生 MCP 使用 servers，现有测试也沿用 mcpServers，尚无真实客户端验收。发布包注册入口指向 app.asar.unpacked/out/main/knowledge-mcp.js，但 electron-builder.yml 仅显式解包 node-pty，入口与打包策略不一致。注册结果只证明配置键存在，没有检查 Node 环境、路径更新、握手或工具调用；界面还禁用已注册项，缺少失效配置修复路径。

独立 knowledge-mcp.ts 仅创建 stdio 服务，没有安装桌面 IPC 启动时的领域控制策略；关闭知识库后外部 MCP 是否停止访问不能依赖桌面进程中的配置回调。五个工具为 knowledge_search、knowledge_context、wiki_list、wiki_get、fact_get，覆盖基本工程只读查询，但列表、直接读取、搜索的工作区与个人数据隔离均需独立验证。

## Proposal

先修复客户端配置格式、独立进程开关语义和发布包可启动性，再按终端清单补齐支持矩阵。每个客户端声明对应版本、配置位置、格式、启动方式与实测状态；不支持或未验证的客户端明确显示原因。普通 Shell 提供可复制启动命令，不能显示为已接入客户端。

区分配置已写入、服务可启动、握手成功、工具调用成功；允许检查和修复旧配置，写入时保留无关设置。开发与发布环境均验证启动入口及其依赖，避免要求安装包用户执行仓库构建。针对配置带注释、权限失败、无 Node、客户端缺失和失效路径提供明确结果。

工程 MCP 保持个人数据默认不对外开放；界面合并不改变导出范围。个人导出如有需求，应另行定义明确授权与工具边界。相关 UI 方向见[助手与画像布局提议](./2026-10-04-assistant-persona-layout--6e9c114d.md)。

## Alternatives considered

维持已有三种注册适配成本最低，但无法覆盖产品内置终端，也不能解决现有格式和发布入口问题。仅提供通用 JSON 便于快速接入，却把各客户端格式差异交给用户，不能视为完整覆盖。按客户端提供适配与握手检查维护成本更高，但能区分配置存在与实际可用；对于无稳定 MCP 支持的终端应提供手动指引或明确不支持。

## Acceptance criteria

- [ ] AC-1：知识库接入状态覆盖所有内置终端类型，并区分自动适配、手动接入、不支持和未验证。
- [ ] AC-2：VS Code、Cursor、Claude Code 及新增适配按各自格式保留已有配置，失效注册可修复。
- [ ] AC-3：安装包在中立工作目录启动 MCP 并完成握手、列工具和查询，依赖与路径可用。
- [ ] AC-4：独立 MCP 进程的启停开关生效；五个工具均检查个人隔离、工作区范围、遗忘与撤回边界。
- [ ] AC-5：每个声明支持的客户端均有真实调用证据；仅文件写入或替身测试通过不能宣告接入验收通过。

## Risks

客户端格式与 CLI 支持会随版本变化，须记录验证版本。跨进程设置读取需要明确定义更新时机。发布包中可被系统 Node 执行的入口及依赖需要单独打包验证。

## Verification

2026-10-04 静态依据：src/main/terminal/presets.ts、src/main/knowledge/external-mcp.ts、knowledge-mcp.ts、knowledge-mcp-tools.ts、src/main/office/office-project-rules.ts、electron-builder.yml。相关基线测试结果见[助手布局提议](./2026-10-04-assistant-persona-layout--6e9c114d.md)；未执行真实外部客户端握手或发布包导出验收。本 Note 记录发现与后续验收条件，不声明缺口已经修复。
