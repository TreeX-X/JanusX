---
schema: harness-note/1
id: b74b3c92-914f-43df-8030-682786a1bba7
kind: decision
lifecycle: implemented
created: 2026-10-04
class: architecture
tags: [mcp, terminal, knowledge, verification]
---

# 知识库 MCP 终端覆盖与真实可用性检查

## Problem

终端预设包括 Shell、Claude Code、Codex、OpenCode、Janus、Pi、DeepSeek dsh，各客户端配置格式和 MCP 能力不同。统一写 mcpServers 不能满足 VS Code 或 TOML 客户端；配置键存在也不能证明启动命令、入口路径和工具调用可用。发布入口位于 ASAR 时，系统 Node 与应用内置 Electron 的读取能力需要区分。

独立 MCP 是另一进程，不能依赖桌面启动中安装的配置回调。工程搜索与直接读取分别进入不同服务，因此五个工具都需要开关、工作区与个人隔离约束。

## Decision

ExternalMcpPanel 显示全部内置终端及 Cursor、VS Code。Claude Code、Cursor 使用 mcpServers，VS Code 使用 servers，Codex 使用 mcp_servers TOML 表，OpenCode 使用 mcp 中的 local 命令数组与 environment。Codex 尊重 CODEX_HOME；OpenCode 尊重 XDG_CONFIG_HOME 并优先更新已有 opencode.jsonc。Janus、Pi、dsh 标记接入方式未验证，Shell 说明其本身不是 MCP 客户端，不向这些类型猜写配置。

jsonc-parser 对目标属性进行编辑，保留注释和无关设置；smol-toml 解析及验证 Codex 表。TOML 仅替换目标服务器表，写后检查其他配置语义相同。无法安全定位的内联表、损坏配置或错误集合结构返回错误。写入串行化，保留旧文件备份、写前复查并原子替换；客户端外部写入没有跨进程文件锁，最后一次复查后的并发覆盖仍属限制。

注册状态区分未注册、配置一致与需要更新，已注册项可更新。服务检测通过独立进程完成握手、五工具发现和受限查询；失败说明阶段，不把服务测试等同外部客户端接入验收。复制功能提供完整启动 JSON，包括必要的环境和数据根路径。

开发入口使用当前构建目录与系统 Node；发布入口使用 app.getAppPath() 内的 out/main/knowledge-mcp.js，通过当前应用可执行文件的 ELECTRON_RUN_AS_NODE=1 模式读取 ASAR 及归档依赖，无需解包整个依赖树。注册环境固定当前知识根与配置文件路径，防止独立客户端读到另一安装的数据。

所有工具在读取前后检查磁盘配置中的知识创新开关和知识设置 enabled；配置缺失或损坏时拒绝访问。wiki_list、wiki_get、fact_get 要求明确工程 workspaceId，或显式 allowGlobal=true；个人工作区拒绝访问，直接事实读取与引用个人事实的页面均过滤。搜索继续走工程专用召回。个人设置不赋予外部导出权限，[助手界面合并](./2026-10-04-assistant-persona-layout--6e9c114d.md)不扩大导出范围。

## Alternatives considered

只保留通用启动 JSON 最省适配代码，但不能覆盖客户端格式差异或修复失效注册。为所有终端写同一结构看似统一，却会把未知能力误报为可用。显式支持矩阵保留自动配置便利，同时暴露未验证范围，代价是客户端版本变化需要维护。

将整个应用解包有利于系统 Node 读取，但扩大发布体积和维护范围；使用已随应用发布的 Electron Node 模式可读取 ASAR。该选择依赖 RunAsNode fuse 保持可用，若打包策略禁用该能力，应提供独立运行包并重新验收。

## Consequences

五种客户端配置可注册、检查并更新，三个能力未确认的终端显示真实状态。自动适配不代表所有客户端版本通过实测。直接读取的跨工作区调用必须显式授权范围，旧无参数 Wiki 列表调用需要调整。配置解析增加两个小型依赖，避免用正则处理整个 JSONC/TOML 语法。

个人数据不能因使用 fact_get 绕开工程召回隔离。每请求读取磁盘配置增加少量 I/O，但使开关变化跨进程生效。Node 模式和数据根由注册器生成；服务检测只执行该生成配置，不执行用户配置文件里的任意命令。

## Verification

2026-10-04：external-mcp.test.ts 和 mcp-client-config.test.ts 检查九项客户端状态、VS Code 格式、JSONC 注释、Codex 表与环境、OpenCode 已有 JSONC、失效路径修复及错误配置拒绝。mcp-access.test.ts 验证配置变化和损坏时拒绝；knowledge-mcp-tools.test.ts 验证五工具关闭、读取中关闭、显式跨工作区及个人事实和关联页面隔离。

独立进程命令 JANUSX_MCP_SMOKE=1 npx vitest run tests/unit/knowledge/knowledge-mcp-smoke.test.ts --reporter=verbose 通过一项：真实事实存储、私有事实隔离、工作区校验、关闭及重新开启。系统 Node 耗时 647ms；JANUSX_MCP_COMMAND 指向 Electron、JANUSX_MCP_ENTRY 指向当前构建替换后的 ASAR 测试包时同样通过，耗时 430ms。此包由已有安装归档与当前 main 输出组成，在中立目录运行；它验证 MCP 打包机制，不代表重做全部安装器验收。

隔离客户端配置实测：OpenCode 1.18.34 的 --pure mcp list 显示 connected；Claude Code 2.1.287 的 mcp list 显示 Connected；Codex 0.160.0 的 mcp get janusx-knowledge --json 正确读取命令、参数和环境，未宣称完成 Codex 会话内工具调用。VS Code、Cursor 未执行真实 UI 接入，Janus、Pi、dsh MCP 能力仍未确认。未修改真实用户客户端配置。

VS Code 官方文档 https://code.visualstudio.com/docs/copilot/customization/mcp-servers 与 OpenCode 官方文档 https://opencode.ai/docs/mcp-servers/ 支持对应配置结构。OpenAI Docs 页面读取返回 403，因此 Codex 配置依据本机 0.160.0 CLI 的 add --help 和隔离配置 get 实测核对；不把未读取文档当作证据。

全仓与界面验证结果见[助手布局决策](./2026-10-04-assistant-persona-layout--6e9c114d.md)。本机证据保存在 artifacts/memory-domain-acceptance/。配置解析依赖安装后，本地 file 依赖指向缺少内容的相邻仓库；验证使用已有 2026-10-02 安装归档恢复的本仓库 node_modules 运行文件，并从相邻仓库 HEAD 在本地依赖目录生成类型声明，运行既有补丁脚本。相邻工作区未恢复或修改，干净安装仍依赖这些外部源码可用。
