---
schema: harness-note/1
id: b69b7ec5-cbf6-4242-bd29-3b48703979c5
kind: requirement
lifecycle: proposed
created: 2026-10-04
class: feature
tags: [workflowx, onboarding, settings, janus]
---

# WorkflowX 接入放在启动与设置，蓝图只呈现结果

## Problem

WorkflowX 维护者状态（L0 无维护者 / L1 半维护者 / L2 完整）长期无处安放：蓝图画布只关心投影有无，装不下安装与版本问题；Note 质量产生于平时干活时刻（终端收尾、会话还原点、提交前），蓝图里的提醒触达不到；一直靠 Janus 事后分析补 Note 是逆流程，又贵又不准。分层不清导致生产端问题挤进消费者（蓝图），越做越重。

## Expected behavior

生产端接入归启动与设置，蓝图只呈现结果：启动时一次非阻塞检测（扫文件名与 `harness.json digest`，不解析），有缺口给一条可关闭横幅；设置页常驻“维护者”区，按工作区列状态，给 [Janus 托管] [完整 WorkflowX] 两档选择与停用；日常只在工作触点限频轻推（被关两次静默一周）。Janus 兜底退化成安全网，主力是选定的维护方式本身。

## Scope

2026-10-05 范围约束：本篇保持 proposed，以下维护者档位与提醒是待重新明确的旧方案。WorkflowX 已在 agentX 内置并默认执行，不需要提醒用户安装或开启；后续接入仅讨论项目配置和外部工具。工作区切换与蓝图初始化先行，本篇不是其前置。

旧提案范围：启动检测横幅、设置维护者区（状态、两档接入、版本、停用）、日常轻推频控。Non-goals：启动弹窗拦截、自动安装、蓝图画布内承载 WorkflowX 安装流程、一 workspace 多蓝图选择。隶属总纲：[Janus 生态 Note 链路整体优化](./2026-10-04-janus-ecosystem-note-optimization--24617149.md)；本篇排在工作区切换与初始化生成之后，具体实施范围仍待确认。

## Acceptance criteria

- [ ] AC-1: 启动检测不阻塞启动、可关闭，缺口工作区可一键跳转设置。
- [ ] AC-2: 设置页按工作区显示 L0/L1/L2 状态，支持两档接入与停用，已有配置只 merge 不覆盖。
- [ ] AC-3: 日常轻推仅出现在工作触点且限频，连续关闭后静默，不打断工作。
- [ ] AC-4: 蓝图内不出现 WorkflowX 安装流程，只呈现既定维护方式下的结果与“由谁维护”角标。
