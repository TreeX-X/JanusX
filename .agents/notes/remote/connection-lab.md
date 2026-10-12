---
{
  "schema": "harness-note/2",
  "id": "c4e713ef-78b9-4d93-aaf5-37d48df42a3c",
  "kind": "decision",
  "lifecycle": "accepted",
  "created": "2026-10-12",
  "updated": "2026-10-12T10:41:00Z",
  "class": "architecture",
  "tags": ["remote", "validation", "webrtc", "oauth"],
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5",
  "relations": [
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/cd5b3e52-1610-4842-b04f-3ca9b2fa1759"},
    {"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/73984092-d377-4871-81bb-38d62c160f75"}
  ],
  "codeRefs": [
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"scripts/remote-lab/run.mjs","role":"entry"},
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"scripts/remote-lab/peer.mjs","role":"implementation"},
    {"repoId":"972afef3-2fc7-49de-a3ee-7e041225d28c","path":"scripts/remote-lab/tests/browser-smoke.mjs","role":"test"}
  ]
}
---

# 公网连接方向验证工具

## Problem

用户希望在选择[公网直连底座](./public-relay-design.md)前充分测试，以减少后续大改。候选方向要求开发者不运营动态控制服务器、不承担业务流量中转，首版支持 GitHub/Google 登录，后续可扩展主机管理组织与扫码审批。协议存在不等于真实网络和登录流程可用；用户目前没有两家供应商的 OAuth Client ID。

## Decision

在 `scripts/remote-lab/` 实现独立试验台，使用隔离的依赖和模拟终端，不接入生产 JanusX 工作区。Windows 双击 `start.cmd` 启动回环 helper 与浏览器；[使用说明](../../../scripts/remote-lab/README.md)给出无 Client ID 的第一轮测试、供应商注册和手机蜂窝测试步骤。Client ID 是公开应用编号；缺少配置时真实认证保持未运行，网络测试身份不能计为真实登录。

技术链为用户电脑上的身份 helper、主机内存成员审批、二维码临时邀请、公共 Nostr WSS 节点交换签名且 NIP-44 加密的信令、ICE/STUN 协商、可靠有序的 WebRTC DataChannel。GitHub 使用无需 client_secret 的 Device flow；Google 使用官方登录组件及主机 nonce/JWKS/RSA 验证。仅配置 STUN，拒绝 TURN；终端内容只经 DataChannel。独立静态控制页构建到 `dist/index.html`，真实手机测试需要先配置 HTTPS 静态入口。

批准、拒绝、撤销、原请求 ID 去重和冲突检测、400 帧有界回放及明确 reset 都可测试。报告提供节点回执、事件接收、选中 ICE 候选类型、DTLS 状态、流量、延迟和验证结果，排除 OAuth token、私钥、邀请令牌、SDP、完整 IP 及输入内容。测试组织、密钥和去重记录在页面内存中；主机重载会清空。

2026-10-12 UTC 的验证结果如下。自动产物写入仓库根目录 `artifacts/remote-lab/`，可按 README 的命令重新生成。

| 验证 | 证据与边界 |
| --- | --- |
| 10 项 Node 测试通过 | 加密信令、权限、去重、回放、回环 API 限制；GitHub 接口使用夹具，Google 使用实际 RSA 签名及夹具 JWKS，不计真实供应商登录 |
| 本机浏览器闭环通过 | 两个 Chromium 上下文、390×844 控制端；真实加密及 WebRTC；待审批拒绝、7 项操作检查、中文、100 帧/秒输出、超过回放窗口后恢复、信令关闭后传输、撤销及重连拒绝 |
| 独立静态控制端通过 | 不同 origin、控制端无 helper，通过双向手动加密信令建立真实 WebRTC 并通过审批与操作检查；不计自动公网会合 |
| Node 公共节点探测超时 | 三个候选节点均在该 Node 环境的 15 秒窗口内失败；不能推广为浏览器不支持 |
| 浏览器公共节点会合通过 | `nos.lol` 与第二次运行的 `relay.damus.io` 接受并传递真实加密信令，取得双方 UDP `host → host`、DTLS connected、无 relay 候选的选路证据；同机测试不证明家庭宽带到蜂窝穿透，`relay.nostr.band` 未取得成功证据 |

