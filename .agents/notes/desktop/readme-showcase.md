---
{
  "schema": "harness-note/2",
  "id": "7b4800da-0ea0-4f63-9f15-7ce60e721bd7",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-03",
  "class": "simplification",
  "updated": "2026-10-08T14:39:00Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/3a4dc304-70dd-49e4-b46a-ee2fc0fbc83e"
}
---

# README 演示按功能维护，共用录制与合成参数

## Problem

README 演示需要独立调整单个功能的步骤、文案与节奏。分屏脚本独有的启动和鼠标逻辑、集中存放所有字幕的 HTML，以及硬编码的本机编码工具路径，使修改一个功能时还要追踪其他入口。录制参数与 GIF 编码器的延时单位不一致，也会让预期停留时间失真。产物工作区需要在基础功能区提供可复现的真实操作演示。

## Decision

每个功能的 `record-*.mjs` 拥有示例文件、操作序列和字幕；[共享配置](../../../scripts/showcase/showcase-config.mjs) 注册唯一功能入口和输出名，集中保存主题、背景、鼠标与节奏参数。`run.mjs` 按指定功能顺序执行录制或合成，失败即停止。总览是独立入口，九项功能分别对应 README 的基础功能章节。

`record-motion.mjs` 管理连续鼠标位置，定格保留指针，移动与拖拽从上一帧衔接；点击遵循移动、悬停、点击圈、结果帧。输入通过 `insertText` 支持中文。录制辅助方法使用百分之一秒，manifest 与 GIF 编码使用毫秒，浏览器就绪等待独立于播放时间。

成功录制将字幕与帧一起写入 manifest，并更新本功能的 latest 指针。合成只读取该 manifest 和公共样式，不执行录制脚本；背景、鼠标和整体播放速度可单独重合成。字幕模板只承担样式，编码工具从系统临时目录或 `SHOWCASE_GIFTOOLS` 加载。编码器按时间线采样调色板、逐帧读取原图，避免同时保留全部 1080p 帧。

[产物脚本](../../../scripts/showcase/record-product.mjs) 使用真实文件发现、Island 提醒和预览组件，通过断言检查 HTML 交互、面板缩放后的预览、JSON 结果、多标签与磁盘重新加载。示例报告和验收数据由脚本编写，不调用模型、不复制登录凭证。成品与入口放在 [README](../../../README.md) 第 09 项基础功能。

[蓝图脚本](../../../scripts/showcase/record-blueprint.mjs) 在隔离配置中开启蓝图，以九篇 v2 文档展示项目、文件阅读、解析与提示三层模块，父层普通 Note 与子模块共存，覆盖 module、note、idea、requirement、decision、task 六种类型。单击预览原文，双击进入并保留模块自身，返回上层；关注列表与显式定位分别展示。

[本地模型](../../../scripts/showcase/blueprint-model.mjs) 通过回环 HTTP Responses 返回确定性工具调用，实际操作走 Electron、IPC 和共享 Note 服务。先执行 `note_scope`、`note_focus`，再由 `note_read`、`note_write` 原位更新阅读约定；断言身份、created、九篇文档与一个既有 Task 数量不变，updated 刷新。Task 只展示 Main-owned Handoff，未执行、无独立评估。模型服务只使用演示占位密钥，不复制登录文件或调用外部模型。

录制同时检查对话结束且没有错误卡片，成功才保存 manifest 和更新 latest。manifest 记录构建入口、JanusX 与 agentX 提交、工具序列和时间变化。`SHOWCASE_ENTRY` 可指向隔离版本构建，两个 source commit 环境变量由录制者核对；成品继续使用 `feature-blueprint-workbench`。README 明确区分真实宿主操作、本地脚本模型与示例 Task。

## Alternatives considered

- 保留现有独立脚本：每个功能可自由改动，但重复的鼠标与启动逻辑会产生不同节奏，公共字幕和绝对工具路径也增加维护成本。
- 全部放入一个录制脚本：单一入口方便共享变量，但功能步骤、选择器和示例数据互相干扰，单独修改与重录更难定位。
- 每个功能完整复制工具链：局部调节最自由，但背景、鼠标和单位修复要逐份同步。共享底层、保留功能级参数覆盖能兼顾独立调整。

## Consequences

功能脚本拥有自己的演示内容，公共风格只维护一份。代价是旧版不含字幕的 manifest 需要重录后才能使用当前合成器；已有 GIF 可继续展示。画布采用固定 1080p 排版，改变比例还需要调整背景装饰和字幕区域。应用选择器或 CLI 首屏变化时仍需维护各自脚本；共享逻辑的单测不能替代全部功能的真实录制。

验证入口为 `npm run test:showcase`，五项测试覆盖鼠标位置、点击拼接、中文输入、失败拖拽释放和延时单位。`npm run showcase -- build product` 在本机构建产物上通过真实交互断言，生成 185 帧、1920×1080 的 GIF 与 PNG；成品末帧经人工视觉检查。

当前蓝图资产基于 JanusX `dc8a6394cf1618c12bacffb95a7b9a14fc689aed` 的隔离构建和 agentX `d6cd44569eee3c36c637a996131a1303b3900bde`，使用源码相符的共享依赖。隔离构建与严格类型检查通过；`npm run showcase -- build blueprint` 通过，输出 271 帧、1920×1080、34.38 秒 GIF 和 PNG。模型恰好接收六次请求：scope、focus、回复、read、write、回复，无额外修复轮次。`npm run test:showcase` 五项通过；关键原始帧与合成末帧经视觉检查，结束状态为 IDLE。

录制中发现并修复两个真实问题：agentX 的修复判断误将领域状态当作执行失败，见其 [工程运行模块](note://62b44166-82f0-41ff-838d-e2b02388ed06/86c2d794-3be5-4807-b0fb-1f63c1baa910)；JanusX 在可选知识采集关闭时误报对话失败，见[领域控制](../knowledge/memory-domain-controls.md)。相关 29 项与 40 项测试分别通过。历史 2026-10-05 的五篇 v1 演示由本次资产替代，旧验证只说明当时行为，不能作为当前导航证据。原资产验证属于 Main 自检。独立 evaluatorX 现已在 0408046 隔离构建及 5c41e2f 共享依赖上重新完整录制与合成：271 帧、1920×1080、六次确定性请求，原位维护和文档数量断言通过，成品与关键原始帧经 reviewer 和 Main 检视。该本地验收为 PASS，原资产及历史基线保持不变。
