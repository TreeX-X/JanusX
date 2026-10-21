---
{
  "schema": "harness-note/2",
  "id": "2a85ca64-bc0b-48b1-91b5-a89c44e13321",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-21",
  "updated": "2026-10-21T03:35:04Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c",
  "relations": [
    { "type": "related-to", "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/18fdb678-35e2-4862-b4b2-64c51fab9e85" }
  ]
}
---

# Janus 自有功能形象与宠物交互探索

## Intent

用户在 DSH 宠物调研后提出：后续可能开发 Janus 自己的功能形象，先记录作为探索方向。核心机会是以 Janus 自有角色表达任务状态、等待事项和轻量互动，形成产品辨识度。尚未确定外观、是否采用像素画、承载位置、默认开关或交付日期；本次没有实施、排期或批准替换现有 Janus 眼睛，也未决定直接使用鲸鱼形象。

## DSH 参考实现

参考源为社区项目 [lhh010/dsh-ui-whale](https://github.com/lhh010/dsh-ui-whale/tree/329be15dfbf7cb36e80760b38d7aa91ccbf20989)，基线 `329be15dfbf7cb36e80760b38d7aa91ccbf20989`。本机 DSH-TUI 文档也明确注明像素鲸鱼及闲置行为移植自该项目。Web 原版是会话标题栏的常驻伙伴；TUI 版本主要用于欢迎期，开始首次任务后定格，不应混为相同运行行为。

原版使用 React 组件、40×25 像素帧、CSS box-shadow 和每 120ms 推进的纯动画状态机。空闲时眨眼、摆尾、动鱼鳍，连续空闲约 10 秒后睡觉，运行／思考／工具执行时改变节奏，点击冒爱心，运行状态从 true 变 false 时喷水。它不包含养成、饥饿、长期记忆或独立桌面窗口，也不需要额外模型推理。

可借鉴像素帧与纯状态机分离、会话状态适配和轻量互动。DSH 的 Cordis 注册、会话 hooks、版本检查和更新提示不能直接接入 JanusX。项目为 BSD-3-Clause，复用代码／素材应保留版权、许可证及免责声明；自有形象的原创素材应单独明确来源和授权。

源码证据：[组件](https://github.com/lhh010/dsh-ui-whale/blob/329be15dfbf7cb36e80760b38d7aa91ccbf20989/src/client/WhalePet.tsx)、[状态机](https://github.com/lhh010/dsh-ui-whale/blob/329be15dfbf7cb36e80760b38d7aa91ccbf20989/src/client/animation.ts)、[样式](https://github.com/lhh010/dsh-ui-whale/blob/329be15dfbf7cb36e80760b38d7aa91ccbf20989/src/client/WhalePet.module.css)、[许可证](https://github.com/lhh010/dsh-ui-whale/blob/329be15dfbf7cb36e80760b38d7aa91ccbf20989/LICENSE)。仅完成静态阅读，未运行上游应用或测试。

## Janus 功能形象的候选行为

建议由宿主整理当前关注会话的少量状态，交给角色状态机，再由角色皮肤渲染。角色只负责表达与导航，执行、授权和任务结果仍由原宿主管理；基础形象不需要读取聊天正文或自行调用模型。

| 任务事实 | 候选表现与交互 |
|---|---|
| 空闲 | 轻量待机，长时间无任务后休息 |
| 思考／输出／工具执行 | 用不同动作表达处理阶段，避免仅有统一忙碌循环 |
| 等待审批／回答 | 清楚表达等待用户，点击定位原有审批或提问入口，不代替用户批准 |
| 成功 | 短暂完成反馈 |
| 失败 | 可识别的异常提示及定位入口 |
| 取消 | 回到待机，不播放成功庆祝 |
| 状态未知 | 中性展示，不把缺失信号推断为成功 |
| 用户点击 | 轻量反馈；与“打开待处理事项”的动作关系需设计时明确 |

当前 [janusRuntimeState.ts](../../../../src/renderer/src/components/janus/janusRuntimeState.ts) 已整理思考、输出、工具和等待等 Chat 状态，[janusIdentity.ts](../../../../src/renderer/src/components/janus/janusIdentity.ts) 与 [JanusEye.tsx](../../../../src/renderer/src/components/janus/JanusEye.tsx) 已有 Janus 身份及眼睛表达，可作为适配依据，不代表跨全部引擎已有统一宠物状态源。多个项目或会话并发时需明确关注对象；建议首版只跟随当前会话，切换会话不能误触完成反馈。

原版仅依据 running 下降沿庆祝，没有区分成功、失败或取消；移植时需改用可靠结束原因和会话／轮次身份。DSH 等外部引擎没有充分事件时保持未知，不能为动画补造完成事实。

## 承载与扩展方向

应用内角落、开始页或 Janus Island 附近均是候选，需协调现有身份、通知、遮挡、焦点和窄窗体验。应用内可选组件适合作为首轮验证建议；默认是否关闭仍待确认。

独立桌宠是后续独立范围：透明窗口、拖动、点击穿透、置顶、多显示器和 DPI、位置恢复、最小化／退出行为都需另外设计，不能把上游会话组件当作已具备桌宠窗口能力。

当前扩展协议只提供 workspace／right 两类视图，没有通用角落悬浮贡献点。先验证形象与状态交互，再考虑官方可选扩展及受控角色／皮肤贡献接口。第三方皮肤不应因展示角色而取得完整宿主桥、聊天内容或执行权限；平台关系见[插件化探索](plugin-platform-and-feature-modularization.md)。

实现时应做到隐藏／停用后清理计时器与订阅，窗口不可见时暂停非必要动画，减少动态效果时真正冻结动作，点击支持键盘及可访问名称。上游 reduced-motion 样式并未实际阻止状态帧变化，不宜照搬其注释作为已实现保证。性能需要实测，纯前端不等于没有持续重绘成本。

## Open questions

待后续确定：Janus 原创角色的造型和风格；与现有眼睛是互补、可切换还是替代；应用内位置及默认开关；单会话与全局任务关注规则；点击的互动与导航优先级；是否提供桌宠模式或用户皮肤。当前仅记录可能开发的方向，不创建实施任务。