接受的是验证工具及测试分层，尚未选定生产架构，也未勾选[公网需求](./requirements/public-web-terminal-foundation.md)的真实跨公网或双提供方登录验收。

用户在本机信令连接后点击 GitHub 登录遇到 `fetch failed`。定位到 Node v24.15.0 已有环境代理但未启用原生代理支持：直接 HEAD 请求 GitHub 授权地址及 Google JWKS 超时，启用 `--use-env-proxy` 后分别收到 HTTP 404（该地址不接受 HEAD）及 200。仅证明供应商网络路径恢复，不计真实 OAuth 授权成功。启动器现自动启用支持版本的已有 HTTP(S) 环境代理，保留显式关闭和 NO_PROXY 语义，不修改系统配置；旧版 Node 提示升级。错误区分供应商请求与本机 helper 不可达，排除原始异常中的私密信息。新增失败诊断测试后 11 项 Node 测试通过，本机浏览器闭环复测通过。

用户随后反馈主机登录与成员审批流程不清晰，并报告已完成 GitHub 登录（用户报告，未取得配对机器证据）。页面现区分本机练习与公网准备，顶部按角色、连接、身份与批准状态提示下一步；主机身份验证收进可选区域，明确不会产生待审批成员。成员登录位于控制端，批准前禁用操作按钮。本机邀请强制使用回环页面并隐藏手机二维码；公网邀请必须先提供非回环 HTTPS 地址，输入不合格时不结束已有实验。静态文件下载不含 helper 标记、用户应用编号或本次邀请。11 项 Node 测试、本机流程与无 helper 的静态控制端复测通过；浏览器检查覆盖步骤提示、未批准禁用、无 HTTPS 时拒绝生成、失败不破坏已有连接。

