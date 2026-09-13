# Agent Note: 灵动岛运行态/一级展开/通知面高保真对齐（hifi Optimized）

Status: implemented

## Problem

`design/Janus-Island-交互与通知形态高保真总览-Optimized.html` 定稿了三处 UI 升级，与现行实现存在断层：运行态折叠胶囊只有 radial 绿雾与白眼 EQ，缺少翡翠绿 Conic 流光环与眼睛本身的绿光；一级展开胶囊直接继承岛体不透明皮肤，没有设计稿的 20px 级毛玻璃质感，LED 无光晕、success 仍用橙色（设计稿定稿为翡翠绿）；托盘通知行没有 severity 左缘细线与任务型微进度条，钉条 banner 还是中性药丸形而非暗金玻璃条。

## Decision

按设计稿三个 scenario 对齐，零结构改动、纯表达层：

**S1 运行态**（`01-janus-foundation.css`，全部收敛在 `[data-stage="collapsed"]`，peek/expanded 面板不挂环）：`.janus-island::before` 承载 1.5px Conic 流光环（mask-composite 掏空成环），仅 running+collapsed 可见并以 `janus-run-glow` 2.8s 匀速旋转；边框提至 `rgba(0,255,136,.25)`、外发光 `0 0 12px .15`；EQ 双眼改翡翠绿发光（4.5px 圆角条）并换非对称物理律动——左弦 `janus-eq-a` 4→13px @0.35s、右弦 `janus-eq-b` 3→14px @0.28s 双频差速；运行态悬停由呼吸动画改为向心轻抬（translateY(-1px) scale(1.03)）。蓄力态（is-charging）随停光环。RunOrb（`11-janus-run-orb.css`）：簇容器 hover 时卫星球向母体吸附 translateX(-2px)，球体 hover 上浮 scale(1.1)+绿晕；`orb-bud` 入场动画 fill 由 `both` 改 `backwards`——终态关键帧与自然态一致，解除对 hover transform 的永久锁定。

**S2 一级展开**（`08-janus-peek-capsule.css`）：胶囊本体脱离岛体皮肤继承，改为毛玻璃——`rgba(22,22,27,.82)` 半透底 + `backdrop-filter: blur(20px)` + 24px 圆角 + 深投影，白字在繁杂工作区上方可读；double 档 74→76px；内容入场换非对称形变（scaleX(.85) scaleY(.8)）；排版升档（kicker 9.5/1.5、title 13.5 w700、subtitle 10.5、meta 9/.5，meta 隐藏断点 900→700）。LED 重做：7px + `::after` 光晕（inset -4px blur 3px inherit），success 定稿翡翠绿 `#00ff88`、attention 亮橙 `#ff9159` 带缩放呼吸（1.15 双相位）、info 亮灰 `#a1a1a6`。

**S3 通知面**：托盘 350px/最高 360/radius 16/blur 24/`capsule-tray-in` 位移+缩放入场；通知行加 `data-severity` 左缘 3px 细线（failed 红/attention 橙/success 绿，默认灰 .3 hover 提亮）+ 中性悬停（白 .03 底+阴影，弃橙色 tint）；行排版升档（title 12.5 w700 #f8f9fa 等）。徽标 24px 高、pop 单次 1.22 带光晕。钉条 banner 由药丸改 12px 玻璃条：橙 tint 边框/渐变底/blur 16/`translateY(-8px) scaleY(.9)` 入场。任务型微进度条：`IslandNotification` 新增可选 `progress` 字段，`maintenanceNotification` 两个分支均携带 `task.progress`，托盘行 subtitle 下方渲染 2px 橙渐变进度条（`capsule-progress-pulse` 脉动），其余通知源不带该字段零影响。行动按钮 hover 增加上浮 1px。

reduced-motion：新增光环/进度条/托盘入场动画全部纳入 0.01ms 降级。

## Alternatives considered

- 运行态光环同时挂 peek/expanded——否决：expanded 面板是主控台容器，旋转环喧宾夺主，设计稿的 ring 只演示在折叠胶囊上。
- LED success 维持橙（旧 Note 的黑橙灰调色决策）——否决：本次以设计稿定稿为准，success 归入"完成=翡翠绿"语义（与 running 同谱系），attention/failed 保留橙/红语义通道。
- 微进度条做成通用 `progress` 通知协议——本次只给 maintenance 投影携带，其他通知源没有进度语义；等第二个任务型通知源出现再抽象。

## Consequences

改动集中在两个 CSS 文件 + `islandNotifications.ts`（可选字段）+ `JanusIslandExpandedShell.tsx`（data-severity/进度条渲染），无状态机与交互回归面。获得：运行态"量子流光"识别度、peek 毛玻璃质感、托盘卡片级 severity 可扫读性与任务进度无感呈现。代价：peek 背景改为半透毛玻璃后，旧 Note「背景继承岛体皮肤」的决策作废（以设计稿为准）；`orb-bud` fill 模式变更使入场动画结束后不再持有 transform（终态等值，无视觉差异）；01-janus-foundation.css 的历史中文注释本身是乱码字节，本次新增注释一律用英文避免再踩编码坑。
