---
{
  "schema": "harness-note/2",
  "id": "b653bb34-279f-45db-92d1-313d1c6bcdf5",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-09-26",
  "class": "architecture",
  "tags": ["remote","hosted"],
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/7822452e-cef7-4ef3-a138-2ae6abc84667"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/bda5aa81-dc65-4408-9544-60fdfdf8c836"}
  ],
  "parent": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b2e7f160-2d77-4cc4-8828-b9cf3e5d931a",
  "codeRefs": [
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/companion/gateway.ts",
      "symbol": "CompanionGateway",
      "role": "entry"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/hosted/github.ts",
      "symbol": "detectProvider",
      "role": "implementation"
    },
    {
      "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
      "path": "src/main/hosted/gitlab.ts",
      "symbol": "GitlabProvider",
      "role": "implementation"
    }
  ],
  "updated": "2026-10-12T09:42:00Z",
  "moduleState": "partial"
}
---

# 远程控制与托管协作

## Responsibility

通过 CompanionGateway 校验远程会话操作，并通过 HostedProvider 适配 GitHub 与 GitLab 的 issue、review、检查及合并。网关负责上下文验证、动作令牌、去重与审计；托管适配通过现有凭据和本地工作树流程协作。远程创建终端仅允许 claude、codex、opencode，janus、pi、dsh 不因本地状态接入获得远控能力。

## Design

模块覆盖已存在的受控网关与托管平台入口，不声明完整团队身份、服务端同步或 LaunchSurface 已实现。ToB 身份及传输文档保留原生命周期，其计划需要独立交付；下列历史 LAN 决策也不能替代对当前身份及授权实现的核验。远程对象是会话与工作流，不是整机桌面或任意键鼠控制。

下一版按[远程优先决策](./remote-first-cpa-deferred.md)先交付公网连接基座和 Web 控制端，操作范围为终端输出显示、输入对话框提交、启动及关闭终端。[公网 Web 终端需求](./requirements/public-web-terminal-foundation.md)保存真实跨公网闭环验收与跨端问题。当前 LAN HTTPS 实现保留，但局域网对应能力暂缓开发，后续作为保底；浏览器入口当前仍是本地验证工具，公网中继尚未实现。

用户最终确认两端不在同一网络环境，并在本机核查确认该宽带为 CGNAT（WAN `10.44.66.57`，无 IPv6，双重 NAT）后，**放弃 WebRTC 无 TURN 直连方向，改用中继方案**。证据链、三个参考实现的源码级阅读（Orca 纯中继无 P2P、MindFS 主机外联、RustDesk 自托管）与对早前“薄中继”判断的更正，均记录在[连接验证工具](./connection-lab.md)。传输层改为双方各建一条出站 WebSocket 到自有域名的中继，按配对 ID 转发已加密字节；主机端复用桌面内置 Node 的 WebSocket 客户端，不捆绑第三方二进制。中继设计需同时服务将来的蓝图/知识库团队同步（见 connection-lab.md 末段四条约束）。Nostr 信令对基础连接路径不再是必需，二维码直接编码域名与配对信息。既有 gateway、身份、绑定、去重、审计层全部复用；身份验证（GitHub Device Flow / Google JWKS）工作在传输层之上且由主机侧直接请求供应商，不受传输替换影响。中继形态已定为**中继代码跑在用户自己的 Windows 机器上，由 cloudflared 提供公网入口**（手机经 `wss://relay.<域名>` 到 Cloudflare 边缘，再经 cloudflared 出站长连接转到本机 `127.0.0.1` 上的中继），不采用 Cloudflare Worker（isolate 限制与 Durable Objects 模型不利于扩展）。此前“该机在 CGNAT 之后不能作为中继宿主”的判断已更正——那仅对直接监听公网端口成立，cloudflared 只做出站连接故不受影响。此形态零服务器成本、无运维、完整 Node 运行时、改代码即生效，且中继只听 `127.0.0.1` 不暴露局域网；cloudflared 手动安装不捆绑进 JanusX，将来迁 VPS 只需迁移不需改协议。已知限制：机器睡眠即不可用（须关闭睡眠）、心跳为必需（Cloudflare 会掐空闲连接）、免费档 WS 限制待实测。本机 Windows 原生即可开发自测，不需要 WSL2。替换传输层新增三件工作：应用层 E2EE（DataChannel 原本免费提供 DTLS）、中继本身、背压与分帧。遗留的 WebRTC 与 Nostr 信令测试内容需清理，新方案的测试内容尚未开始设计。

后续团队协作目标为蓝图与知识库同步，冲突策略留待后续讨论。移动端优先复用 Web 设计、协议和业务逻辑，具体原生容器路线尚未确定；终端远控状态传输不代表共享数据同步已经完成。

用户进一步追求分发后无需开发者运营服务。[零运营候选分析](./public-relay-design.md#distribution-without-developer-operated-services)评估主机执行身份适配、公共消息网络承载加密信令及 WebRTC 直连，该方向的真实网络结论已由[连接验证工具](./connection-lab.md)取得：在本机 CGNAT 宽带下不可用。此前托管认证及实时服务项目不能直接描述为零负担，原首版范围未被撤销。

[公网直连设计草案](./public-relay-design.md)保存 MindFS 固定源码快照及早期技术建议，其中“WebRTC DataChannel 加 ICE/STUN 自动直连、首版无 TURN 保底”已被上述结论推翻，不再作为当前方向；其 MindFS 绑定、恢复与跨端适配的借鉴价值保留。第一版支持 GitHub/Google 登录，认证服务及托管发现依赖仍需选型；凭证及组织标识不能替代公网连接协商。后续[主机组织提案](./host-owned-organization.md)分析二维码申请、拥有者审批及拥有者/管理员/成员角色；完整组织管理不进入首版范围。无法连接时明确失败并说明原因，不承诺任意公网覆盖；中继接入与覆盖尚未验证，真实跨公网闭环仍需验收。

方向与发射：[gateway 已落地](./remote-control.md)为方向上篇，[launch-surface 草案](./launch-surface-remote-visualization.md)为投影下篇，互链保留。

ToB 三部曲：[identity](./tob-identity.md)、[transport](./tob-transport.md)、[lan-remote](./tob-lan-remote.md)按身份到传输到控制排序。

Hosted 双适配以[orca-dual 纲](./requirements/orca-hosted-dual-github-gitlab.md)为目：[gitlab-config](./gitlab-instance-config.md)、[gitlab-reviews](./gitlab-provider-reviews.md)、[github-reviews](./hosted-github-reviews.md)、[automerge](./hosted-issues-comments-automerge.md)为目。

## Acceptance criteria

以下保留 2026-09-26 文档组织验收；数量是历史快照，勾选不证明团队路线全部交付。

- [x] AC-1: 本域 10 篇直接子全部携带有效 parent。
- [ ] AC-2: gateway 与 launch 上下篇关系保留，不合并草案与落地。