用户明确要求部署到 Janus 现有静态站点用于测试。控制页现位于 [Janus 公网试验台](https://treex-x.github.io/JanusX/remote-lab/)，由现有 `gh-pages` 根目录的 `remote-lab/index.html` 提供，部署提交为 `3cde2a40505998d1b3a6617d2967d98b1526a409`。该提交仅新增控制页，通过独立 detached worktree 发布；下载首页及已有工作树修改保留。电脑 helper 默认填入此地址，二维码指向此 HTTPS 页面并在 fragment 中携带短期邀请。Pages 构建成功、网页 HTTP 200；`npm --prefix scripts/remote-lab run smoke:hosted` 使用真实线上静态页与公共 WSS，完成 WebRTC 连接、界面审批和全部七项操作检查，控制页无本机 helper 能力、无页面异常。机器证据见 `artifacts/remote-lab/hosted-smoke.json`；仍是同机浏览器与测试身份，不计手机蜂窝穿透或真实 OAuth 验收。

手机测试反馈显示“协商中或连接失败”，用户提供的事件中三个默认公共 WSS 节点均出现 error/closed；这证明该次设备路径的信令连接失败，不足以推断 WebRTC NAT 穿透结果或永久不可达，也不能用电脑同机成功替代手机可达性。控制页现在按信令不可达、等待主机回应和已收到协商但直连失败提示阶段。此外，本机测试复现了独立的邀请读取问题：已打开页面的标签页导航到同路径的新 `#invite` 时不重新加载，旧实现只在首次加载读取邀请。现监听 hashchange 并自动读取新邀请；空邀请、仅网页地址和无效链接给出明确提示并滚动到错误。回归测试覆盖已有标签页输入完整邀请并完成闭环，修复提交 `a9f2368` 已发布到 gh-pages。用户手机网络是否可访问这些公共节点仍需其设备复测；更换可达网络、已有代理或公共节点属于网络对照，未新增业务中继。

用户最初报告手机未开启代理，后来改为 Wi-Fi 加代理，并曾说明两端不同网络；最新纠正为当前手机和电脑处于同一网络。当前失败不能继续直接归为跨公网 NAT 穿透限制。手机诊断显示 remoteDescriptionSet 为 true、signalingState stable、ICE failed；本地 host 候选 1 个、远端 host 1 个及 srflx 2 个、candidatePairStates 为空、没有 STUN 错误码。它证明协商已有进展但路径失败，不能独立证明代理阻断、没有候选对尝试或需要 TURN。当前需核对浏览器、两端代理的局域网/UDP 路由、Wi-Fi 设备隔离及设备防火墙，并取得配对报告。控制页记录本地与远端 ICE 候选类型计数、收集/协商/连接状态、候选对状态及 STUN 错误码；失败时也显示摘要并写入报告。事件及摘要不包含候选字符串、IP、端口或 ICE errorText。候选计数和脱敏边界通过本机浏览器回归检查，部署提交为 `744f378`。手动交换对照在本机独立静态 origin 复测通过，但尚无用户设备成功证据；诊断及本机复测不代表失败网络已恢复。

针对上述“远端候选有计数却无候选对”的矛盾，代码复核定位到三个缺陷。其一，`remoteCandidateTypes` 在 `addIceCandidate` 之前计数，且两处调用都没有容错：候选被浏览器拒绝时计数已加上、日志已写出，异常逃逸成 `signal-rejected`，报告因此无法区分“收到并接受”和“收到但被丢弃”。其二，`flushCandidates` 先 `splice(0)` 取出整条队列再逐个添加，第一个候选抛错即丢弃其余。其三，ICE 候选只在 `onicecandidate` 里发一次，`hello`、`offer`、`answer` 都有重发路径而候选没有，节点丢事件或订阅窗口打开过晚都会导致候选永久缺失。现已改为被拒候选单独计数、逐个容错、随收集完成与 `hello` 重试补发并在接收侧去重；`icecandidateerror` 补记配置的 STUN 地址而不含地址、端口与 errorText。诊断新增被拒/已接受候选数、候选对明细、mDNS host 候选标记、STUN 出口截断哈希（供两端比对是否共用出口或同一 NAT）、带时间戳的状态跃迁、对端时钟偏差；失败提示按时钟偏差、候选被拒、未收到候选、无候选对、mDNS、出口指纹的顺序给出可执行结论，不再只提示无 TURN 穿不过去。

回归方式有一个必须记录的反例：曾按“丢弃一端 ICE 候选”编写端到端回归，两端仍然连通。原因是该 Chromium 会把已收集的候选写进重传的 SDP，同机场景因此自愈；这也解释了同机冒烟为何从未暴露候选只发一次的缺陷。该回归已删除，替换为在真实连接上做的白盒检查（`smoke:candidate-accounting`）：验证补发确实重新发布、第二轮继续发送、通道打开后停止、畸形候选返回 false 且被拒计数加一、连续多个坏候选全部尝试而不中断、连接在注入坏候选后仍然打开。11 项 Node 测试、`smoke`、`smoke:manual`、`smoke:candidate-accounting`、`smoke:hosted` 均通过；控制页重新构建并发布，提交 `ae7ecd1`，线上页面经 `smoke:hosted` 用真实公共 WSS 复验通过。本轮修的是报告可信度与补发路径，**不证明手机失败已修复**；仍需用户在两端分别关闭代理复测，并按新的诊断字段判断是候选被拒、未收到候选还是出口相同。

用户随后确认手机代理是 VPN 类，并在关闭该代理后复测，仍然是“协商信息收到、WebRTC 未建立”；并进一步纠正两端**不在同一网络环境**。本机核查排除了电脑侧与浏览器侧因素：`HTTP_PROXY`/`HTTPS_PROXY` 与系统代理均为 `127.0.0.1:7897`（Clash mixed 端口），网卡列表没有任何 TUN/WinTun 适配器，即 Clash 未开启 TUN 或增强模式，纯 HTTP 代理不经手 WebRTC UDP；`C:\Program Files\nodejs\node.exe` 已有 Public 作用域的入站 Allow 规则，与当前网络类别一致，防火墙不拦截；ZeroTier 虽在运行，但其默认路由有效度量 10034 远高于以太网的 25，`Find-NetRoute` 也确认公网出口走以太网，不劫持流量。

此间有一个必须更正的错误判读：局域网探针 `scripts/remote-lab/lan-probe.mjs` 显示手机打不开 `http://192.168.31.5:41880/`，一度被当作“两端没有通路”的证据并写入记录。两端本就不在同一网络，手机当然无法访问另一网络的私有地址，该结果不构成任何结论，已撤回；探针仅在同一网段排查时才有意义。

改用 STUN 映射探测 `scripts/remote-lab/nat-probe.mjs` 后，电脑侧结论如下：同一个 UDP socket 访问多个 STUN 服务器得到完全相同的映射，说明是**锥形 NAT**，支持打洞；映射地址为 `113.98.127.10` 与 `119.130.56.78`，均为正常公网地址，不在 100.64.0.0/10 共享段，**不是 CGNAT**。但出口公网 IP 在会话间不稳定（TCP 始终为 `113.98.127.10`，UDP 时而为 `119.130.56.78`），提示多 WAN、运营商地址池或按流负载均衡；若路由器按流分担，STUN 映射与数据流可能走不同出口，打洞会失败，此项待核对。电脑侧唯一仍未排除的因素是小米路由器（`192.168.31.1`）的 SPI 防火墙是否拦截入站 UDP。

因此当前失败不能归因于工具缺陷。按可能性排序，剩余嫌疑是手机侧网络（另一网络，国内蜂窝通常为 CGNAT 加对称 NAT，无 TURN 完全无解）、路由器入站 UDP 过滤、以及出口 IP 不稳定。判定方法是将手机换到另一条家庭宽带或办公网络复测：通则说明原网络超出无 TURN 覆盖，不通则回头查电脑侧防火墙与多 WAN。这正是[公网直连设计草案](./public-relay-design.md)与[远程优先决策](./remote-first-cpa-deferred.md)预判的风险——“没有中继保底时，部分 NAT、防火墙或禁止 UDP 的网络可能无法连通”；若要求这些网络也能连接，需要重新讨论约束，不能静默恢复付费或托管中转。试验台在此已完成它的作用：证明了所选架构在该用户真实环境下不成立。

用户最终确认两端**不在同一网络环境**，并明确选择**中继方案**，WebRTC 无 TURN 方向在其真实网络下放弃。本机核查把范围收束到一条硬事实：小米路由器 WAN IP 为 `10.44.66.57`（RFC1918 私网），无 IPv6，即主机在运营商 NAT 之后、本身不可达；traceroute 显示 `10.44.66.10` 与 `100.64.0.1` 双重 NAT。STUN 映射探测（`scripts/remote-lab/nat-probe.mjs`）确认电脑侧是锥形 NAT、映射地址为正常公网 IP 而非 100.64.0.0/10，但出口公网 IP 在会话间漂移（`113.98.127.10` 与 `119.130.56.78`），提示多 WAN、运营商地址池或按流分担。因此主机侧可达性方案（UPnP/NAT-PMP、IPv6 直连）在此网络确定无效——路由器自己没有公网地址可映射。用户同时否定了“要求用户进路由器关闭 SPI 防火墙”这一类方案，认为不构成可发布产品。结论：该宽带上“开发者不涉及中继”与“可靠远程连接”无法同时满足。

对三个参考实现做了源码级或静态阅读以确定方向。**Orca**（`stablyai/orca`，MIT，浅克隆阅读）：`cloud/README.md` 明确“Phones and desktops never talk to each other directly”，公网模式**完全不做 P2P**，双方各建一条出站 WebSocket 到 relay cell，由 cell splice；同一镜像按 `ORCA_RELAY_ROLE` 分 director（分配主机到 cell、协调迁移）与 cell（承载连接）；区域为 `us-central1` 与 `asia-east2`，Terraform 覆盖 GCE、Postgres、DNS、IAM、fence broker、push gateway，production/staging 两套；`cloud/apps/relay/src` 非测试源文件 80 个，另有 `relay-fence-broker`、`relay-ops` 两个独立服务；协议为 Zod strict 版本化消息，主机证明用 Curve25519-XSalsa20-Poly1305 挑战加 HMAC-SHA-256 结构化转录本，relay 只转发 opaque E2EE 字节；配对 offer v2 含 endpoint、deviceToken、桌面 Curve25519 公钥与 relay 的 directorUrl/cellUrl/relayHostId/inviteToken；`automatic`（Anywhere）模式强制要求登录账号，未登录降级为 `local-only`。**MindFS**：主机主动外联配置的 WebSocket endpoint（内置 `https://relay.a9gent.com`），yamux 复用，无 WebRTC，服务端未开源且为 AGPL。**RustDesk**：hbbs rendezvous 加 hbbr 中继，P2P 优先，服务端开源但 AGPL。三者里只有 Orca 同时满足“源码可参考”与“许可证和 JanusX 的 MIT 兼容”。

此处更正本轮早前的一个不准确判断：曾据 MindFS 的 yamux 形态断言“中继可以很薄、几百行”。Orca 的实际情况是企业级规模（80 源文件、多区域、数据库、围栏 broker、迁移与区域纠偏）。需要说明的是这些能力由大规模多租户驱动，小规模自托管并不需要；但“薄”是砍掉企业特性之后的结果，不是参考实现的真实样子，不能据此估算成本。

用户最终选定的方向是**基于自有域名的中继**：主机与手机各建一条出站 WebSocket 到 `wss://relay.<域名>/<pairingId>`，中间按 ID 配对并转发已加密字节；主机端复用 JanusX 桌面内置 Node 的 WebSocket 客户端，不捆绑 cloudflared 等第三方二进制。该方向满足用户零网络配置、CGNAT 可用、复用既有 gateway 与身份审计层，并使 Nostr 信令对基础连接路径不再是必需（二维码直接编码域名加配对信息）。用户持有域名，将在后续提供 Cloudflare 账号与域名用于部署，部署流程需单独教学。

中继形态先讨论过自建 Linux VPS 与 Cloudflare Worker，最终确定为用户当前的部署形态：**中继代码跑在用户自己的 Windows 机器上，由 cloudflared 提供公网入口**，即手机经 `wss://relay.<域名>` 到 Cloudflare 边缘，再经 cloudflared 的出站长连接转到本机 `127.0.0.1` 上的中继。此前的判断“该机在 CGNAT 之后，不能作为生产环境中继”仅对**直接监听公网端口**成立，已更正：cloudflared 只做出站连接，CGNAT 不影响，因此本机完全可以作为中继宿主。选它的理由相对 VPS 是零服务器成本、无服务器运维、完整 Node 运行时与完全控制权、改代码即生效，且中继只听 `127.0.0.1` 而不暴露到局域网，唯一入口是 cloudflared。相对 Cloudflare Worker 仍不采用，理由是 Worker 跑在 V8 isolate 中，受运行时限、消息与连接数限制，Durable Objects 的状态与休眠模型会把配对逻辑变复杂，扩展性差；中继代码放在本机或 VPS 都是完整 Node 运行时，将来迁到 VPS 只需迁移不需改协议。cloudflared 由用户手动安装（`winget install Cloudflare.cloudflared`），**不捆绑进 JanusX**，命名隧道加 DNS 路由到 `ws://127.0.0.1:<port>`；本机同时可用于开发自测，即同时起中继、模拟主机、模拟手机三个进程全部连 `localhost` 验证配对、转发、E2EE 与重连。

该形态有三个已知限制。其一，机器关机或睡眠即远程不可用；对“个人远程开发”场景不构成问题（中继与主机同机，机器本需开机），但必须关闭 Windows 睡眠，否则 cloudflared 会断。其二，**心跳是必需的而非可选**：Cloudflare 边缘会掐除长时间空闲连接，Orca 用 15 秒控制 ping 与 75 秒静默超值正是为此，中继与两端客户端都必须有规律心跳。其三，Cloudflare 免费档对 WebSocket 消息大小与单连接时长的硬限制尚未实测，终端文本流量极小大概率不构成问题，但必须作为第一步最小验证的测量项；其使用条款也需自行确认“通过 Tunnel 分发产品流量”在允许范围内。遗留的 WebRTC 与 Nostr 信令测试内容需清理，新方案的测试内容按中继架构重新设计，尚未开始。

**Linux VPS 作为未来方案完整保留，当前不采用但明确记录，供团队同步阶段启用。** 触发条件是[tob-transport](./tob-transport.md)的团队同步基座要求中继 7×24 在线，而个人电脑的开机状态不能作为依赖；届时把同一份中继 Node 代码迁到 VPS 即可，**协议不变、客户端不变，只是换一台机器跑**，因此当前按本机形态设计不构成返工。该方案的技术结论：选 Linux 不选 Windows VPS，因为 Windows 授权费通常贵 2–4 倍且对 Node WebSocket 中继没有任何额外收益，中继代码不涉及平台特定 API、两边通用；单台 Linux VPS 即完整 Node 运行时，无 isolate 运行时限与消息限制，可自行加协议、限流与监控。成本按终端文本流量测算：一万日活峰值并发 200–400、全部走中继约 48 Mbps、月均约 15 TB，数十美元量级；一千日活约 1.5 TB/月、十美元上下。后续若要演进为“P2P 优先、中继兜底”，VPS 上做 rendezvous 也是自然延伸。需要注意 Orca 的多区域、Postgres、fence broker、director 与 cell 迁移是企业级规模下的专职投入（见前述事故记录），**小规模自托管不需要这些**，单机中继加上前述五件稳定性机制即可。

遗留的 WebRTC 与 Nostr 信令测试内容需清理，新方案的测试内容按中继架构重新设计，尚未开始。

传输层替换对各层的实际影响已核对：**身份验证完全不受影响**。GitHub Device Flow 与 Google JWKS 验证本来就工作在传输层之上，且都是主机侧直接向供应商发 HTTP 请求（设备码申请、轮询换 token、拉 JWKS 验 RSA 签名），不经过中继；手机打开 GitHub 授权页与加载 Google 脚本也是浏览器直接出网。权限审批、action-token、撤销、去重、审计、业务逻辑（start/input/close/replay）同样原样保留。配对与邀请变简单——二维码直接编码域名加配对 ID，删掉 SDP 与候选交换。

但“只是改传输层”会漏掉三件新增工作，必须显式记录。其一，**应用层端到端加密**：WebRTC DataChannel 免费提供 DTLS 加密，换成普通 WSS 后只有手机到中继、主机到中继两段 TLS，中继看得到明文；要保持“终端内容不经过中转方可读”的性质，必须自行实现 Curve25519 加对称加密的应用层 E2EE，密码学原语可复用 NIP-44 与既有 keypair，Orca 的做法是 relay 只转发 opaque E2EE stream。其二，**中继本身**：按 pairingId 配对两条出站连接并转发字节，含基本限流、超时与生命周期管理，预估 200–400 行。其三，**背压与分帧**：DataChannel 自带缓冲与 `bufferedAmount`（lab 已用它在弱网丢帧），裸 WS 需自行处理消息大小上限（Orca 设 8MiB）、积压时丢弃还是阻塞、大帧分片。准确的概括是：**去掉的是“找路”的复杂度（ICE/STUN/候选/信令），换来的是“修路”的成本（中继 + E2EE + 背压）**；代码量大致持平，但复杂度性质不同——WebRTC 的失败模式取决于用户网络，中继的失败模式只取决于服务器是否在线，后者可测试、可推理。

本轮决策使[远程优先决策](./remote-first-cpa-deferred.md)中“开发者不提供或购买业务流量中转、不部署和运维动态控制服务器”以及“WSS Relay、托管反向隧道及开发者承担流量的 TURN 保底退出本轮候选”两条约束被显式反转，触发条件正是该决策自己写明的“后续若要求这些网络也能连接，需要重新讨论约束”。反转经用户明确选择，不属于静默恢复。具体中继形态已定为自建 Linux VPS（见前段），账号归属与是否保留 P2P 优先仍待定，记录为开放项。此前遗留的 WebRTC 与 Nostr 信令测试内容需清理，新方案的测试内容按中继架构重新设计，尚未开始。

补充对 Orca 稳定性设计的源码级阅读与取舍结论。Orca 用五层机制保障稳定。**Splice 状态机**：9 个显式状态只允许固定前向迁移，`mayAcknowledgeClient` 的注释明确“success before both forwarding handlers exist can strand a client on a fake splice”，即两个转发 handler 都装好之前绝不告知客户端已连接——这一条直接消灭“显示已连上但发不出数据”的假成功。**控制连续性代次**：状态 ACTIVE／ORPHANED／DRAIN_ONLY／FENCED／CLOSED，主机掉线时按 `controlLossDisposition` 分 rebind（resume secret 匹配）、fence-old（存在竞争代次）、orphan-grace（不确定，宽限 30 秒）。**准入预算与背压**：预认证连接 45 总计、每源 4、每源每分钟 30；为宿主控制重连预留 100 个座位、数据 socket 150 个；背压水位 64KB 低／256KB 高、硬上限 8MiB+256KB（注释说明必须至少容纳一个 maxFrameBytes 帧，否则大响应被 LIMIT_EXCEEDED 掐死）；splice 卡死 10 秒超时。**语义化关闭码与心跳**：4401 凭据错误、4404 主机离线、4408 对端丢弃、4409 连错 cell、4429 超限、4503 排水；控制 ping 15 秒、静默 75 秒、授权到期前 60–120 秒刷新、已建立 splice 对短暂授权过期有 60 秒宽限。**Resume 双轨**：token 带版本，`acceptedAs` 为 current 或 grace，30 天 TTL，凭据安装用 `expectedCurrentHash` 做乐观并发。另有容量测试夹具，用确定性模型证明 4000／10000 条常驻控制连接的心跳与刷新不会同步成悬崖。

但这套机制的运维代价必须如实记录：`cloud/docs/relay-reconnect-2026-09-findings.md` 记载一次真实事故中 18 次 dry-run 仅 1 次通过、16 次冻结，几小时内 10 次级联故障、75–98 次容器死亡，根因包括 Postgres 热行锁竞争、checkpoint 循环与监控误报，并为此合并多个 PR 修监控自身缺陷。稳定性在该规模是专职投入换来的。JanusX 当前量级只需抄五件：Splice 状态机与“未装好转发不 ack”、语义化关闭码、背压水位（lab 已有 `bufferedAmount` 概念可迁移）、Resume current／grace 与宽限、心跳；**不需要**多区域、director、cell 迁移、fence broker、10k 容量夹具与 Postgres。

本轮决策与现有需求文档存在矛盾，必须显式记录：`requirements/public-web-terminal-foundation.md` 原文要求“终端内容及操作直接在控制端与宿主间传输，不经开发者或开发者购买的 Relay/TURN/托管隧道转发”，以及“也不自动启用业务中继”，其验收标准按中继方案将无法通过。connection-lab.md 已记录约束被显式反转，但需求文档的 AC 尚未修订，仓库内因此存在互相矛盾的记录；需决定是修订 AC 还是标注被新决策取代，建议保留原文痕迹而非删除，以留存“曾经如此要求”的历史。

对蓝图与知识库同步的影响：中继方向与[tob-transport](./tob-transport.md)的团队同步基座**是对齐的而非偏离**。该决策要求“identity-authenticated connections carrying short sessions authorized level by level (tenant, project, resource)”、“server-side monotonic versions plus domain events”、“client snapshots with sync cursors and an outbound queue”，其 AC 明确为“个人版传输选择作为共享库复用，令牌认证取代设备配对”。**团队同步本来就需要服务器**，因此此前“开发者不运营任何服务器”的约束与该目标本就不兼容；中继是团队同步基础设施的第一块，不是绕路。为此中继设计必须遵守四条：其一，中继是哑字节转发器、不认识业务——Orca 的 relay 只转发 opaque E2EE stream，故能同时承载终端流、文件浏览与 agent 会话，一旦掺入终端语义，团队同步阶段就得再修一遍；其二，配对模型可升级为 session token，身份层与传输层分开，不把配对写死在中继里；其三，授权按资源分级（tenant／project／resource），维持现有 gateway 的 action-token 形状，不放任“连上了就能做一切”；其四，E2EE 不锁死 pairwise，加解密全在端点完成，以便将来支持多成员按权限读取同一份 note。

## Alternatives considered

直接改生产远控会把尚未验证的身份、信令和穿透依赖带入主流程，增加返工范围。只有流程演示不能验证实际加密、WebRTC 与输出恢复。自建动态服务、托管业务中继和 TURN 保底与本轮约束不符；手动交换仅作为定位信令故障的对照，不替代扫码后的自动连接目标。

## Consequences

下一步必须收集家庭宽带与手机蜂窝的双方报告、另一运营商或网络的重复结果、手机后台及切网恢复、两家供应商真实授权与取消/过期结果，再判断无 TURN 的覆盖是否可接受。公共节点本次成功不代表长期开放、免费或允许产品接入，正式选择前需确认使用条件。

完整管理员角色、多主机授权传播、持久组织与账号恢复、密钥备份、主机接管及蓝图/知识库同步没有实现，仍由[主机组织提案](./host-owned-organization.md)讨论。这个验证工具不能保证以后完全不改架构；身份、信令、传输和业务模型分层可以减少替换单层时的影响。静态测试入口已配置；正式登录应用注册、控制页更新和公共依赖可用性仍需开发者管理。
