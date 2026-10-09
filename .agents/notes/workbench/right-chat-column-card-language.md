---
{
  "schema": "harness-note/2",
  "id": "5f33b918-b5f8-4098-980c-f6e6e174b86b",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-10-07",
  "class": "architecture",
  "updated": "2026-10-08T02:54:24.778Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# 右侧对话栏互认卡片语言与开场引导

## Problem

两处右侧对话栏的卡片语言分叉。蓝图右栏（`design/blueprint-note-graph-v11.html` 的右卡，落在 `JanusChat` 的 `minimalComposer` 与 `BlueprintMaintenancePanel`）有明确的对话卡识别：光点 Janus 头（7px 强调光点 + 字标 + 发丝线分隔）和 opencode 方框 composer（`›` 前缀 + 无边框等宽输入 + 38px 方块发送）。运行配置助手卡（`ProjectLaunchAssistant.tsx`）的顶栏是「Janus + 状态」两行叠排，输入框是圆角 textarea 加右下浮动圆头发送钮——同一产品里两张对话卡读作两套来源。运行配置四表已按 [设置与运行配置对齐分体卡片与主题令牌](./run-config-island-cards.md) 进入分体浮岛卡语言，卡面与兄弟卡一致，唯独卡内顶栏与输入框不与对话卡同构。

反向缺口在蓝图：运行配置对话以一条能力开场语作为首条助手消息入场（`editor:launcher.greeting`，左强调发丝线 + 安静文字的开场消息设计），告诉用户这个对话能做什么；蓝图会话入场时消息流为空，面板又刻意隐藏 `janus-chat-empty` 的 JANUSX 像素 banner（纯对话框纪律），进入后右栏空荡，没有任何能力说明。

## Decision

**助手卡顶栏与输入框吃蓝图右栏的对话卡语言**：运行配置助手卡顶栏是识别行——7px 强调光点 + `Janus` 字标同线（letter-spacing 0.02em），工作区状态文本靠右安静位（9px `--shell-dim`），发丝线分隔，48px 高与同排 `contextBar` 齐平。输入框是 opencode 方框 composer，度量与令牌同源于 `JanusChat` 的 `minimalComposer`：1px `--shell-border` / 4px 圆角 / `--shell-pane` 卡面，focus 走 `--shell-accent-border` 边框 + 2px `--shell-accent-soft` 光环；行内 `›` 前缀（`--shell-accent` 等宽 12px，发丝线分隔）、无边框等宽输入（12.5px，46px 起按内容长到 150px 封顶）、38px 方块发送钮内嵌行尾。发送钮仅在可发送时吃强调填充（`--shell-void` 图标压 `--shell-accent` 底），停止态与禁用态是安静描边方块。planche 加法层与岛内 composer 同料：纸面墨框、光点无辉光、朱红填充发送、墨字安静态。

**蓝图入场空态是开场引导语**：消息流为空时 `BlueprintMaintenancePanel` 经 `JanusChat` 的 `emptyState` 槽渲染一条引导语（`blueprint:maintenance.greeting`），呈现与运行配置开场消息同构（左强调发丝线 + 安静文字），文案以同样句式陈述维护对话的能力：按画布焦点带上 Note 上下文、分析节点、按说明更新 Note、撤销已写入修改。引导语纯展示：不进会话历史、不进模型上下文；首条消息落地即退场，`clear` 后归来。`emptyState` 未传时 `JanusChat` 保持 JANUSX 像素 banner 默认空态，纯对话框对 banner 的隐藏纪律不动。

**运行配置开场语保持种子消息**：该对话无持久化会话，种子首条助手消息就是它的诚实记录，清空即回到开场语，与蓝图的空态呈现殊途同归。

## Alternatives considered

- 助手卡只补开场语、顶栏与输入框维持现状 —— 最强理由是改动面最小，运行配置刚落分体浮岛（见 [设置与运行配置对齐分体卡片与主题令牌](./run-config-island-cards.md)），控件层走 `--control-h` 按钮语言是既有授权。否决原因是本次分叉恰在顶栏与输入框两处；不收编就等于在同一产品里长期养两套对话卡语言，后续对话栏越多分叉越贵。
- 引导语像运行配置一样种子成真实首条助手消息 —— 最强理由是呈现与持久完全对等。否决原因是蓝图会话是持久对话，种子消息会污染模型上下文与历史工具读数，且 `clear`/再水合会出现丢弃或重复两个方向的失真；空态槽位是纯展示的诚实表达。
- 运行配置助手整体换用 `JanusChat` —— 最强理由是 composer 只剩一份实现。否决原因是启动助手的动作管线（save/test/run/stop 回执）与消息模型和 `JanusChat` 的会话控制器不同构，为视觉对齐引入控制器适配成本大于收益。
- Do nothing / reuse 现状 —— 零成本、零回归风险。代价是两处右栏继续两套卡片语言，蓝图进入继续空荡无能力说明。

## Consequences

- **Gains**: 两处右侧对话栏共用同一识别头与同一 composer，读作同一产品的两张对话卡；蓝图进入即有开场引导语陈述能力，不再空荡；`emptyState` 槽是通用宿主接缝，后续对话宿主可复用。运行配置全部色值继续走令牌管道，planche 材性与岛内 composer 同规则（墨框、无辉光、朱红填充）。
- **Costs and limits**: opencode composer 的度量现有三处同构实现（`JanusChat` minimalComposer、设计稿、运行配置模块 CSS），composer 规格调整需三处同步，出现第四处应提取共享样式；运行配置输入随 composer 改吃等宽字，长中文请求的行密度低于原 11px 系统字；蓝图引导语是空态呈现，首条消息后即退场，与运行配置常驻种子开场语不对等，这是会话持久性的必然差异；≤980px 窄窗仍整体隐藏助手列，composer 未在窄窗目检。`promptBox` 停用 `--control-border`/`--shell-void` 输入控件令牌改吃 composer 令牌，两套控件面在本卡内以对话卡为准。
- **Verification**: `npx tsc --noEmit` 退出干净；`npx eslint src/renderer/src/components/ProjectLaunchAssistant.tsx src/renderer/src/components/janus/JanusChat.tsx src/renderer/src/components/blueprint/BlueprintMaintenancePanel.tsx` 0 error（JanusChat 圆桌中文串 5 条既有 warning 不属本次）；`npx vitest run tests/unit/planche-theme.test.ts --maxWorkers=2` 14 项通过，含钉点：`:global([data-theme='planche']) .promptBox textarea` 选择器在场、五表无色值字面量；`npx vitest run tests/unit/blueprint-maintenance-discussion.test.ts tests/unit/blueprint-maintenance-history-ui.test.ts tests/unit/blueprint-status-theme.test.ts tests/unit/assistant-ui.test.ts --maxWorkers=2` 18 项通过。桌面双主题目检、e2e `blueprint-workbench` 未运行。
