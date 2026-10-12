# JanusX 中继试验台（重构中）

公网远程连接的**中继方案**试验台。2026-10-12 之前这里是 WebRTC + STUN 无 TURN 直连方案，已在本机 CGNAT 宽带（WAN `10.44.66.57`、无 IPv6、双重 NAT）上被真实跨网络测试否定，实现与端到端测试已全部移除。方向、证据链与三个参考实现的源码级阅读记录在 `.agents/notes/remote/connection-lab.md`。

## 选定方向

主机与手机各建一条**出站** WebSocket 到中继，按配对 ID 配对并转发**已加密**字节。中继是哑字节转发器，不认识业务。

- **部署形态**：中继代码跑在用户自己的 Windows 机器上，由 `cloudflared` 提供公网入口（`wss://relay.<域名>` → Cloudflare 边缘 → cloudflared 出站连接 → 本机 `127.0.0.1`）。零服务器成本、无运维、只听回环不暴露局域网。`cloudflared` 手动安装，不捆绑进 JanusX。
- **未来方案（已保留未启用）**：团队同步需要中继 7×24 在线时，把同一份 Node 代码迁到 Linux VPS，协议与客户端不变。
- **不复用**：WebRTC、STUN/ICE、Nostr 信令、TURN。二维码直接编码域名与配对信息，不再交换 SDP 与候选。
- **完整复用**：`src/main/companion/gateway.ts` 及其 action-token、binding-store、dedupe、audit-store；GitHub Device Flow / Google JWKS 身份验证（工作在传输层之上，由主机侧直连供应商，不受影响）。

## 目录现状

| 文件 | 作用 |
|---|---|
| `protocol.mjs` | 合成主机模型：成员审批、请求去重、有界回放、输出序号跟踪。零外部依赖。新方案测试直接复用 |
| `auth.mjs` | GitHub Device Flow 与 Google JWKS 验证，主机侧执行，token 不离开主机 |
| `server.mjs` | 回环身份助手（仅 `127.0.0.1`），带 Host / Origin / Content-Type 三重校验 |
| `nat-probe.mjs` | STUN 映射探测：判断本机是锥形 NAT 还是对称 NAT、映射地址是否为 CGNAT 共享段 |
| `lan-probe.mjs` | 同网段连通性排查（仅两端同网段时有意义） |
| `tests/protocol.test.mjs` | 合成主机模型的纯逻辑测试 |
| `tests/auth-server.test.mjs` | 身份验证与回环 API 边界测试 |

```powershell
npm --prefix scripts/remote-lab test
npm --prefix scripts/remote-lab run nat-probe
npm --prefix scripts/remote-lab run lan-probe
```

## 待办

1. **中继协议契约**——配对、帧格式、E2EE 握手、重连语义。这是后续所有代码与测试的地基，尚未开始。
2. **必须遵守的四条约束**（服务将来的蓝图 / 知识库团队同步，详见 note）：中继是哑字节转发器不认识业务；配对模型可升级为 session token；授权按资源分级（tenant / project / resource）；E2EE 不锁死 pairwise。
3. **需要实测**：Cloudflare 免费档对 WebSocket 消息大小与单连接时长的限制。终端文本流量极小，大概率不构成问题，但这是第一步最小验证的测量项。
4. **心跳是必需的**：Cloudflare 边缘会掐除长时间空闲连接，中继与两端客户端都必须有规律心跳。

## 从 WebRTC 方案保留的教训

同机冒烟（两个浏览器进程、本机中继）**完全不能覆盖跨公网场景**。WebRTC 的失败模式取决于用户网络，中继的失败模式只取决于服务器是否在线——后者可测试、可推理，这是换传输层的根本理由。
