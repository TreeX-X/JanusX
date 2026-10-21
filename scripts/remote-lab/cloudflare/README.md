# Cloudflare 免费信令

Workers Free + SQLite Durable Object，使用平台域名，无需购买服务器或域名。免费额度有限，超额可能停止服务，本方案不需要升级付费套餐。已入房连接使用 WebSocket Hibernation，附件保留房间、角色和预算；未入房最多等待五秒。单协调对象最多 256 个连接，每连接最多 300 条消息、2 MiB 累计和 128 KiB 单帧，适合少量设备验证。

## 部署状态

```text
wss://janusx-signal-entry.pages.dev/signal
```

2026-10-21 已部署到用户授权账号。当前默认入口为 Pages，通过服务绑定 `SIGNAL_SERVICE` 调用已有 `janusx-signal` Worker，房间及 Durable Object 不复制；仅增加公网 TLS 入口，不中继终端业务。电脑直连及经代理分别通过八项公网检查，包含 HTTPS/WSS、入房、签名 offer/answer、双向 IPv6 UDP 候选及 ICE 代次、ping/pong、业务拒绝/离开通知和重连。本地九项测试通过，包含 Pages 绑定的握手/入房。手机新入口 WSS、真实异网 UDP 与不同运营商可达性尚未验证。

原 `wss://janusx-signal.740288105.workers.dev/signal` 保留为后端入口：电脑直连 HTTPS 超时，经代理通过；真机浏览器健康页可达，但 App 对该域名 TLS 超时，对百度 TLS 正常。上述证据不能确定 VPN/DNS 的具体阻塞点。桌面仅将完整匹配的旧官方地址迁移到 Pages，自建路径和明确 LAN 选择保留。现有 Android 0.1.10 无需重装：电脑更换入口并重新生成二维码，扫码决定本次实际地址；后续构建从共享 JSON 取得新默认值。免费额度与域名可达性限制依然适用。

## 命令

从仓库根目录运行：

```powershell
npm --prefix scripts/remote-lab/cloudflare ci
npm --prefix scripts/remote-lab/cloudflare test
npm --prefix scripts/remote-lab/cloudflare run typecheck
npm --prefix scripts/remote-lab/cloudflare run login
npm --prefix scripts/remote-lab/cloudflare run deploy
npm --prefix scripts/remote-lab/cloudflare run verify -- wss://janusx-signal-entry.pages.dev/signal
```

新账号使用部署输出的实际域名，必要时在控制台创建 Workers 子域名。登录由账号拥有者在浏览器完成，不把凭据放入仓库。Wrangler 与配套 Miniflare 固定版本；本地测试通过官方 V4 配置转换器启动真实 workerd。更新依赖需复验配置和测试。

验证命令默认不读取代理环境变量；明确追加 `--proxy` 才使用已有 `HTTPS_PROXY`，报告标记 `viaProxy: true`，不输出代理地址。报告分别保存在忽略目录 `.wrangler/public-verification.json` 和 `.wrangler/public-verification-proxy.json`。代理成功不代表国内直连成功。

Pages 使用高级模式 `_worker.js`，配置位于 `pages/wrangler.jsonc`。在 `scripts/remote-lab/cloudflare/pages` 执行 `node ../node_modules/wrangler/bin/wrangler.js pages deploy public --project-name janusx-signal-entry --branch main --commit-dirty=true` 更新入口；后端仍使用上面的 Worker deploy 命令。不要以临时的部署哈希域名替代稳定项目域名。

## 两端使用

电脑宽带与手机流量分别打开 `https://janusx-signal-entry.pages.dev/health`，期望 `JanusX signaling`；手机还需在 App 内确认 WSS HTTP 101。新桌面配置默认异网并预填地址；旧配置明确选择 LAN 时需切换异网。重新生成二维码让手机扫码，最后电脑批准，无需新增服务共享密钥。`src/shared/remote-defaults.json` 同时供应桌面和安卓 BuildConfig，客户端可保留自建地址，二维码始终决定本次实际连接。

Worker 兼容首帧 `join` 的 48 位十六进制 invite 与 host/client 角色，邀请用于定位房间，SDP HMAC 由两端验证；服务不持有配对密钥。Node 与 Worker 共用白名单协议校验，只转发对应角色的 SDP 和非 relay UDP 候选，剥离额外字段，拒绝终端消息，不提供 TURN 或业务中继。邀请码不是远程操作授权，仍需对端验签和电脑审批。

健康检查不证明 WebSocket 或 UDP 成功。入口不可达时反复 UDP 打洞无效；需先解决信令可达性，不能将代理测试结果当作真机验收。

## 验证边界

本地八项测试覆盖端点、现有协议、隔离/休眠恢复、释放重连、非法消息、白名单字段、休眠后预算和入房超时。关闭握手可晚于超时拒绝。真实手机异网 UDP、不同运营商和长期空闲仍待验证。服务未实现账号级准入、抗滥用和多协调对象分片；使用规模增长、额度耗尽或遭占用时重新评估。

官方参考：[入门](https://developers.cloudflare.com/durable-objects/get-started/)、[休眠 WebSocket](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/)、[免费额度](https://developers.cloudflare.com/durable-objects/platform/pricing/)。
