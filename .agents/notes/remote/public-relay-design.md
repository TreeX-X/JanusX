---
{
  "schema": "harness-note/2",
  "id": "cd5b3e52-1610-4842-b04f-3ca9b2fa1759",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-11",
  "updated": "2026-10-12T03:05:06Z",
  "class": "architecture",
  "tags": ["remote","p2p","webrtc","mindfs","web","cross-device"],
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/73984092-d377-4871-81bb-38d62c160f75"}
  ]
}
---

# 公网直连基座与 MindFS 设计借鉴

## Intent

为[公网 Web 终端需求](./requirements/public-web-terminal-foundation.md)选择可扩展的首版实现。当前确认范围是 GitHub/Google 登录、终端输出显示、输入对话框提交、启动和关闭，以及跨公网连接、重连、去重与撤销闭环；LAN 保底暂缓。长期桌面体验是两端安装 JanusX，经可信身份登录并加入、选择同一组织后进入协作上下文，后续加载和同步有权限的蓝图与知识库。具体同步冲突仍留待后续讨论。

用户已明确排除复杂网络配置、开发者承担业务流量中转，以及开发者部署和运维动态控制服务器。第一版支持 GitHub 和 Google 登录，认证代理服务尚未选定；组织由创建者主机保存和管理是当前待评估方案。当前传输建议仍为 WebRTC DataChannel 加 ICE/STUN 自动公网直连，首版无 TURN 或其他业务中继保底。托管身份、设备发现和少量协商信令服务可以评估，但具体依赖、成本及可接受程度未确定。桌面端同时具备宿主和控制端能力，Web 首先作为控制端交付。本文仍是方案草案，WebRTC 接入、依赖及实际网络覆盖尚未验证，也未开始实现公网功能。

用户进一步希望软件分发后无需开发者持续运营任何身份或信令服务。开发者名下的托管认证、实时服务项目仍有配置、额度和供应商依赖，不能把它们称作零运营负担方案。当前转向评估主机执行身份适配、公共信令网络辅助协商的候选；是否接受一次性应用注册、静态 Web 托管及依赖他人运营的公共服务仍需明确，原 Web 优先和 GitHub/Google 登录要求未被撤销。

## Source evidence

