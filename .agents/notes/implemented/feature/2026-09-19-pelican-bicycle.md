---
schema: harness-note/1
id: 5996294e-e9e3-5408-8239-b1a8bb24b616
kind: decision
lifecycle: implemented
created: 2026-09-19
class: feature
---
# Agent Note: 鹈鹕骑行 SVG 动画

Status: implemented

## Problem

用户需要一个可独立打开的 HTML，展示 SVG 绘制的鹈鹕骑自行车。骑行需要双脚与踏板保持接触，车轮和路面移动保持一致；静态插画无法表达这些动作。

## Decision

[pelican-bicycle.html](../../../../pelican-bicycle.html) 内联 SVG、样式和原生 JavaScript，支持通过本地文件协议离线播放。单一时间轴驱动车轮、曲柄、双腿、身体起伏和分层风景。双腿按固定骨段长度计算膝盖位置，脚的位置来自相差半圈的踏板；路面速度与轮胎半径决定车轮角速度。

页面提供暂停、重播、空格键和 0.5–2 倍调速。系统要求减少动态效果时默认暂停，用户仍可主动播放。隐藏页面停止动画调度；本地存储保存播放位置和速度，存储不可用时动画仍可运行。手机视口调整 SVG 取景范围，使鹈鹕和整辆自行车保持可见。

## Alternatives considered

保留已有演示页面可以避免增加文件，但现有页面没有鹈鹕骑行动画，无法满足请求。使用独立 CSS 动画可以减少逐帧 JavaScript，但不同动作的暂停、调速和双脚跟随踏板需要额外协调。共享时间轴直接表达这些约束。

Canvas 适合大量动态图元，但本任务明确要求 SVG；SVG 也保留了可直接编辑的角色与场景路径。引入动画库能够支持更复杂的叙事，本动画的持续骑行只需要一个渲染函数。

## Consequences

交付文件不依赖服务器或远程资源，可单独复制和分享。角色几何坐标需要手动维护，后续修改车架或体型时应同步调整髋关节与踏板坐标。当前页面面向一个循环场景，复杂分镜需要重新评估时间轴结构。

Chromium 检查覆盖离线打开、自动播放、暂停、调速、重播、键盘、存储不可用和减少动态效果；10 个采样时刻的腿部骨段分别保持 69 和 85 个 SVG 单位。1440×1040 与 375×740 截图用于检查构图，手机页面没有水平溢出。静态画面可在仓库根目录通过 `npx playwright screenshot --viewport-size="1440,1040" pelican-bicycle.html artifacts/screenshots/pelican-review.png` 复查。