2026-10-11 UTC 对 [a9gent/mindfs](https://github.com/a9gent/mindfs) 做源码静态阅读，固定快照为 `42adb08df52f78d5e77b69137bdd66ac88e17b01`。未安装依赖、运行服务、执行其安装脚本或测量公网性能。下述结论以实际实现为依据，不能据 README 宣称部署或性能已经验证。

| 源码位置 | 观察及可借鉴内容 |
| --- | --- |
| [relay/service.go](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/server/internal/relay/service.go#L331) | 宿主带设备凭据主动连接配置的 WebSocket endpoint，在连接之上使用 yamux 多路复用，将流转给本机 HTTP 或 WebSocket 服务。这条 Relay 路径没有使用 WebRTC 穿透。公网部署需配置 WSS；代码允许配置不同 endpoint，不能把所有运行模式都称为 WSS。 |
| [relay/manager.go](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/server/internal/relay/manager.go#L131) 与 [credentials.go](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/server/internal/relay/credentials.go) | 设备绑定、节点 ID、设备令牌、节点访问 URL 与连接管理分开。绑定成功后凭据落盘，重启可以恢复连接；节点身份让前端无需获知宿主当前 IP。 |
| [relay/service.go 重连循环](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/server/internal/relay/service.go#L139) | 暂时故障采用 1 秒到 30 秒的指数退避；永久鉴权错误交给上层处理。JanusX 应在退避中增加随机扰动，并明确设备撤销时停止重试。 |
| [api/ws.go](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/server/internal/api/ws.go) 与 [stream_hub.go](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/server/internal/api/stream_hub.go#L795) | 方法调用与事件通过 WebSocket 承载，含心跳、请求接受回执、事件 cursor 与恢复回放。读到的 `reserveClientRequest` 是内存去重表；它本身不能证明宿主重启后的操作去重或所有动作的持久化幂等。 |
| [e2ee/crypto.go](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/server/internal/e2ee/crypto.go) 与 [cli 参数](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/cli/cmd/mindfs.go#L81) | 存在配对证明、P-256 ECDH、HKDF 与 AES-GCM 的应用层加密实现，CLI 的 E2EE 默认关闭。应学习 TLS 与应用层加密的边界，不能据此认定所有内容始终端到端加密。 |
| [web/runtime.ts](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/web/src/services/runtime.ts)、[base.ts](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/web/src/services/base.ts) 与 [Android 壳 PRD](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/docs/capacitor-shell-prd.md) | Web 业务与运行时、API/WS 地址、原生桥接分开，Android 使用 Capacitor 承载既有 React UI。仓库不能作为原生 iOS 应用已实现的依据。 |

该快照公开了本地宿主与 Relay 客户端集成，未找到完整的公网 relayer 登录、组织权限和隧道接入服务端。目录 `server/` 主要是运行在用户机器上的 MindFS 服务，不能据目录名把它当作可直接部署的完整公网中继后台。JanusX 的跨端账号、组织、设备目录和公网路由仍需自行实现或选择独立服务。

MindFS 将公网部署工作交给托管服务：[内置 agents.json](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/agents.json#L484) 的 `relayBaseURL` 是 `https://relay.a9gent.com`，[中文 README 的绑定流程](https://github.com/a9gent/mindfs/blob/42adb08df52f78d5e77b69137bdd66ac88e17b01/README.zh.md#L211)要求用户在本机页面点击绑定、登录 relayer 并打开节点。核对公开入口时可看到登录入口与 Relay 访问说明。用户无需自行部署中继，服务器及转发成本由服务方安排；公开资料没有给出实际成本或长期收费承诺，也没有证明该托管 Relay 是供第三方客户端通用接入的服务。

MindFS 的托管 Relay 路径与当前约束不符，不作为 JanusX 本轮连接方案。可以继续借鉴设备身份、绑定、请求回执、恢复游标与运行时适配。WSS 本身不强制中继拓扑，但要求用户提供公网地址、设置路由器、VPN 或托管隧道也不符合自动连接目标。P2P 无中继能够减少业务转发成本，代价是部分网络无法连接；轻量控制服务和 STUN 仍有基础设施及少量流量成本。

MindFS 使用 AGPL-3.0，JanusX 的 package 元数据使用 MIT。本文记录设计借鉴，未引入上游源码；后续如选择直接引入代码，需要单独确认许可证与分发方式。

## Recommended foundation

此前建议自行部署 Node.js/TypeScript 控制服务，现已不符合开发者不运维动态服务器的约束。职责仍分为可信用户身份、主机持久化成员与资源权限、外部通道交换少量设备发现及 WebRTC 信令；具体服务依赖尚未选定。托管认证及实时服务可降低服务器运维，但不能直接满足分发后不运营服务的进一步目标。第三方服务不转发终端输出、输入、文件或后续同步内容。正式 Web 页面可使用静态托管，不能因无需自建动态后台就称为完全无服务器。

桌面端增加宿主连接组件，启用远控后注册稳定 hostId、设备名及能力并保持可协商状态。Web 使用固定产品入口，经授权获得设备信息并申请连接；不预先承诺仅凭第三方登录即可自动获得全部设备目录。双方经信令交换候选地址，由 ICE 自动检测 IPv4/IPv6 和 NAT 穿透路径，DataChannel 成功后开始操作。用户无需填写网络地址或设置路由器。

[主机组织与扫码加入提案](./host-owned-organization.md)保存后续流程：创建者分享邀请二维码，成员经 GitHub/Google 登录后提交申请，由拥有者审批，再授予拥有者、管理员或成员对应的资源权限。二维码仅提供申请入口，主机维护成员和授权版本；身份验证、成员审批与资源访问分开。具体托管认证路线、三角色权限和既有模型迁移仍待验证，完整组织管理不属于首版个人远程终端交付。

组织标识与邀请凭据用于身份和授权，不能直接提供公网寻址。STUN 只能辅助发现候选地址，不能让浏览器查找组织、通知 NAT 后的主机或替两端交换 SDP/ICE。普通家庭网络中的主机要实现自动公网连接，仍需可达的信令交换渠道。现成托管信令可作为免自建服务器的候选；依赖其开放接入、鉴权、浏览器支持和额度条件，未指定供应商，也不能假定公共 STUN 同时提供信令。若不接受任何外部信令依赖，手动交换协商信息等方式会改变原自动连接体验，当前没有满足全部约束的已验证方案。

以组织主机为权威来源时，接收新成员申请及需要向主机确认的权限操作依赖主机在线；申请落盘后可等待拥有者后续审批，主机离线时不承诺云端排队。后续多宿主权限撤销、主机接管及共享数据可用性的边界由[组织提案](./host-owned-organization.md)维护。

用户登录凭据、宿主设备凭据与具体远程会话授权分开。信令连接经 HTTPS 授权或使用经过 Origin 校验的同源会话，长期登录令牌不放入 URL。协商会话及 WebRTC 指纹绑定经验证的设备，DataChannel 自带 DTLS 加密不能替代业务身份验证。宿主检查调用方、资源和动作范围，撤销后停止订阅、关闭对应数据通道并拒绝后续操作。票据有效期、权限缓存及撤销检测时限仍需明确。

DataChannel 建议采用可靠、有序的数据传输承载版本化 RPC 和事件，首轮方法围绕终端列举、订阅、启动、提交文本、关闭及恢复。通过 terminalId、channelId 区分多个订阅；每个动作携带稳定 requestId，输出携带宿主运行代次、terminalId、seq，握手报告协议版本及能力。展示层通过公共 RemoteClient 调用能力，分别接本地 IPC 或公网直连适配器。

首轮原型可评估复用 Electron 内置 Chromium 的 WebRTC：在独立、受控的连接页面运行 RTCPeerConnection，经最小 IPC 接口与主进程宿主网关连接。这样可先验证 Web 与 Electron 双端协商和终端数据通道，具体生产形态仍需验证生命周期、后台行为及打包。独立后台宿主需要另行选择 WebRTC 运行库，不预先承诺某个 Node 或原生依赖。正式 Web 静态资源可部署到固定产品入口，业务操作通过直连数据通道执行。

首版只配置 STUN 来源，不配置 TURN，候选路径与统计需记录以证明业务未经过中继。部分 NAT、UDP 封锁及防火墙环境会导致 ICE 失败，界面需在有界等待后提供失败和重试状态。不能通过信令通道、公共免费中继或托管隧道隐式转发业务内容；如果后续要求任意公网可连接，需要重新讨论覆盖与中转约束。

## Reliability and reuse

JanusX 已有 `RemoteHost`、`CompanionGateway`、远控显示契约、node-pty、xterm、输出 seq 及有界回放缓冲，可以继续复用。现有 `RemoteHost` 依赖本机 TeamService，并把部分执行上下文标记为 lan；公网接入需替换身份验证端口、增加 P2P 传输适配并透传真实上下文。现有关闭终端直接调用 TerminalManager，公网改造时还需统一该动作的权限、去重及结果留痕。

终端输出应从主进程现有 PTY 数据路径发布，桌面和远程订阅共用一个输出源。增加带序号的有界增量队列，重连从确认位置补发，队列覆盖不到时返回明确 reset 与有限快照。建立订阅时要处理快照与实时事件的交接，避免遗漏或重复。已有定时 tail/SSE 回环验证只能作为参考，不作为公网流畅度实现。

命令接受回执与执行结果分开，输入、启动和关闭以调用方及目标范围内的 requestId 去重。结果丢失时查询该请求状态；执行状态无法确认时显示不确定结果，避免自动生成新 ID 重放。进程崩溃后的去重与恢复保证需单独设计，不能承诺仅靠网络协议就能实现所有操作恰好一次。

心跳用于在线判断，暂时故障使用有上限、带随机扰动的退避重连。输出按订阅发送，限制每路队列与发送积压，繁忙终端不能使整个客户端无响应。网络断线不终止宿主终端；现阶段终端仍依赖 JanusX 进程，彻底退出应用后的会话存活及独立后台守护进程需另行界定。

后续桌面控制端接入同一 RemoteClient 与组织服务；Android/iOS 可沿 Web 运行时适配后接入原生容器。蓝图与知识库同步作为独立领域接口设计，不把终端输出流当作持久化同步。该阶段能否要求双方同时在线、如何保存共享数据、是否使用第三方存储，需在当前不承担业务中转的约束下另行讨论；“成员离线后其他成员仍可读取其已共享内容”需要可用数据副本，不能仅靠一次 P2P 连接实现。LAN 保底继续延后。

## Distribution without developer-operated services

最接近当前目标的新候选是主机执行第三方身份适配、主机管理组织、公共消息网络交换加密信令、WebRTC 直连业务。这条路线没有被选定或验证，不能据协议存在承诺无需维护或长期免费可用。

2026-10-12 UTC 再次核对 [GitHub Device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)：官方明确该流程不需要 client_secret，但需要注册应用、启用设备授权，并遵守授权提交和轮询限制。桌面应用或组织主机可评估执行请求、轮询和用户身份查询，浏览器显示设备码并引导授权；先经邀请建立受限连接，再将授权结果绑定当前申请者设备。此方案改变标准浏览器登录体验，还要验证初始连接、取消、恶意请求及会话绑定，不能未经实测就替代 Web 登录。Google 的公开客户端登录和主机验证路线也需独立评估，未实测，不能认定必须经过托管认证代理。

公共信令可评估 Nostr 这类现有消息网络。[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)规定签名事件和 WebSocket 发布/订阅；[NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md)规定加密载荷格式。客户端可借此交换短期加密 SDP、ICE 及连接握手，终端和同步内容仍仅走直连。Nostr Relay 在此是信令节点，不承担业务中转。规范允许节点限制连接或拒绝写入，并未保证任何公共节点开放、免费或持续可用；还需选定允许此用途的节点、验证跨网络访问、浏览器支持、消息大小、留存、重放和认证绑定，不能仅硬编码公共地址就认为完成交付。

如果坚持不依赖任何公共发现或信令设施，主机身份加二维码仍不能提供自动公网会合。双向手工交换协商信息可能建立部分网络的连接，但会改变扫码后自动连接和重连体验，不能作为原需求的等价实现。使用用户自己的现成组网服务也可减少开发者运营，却会增加用户安装或配置，并可能产生第三方业务中继；用户自建身份/信令服务则转移了运维责任。上述替代方案仅供取舍，未获采纳。

## Open questions

[独立连接验证工具](./connection-lab.md)已实现该候选技术链，使用模拟终端及内存组织。2026-10-12 UTC 本机 WebRTC、独立静态控制页和真实公共 WSS 信令会合通过；浏览器取得无 TURN 的 UDP 直连选路证据。Node 探测超时与浏览器成功分别记录，不能混为公共服务可用性结论。用户无 OAuth Client ID，真实双提供方登录尚未运行；家庭宽带到手机蜂窝、手机后台恢复及长期公共节点条件仍未验证。本文保持草案，不因同机测试通过而选定生产方向。

- 是否允许发布前一次性应用注册、静态 Web 托管和依赖公共消息/STUN 服务，尚未确认；开发者名下托管项目不能直接当作零运营方案，自建动态控制服务器及业务中转不在候选中。
- GitHub Device flow、Google 公开客户端或托管认证的具体路线、主机验证及本机账号迁移尚未确定；创建者主机维护组织的方案仍待验证。
- Nostr 等公共信令的实际节点、接入条件、长期可用性及多节点协商行为需验证，不能承诺公共服务永久免费或无需后续适配。
- 组织主机的在线要求、邀请及成员凭据格式、权限撤销传播、密钥备份与主机迁移需要设计，不能把公网识别描述为已经解决。
- STUN 来源、不同网络的直连覆盖、设备身份与 WebRTC 指纹绑定、密钥验证及恢复，需要验证。
- 首版支持的终端引擎沿用现有远控范围还是调整，需要在实施任务中明确。
- 宿主运行、终端恢复、请求结果记录的持久化边界，以及撤销生效时限，需要细化后验证。
- 团队蓝图、知识库的共享数据来源与同步冲突策略，继续保持后续讨论范围。
