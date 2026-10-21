---
{
  "schema": "harness-note/2",
  "id": "c1f8b8a9-04b5-437c-b73a-6053b4edf498",
  "kind": "note",
  "lifecycle": "accepted",
  "created": "2026-10-20",
  "updated": "2026-10-21T06:34:49Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5",
  "tags": ["remote", "android", "pairing", "verification"]
}
---

# Android 与桌面配对握手

手机扫码后先连接信令，再交换经过二维码密钥认证的 SDP，建立 UDP DataChannel，最后提交设备申请。电脑收到申请后才显示批准按钮。`SIGNAL connected` 仅表示 WebSocket 打开；关闭电脑远程时手机收到信令断开，也不能证明此前建立过 P2P。主动重连产生的旧连接 CLOSED 日志不应混入新连接状态。

## 当前直连重试与诊断

真机异网反馈为 SDP 已验证、local=2、srflx=1、remote=3，测试电脑是仓库开发版。当前 Windows 为该开发 Electron 路径配置了 Public 入站 UDP 放行；电脑向多个 STUN 目的地探测得到响应，并在同一探测 socket 观察到相同映射。以上只证明此次电脑 STUN 可达和手机收到候选，不证明所有候选已应用、手机 NAT 类型、无 CGNAT、或双方能互通。尚无真实手机的候选对检查统计，不能把故障归因确定为某侧防火墙或运营商。

0.1.6 修复建连阶段一遇 ICE/PEER FAILED 就由 Activity 销毁整个传输的行为。电脑在未打开数据通道时最多自动协商三轮，每轮 20 秒，重建 PeerConnection 取得新的 ICE 凭据；手机保留信令，在下一份验签成功的 offer 到达时清理旧 peer 并创建新 peer。手机总建连等待由 45 秒调为 75 秒，留出信令和三轮检查时间。已打开的通道沿用原授权、断线恢复和健康连接保护，不因定时重试替换。重新收集能覆盖瞬时路径变化，但也有多等候和重复探测成本，不保证受限 NAT 一定成功。

最终联调曾出现快速重连在入房时被 1008 拒绝：旧 WebSocket 的优雅关闭尚未释放房间。Android 主动断开改为立即取消旧 socket；新连接仅在尚未入房且收到 1008 时，最多间隔 500ms 重试三次，仍受总超时约束，入房后的协议拒绝不自动重试。旧 socket 回调不能污染新连接。该问题与 UDP 打洞失败分开诊断，不通过放宽房间角色唯一性处理。

双方本地 SDP 成功设置且签名消息送出后才发送缓存候选，避免候选早于 SDP 的时序依赖。候选携带 usernameFragment，answer 携带对应 offerUfrag；以 SDP 中的 ICE ufrag 拒绝旧轮次候选/应答，并检查候选文本内的 ufrag。异步 SDP、候选和关闭回调绑定具体 peer 代次，旧原生回调不能关闭或污染新连接。字段缺失仍兼容旧 v1 消息，但完整重试应同时更新桌面与 Android。

候选应用失败不再直接清理整条桌面链路，继续检查其他候选并独立计数。Android 区分 remote 收到、applied 成功、rejected 拒绝，重试时重置当前轮次计数；记录本地 IPv6 候选数，显式保留所有网络、Wi-Fi IPv6 和持续收集策略。双方诊断可报告候选对数量、检查请求、应答和成功数量，Android 在等待八秒及原生失败时读取统计，电脑在重试前读取；不记录候选地址、SDP 或密钥。零应答不能单独确定阻塞发生在哪一侧。辅助 nat-probe 也移除“公网映射排除 CGNAT”等过度结论。

信令继续拒绝 TCP、relay 和业务消息，只允许有界的 ICE 代次元数据；真实传输仍需验证选中 UDP 非 relay 路径，不引入 TURN。公网信令长期方案与临时隧道区别见[部署说明](../../../scripts/remote-lab/signaling.md)，当前尚无已运营的公共默认入口。

0.1.6 验证：`npx vitest run tests/unit/mobile-ice-retry.test.ts tests/unit/mobile-signaling.test.ts tests/unit/mobile-handshake.test.ts tests/unit/mobile-network.test.ts tests/unit/mobile-host-feature-gate.test.ts tests/unit/mobile-terminal-stream.test.ts tests/unit/workspace-remote-terminal-sync.test.ts tests/unit/experimental-features.test.ts --maxWorkers=2` 通过 39 项，覆盖 SDP 先于候选、原生失败/超时最多三轮、旧 ICE 代次丢弃、旧 SDP 操作迟到失败不关闭新 peer、IPv6/代次元数据转发及 TCP/relay/业务消息拒绝。TypeScript、变更生产 TS 的 ESLint、桌面构建和独立信令构建通过。Android Build 通过 APK、6 项 Java 单测和 lint（0 errors、15 warnings）。

最终 `$env:JANUSX_SMOKE_RETRY='1'; node scripts/android-lab/desktop-smoke.mjs` 对真实 Electron 与 Android 模拟器通过 17 项，证据为 `artifacts/android-lab/desktop-smoke-MP0nOA/`：首轮候选故意阻断后第二轮原生 UDP 成功；重连时故意占用 client 角色，手机短暂等待后入房；再次快速重连保持同一真实 Claude 终端；审批、VT 显示、同步及开关关闭保活复验通过。中间 `desktop-smoke-WH12Xc` 的 1008 快速重连失败已如上修复，不能作为通过证据。Android APK 为 0.1.6，需与桌面一起更新。

临时 Node 信令已重建并在原端口重启，Cloudflare 隧道及地址保持不变；当前 PID 以 `artifacts/remote-signal/quick-tunnel/runtime.json` 为准。公网验证 `node artifacts/remote-signal/quick-tunnel/verify-public.mjs wss://programme-columbus-efficient-snap.trycloudflare.com/signal` 通过七项，包含新增双向 IPv6 UDP 候选及 ICE 代次透传；证据为同目录 `public-verification.json`。真实手机异网、实际 IPv6 路径、受限 NAT、弱网和长期可靠性仍未验收，不将上述回环或公网信令结果当作真机 UDP 问题已解决。

## 实现与修复

0.1.3 修复桌面隐藏窗口的通信桥与资源定位。远程 preload 单独输出为 `out/preload/remote.cjs`，在 sandbox、contextIsolation 开启且 nodeIntegration 关闭的窗口运行。普通桌面继续使用原有 `index.mjs`。资源从应用根目录定位，避免 main 分块改变 `import.meta.dirname` 后指向错误路径；开发入口与 smoke 均从仓库根目录启动 Electron。桥加载和进程退出错误进入远程状态显示。

双方使用 HMAC-SHA256 认证 SDP，密钥为二维码中 secret 的 UTF-8 字符串，签名原文为 `invite + "\n" + type + "\n" + sdp`，保留 SDP 的 CRLF。Android 校验 offer，并为 answer 添加签名；桌面校验 answer。信令只校验消息形状并转发 SDP/UDP ICE，不取得密钥或终端数据。不同邀请、角色、密钥或 SDP 内容不能复用签名。

手机可能在桌面异步检查 UDP 路径时就发出 hello。隐藏窗口在验证完成前暂存最多八条有界消息，验证通过后先通知主进程初始化会话发送口，再交付暂存消息；未通过不得提交审批或执行终端操作。这样避免 hello 被过早处理，随后又被会话初始化清除。

电脑手机远程面板打开时每秒刷新状态，自动显示申请、批准/拒绝与已授权设备，无需关闭重开。手机区分加入信令、SDP 验签、UDP 建连、等待审批和授权结果；批准凭据不再显示或记录到手机输出日志。创建终端成功后自动订阅流式输出与回放，仍保留手动订阅入口。

## 验证与边界

`scripts/android-lab/run.ps1 -Action Build` 执行 APK 构建、lint 和两项 Java HMAC 单测；单测覆盖与 Node 的签名向量一致，以及篡改 SDP、角色、密钥、邀请或缺失签名的拒绝。`npx vitest run tests/unit/mobile-handshake.test.ts` 两项回归覆盖审批权限、创建去重、输出回放/推送、撤销后拒绝，以及 UDP 验证前收到 hello 的交付顺序。

`node scripts/android-lab/desktop-smoke.mjs` 使用隔离桌面 profile、真实 Electron 窗口和 Android 模拟器，读取电脑实际生成的二维码，经过真实签名协商与本机 UDP 建连；不使用合成终端。验证自动出现审批、未批准时拒绝创建、批准到达手机、手机创建真实 Claude Code、自动订阅启动输出及电脑关闭后的手机状态。测试结束只清理该次创建的终端和测试应用。原合成 echo/pong Smoke 不再作为本链路的验证入口。

2026-10-20 UTC 本机通过 Android 构建/lint（0 errors、6 warnings）、两项 Java 单测、两项 Vitest 回归、TypeScript 检查及桌面构建。真实联调证据位于忽略目录 `artifacts/android-lab/desktop-smoke-eQKXQA/` 的 `report.json`、`android.log`、`terminal-startup.txt` 及 profile 下的终端诊断日志。选中 UDP prflx → host，记录到真实 Claude Code 启动界面与 1514 字节回放、序号 6。测试对光标定位造成的分隔作处理，不能仅匹配窗口标题就认定 CLI 启动成功。

这些 0.1.3 结果不勾选[真实远程终端需求](./requirements/android-remote-terminal.md)中的异网真机验收：没有验证手机摄像头的光学识别、蜂窝网络穿透、完整模型对话、弱网、网络切换或长期稳定性。0.1.3 的原生文本视图未处理 VT 屏幕排版，后续由下述 0.1.4 实现替换。旧 APK 与旧桌面需要一起更新；重新开启远程生成新的五分钟二维码后继续真机测试。

## 创新功能、桌面可见性与终端屏幕

0.1.4 复用 `remoteControl` 创新开关，默认关闭，渲染端等待持久配置加载；主进程开启远程前再次校验。关闭开关会停止隐藏 WebRTC 主机、信令与设备授权，不结束已创建的终端。停止期间的异步开启通过代次取消，防止关闭后迟到的二维码生成重新创建主机。

原远程面板无条件常驻、默认使用登记列表第一项，而且只在打开面板时更新连接状态，可能把手机启动的终端存入非当前工作区而让桌面看似没有变化。现在默认选当前工作区，开启前可选择授权范围；状态栏在面板关闭时也刷新待审批、已连接和终端数量。手机创建复用 `terminal:created`、App 级生命周期和工作区快照，当前工作区更新 load state；远程面板列出 PID 和进程状态，提供「在桌面查看」，不抢走其他工作区的焦点。

Android 将原生文本框替换为离线 WebView 中的 xterm 6，复用桌面已安装依赖，Gradle 构建时从仓库 Node 依赖打包 JS/CSS 和许可证，无 CDN 或新远程依赖。仅允许读取四个白名单本地资源，禁用导航、网络加载、文件及 content 访问；原生桥只提供就绪、同步与状态回报，不接受终端命令。终端内容按原字节顺序写入解析器，不插入换行，不混入连接日志；10,000 行显示滚动缓冲与主机约一百万字符有限回放各自独立。

屏幕采用电脑 PTY 的列/行数，回放和输出包携带几何尺寸，手机不反复争用桌面 resize。默认适宽展示完整列，A−/A+ 切换为可横向平移的可读字号，「适宽」恢复全宽；支持滚动、到底部、手动同步及 Enter/方向键/Tab/Esc/Ctrl+C。输入区响应系统边距和软键盘，旋转保留 Activity 与当前连接；连接详情折叠，终端使用剩余空间。ASCII、ANSI、中文与 emoji 都交由终端解析，不能用删除控制码替代屏幕重绘。

首次订阅重置屏幕，按 replay-start/data/end 恢复后记录序号；实时分片在 final 到达后才推进序号，重复包跳过、缺口暂停并申请回放。主机在 Unicode 码点边界分片，避免 emoji 的代理对跨独立 JSON/UTF-8 包损坏。回放保留有限历史，截断会明确提示；不是无限历史或完整 VT 状态快照。断线不杀电脑终端，手机重新连接后从 approved 中恢复同一终端和列表；已批准的同一邀请可以在二维码过期后凭授权 token 重连，新的配对仍受五分钟限制。跨连接回调通过代次丢弃，创建/输入使用随机请求 ID，未确认输入保留草稿并提示先检查结果，避免自动重发。

## 0.1.4 验证

自动化通过 20 项 Vitest，覆盖主进程开关拒绝/异步取消、授权与去重、Unicode 分片、断线归属、已退出终端回放、序号缺口及分片 VT 写入；命令为 `npx vitest run tests/unit/mobile-handshake.test.ts tests/unit/mobile-terminal-stream.test.ts tests/unit/mobile-host-feature-gate.test.ts tests/unit/workspace-remote-terminal-sync.test.ts tests/unit/experimental-features.test.ts --maxWorkers=2`。

`npm run typecheck`、`npm run build:app`、变更 TypeScript 文件 ESLint 和 `npm run i18n:check` 通过；Android Build 完成 assembleDebug、lintDebug（0 errors、14 warnings）及两项 Java 单测。lint 建议涉及本地实验界面翻译、图标、备份属性、扫码方向和程序构建 View，未将警告计为无警告通过。

`node scripts/android-lab/desktop-smoke.mjs` 对最终 APK 通过 12 项检查，证据在 `artifacts/android-lab/desktop-smoke-bt4ACk/`：真实 Electron 与 Android 模拟器完成配对审批、新启动 Claude、桌面侧栏/终端/状态栏出现、离线 xterm 绘制、适宽与放大后横向查看、同终端重连，以及关闭开关断连且保留进程。单独注入的 VT fixture 验证跨包擦行/光标序列、中文和 emoji，随后重新订阅恢复真实 CLI；fixture 不冒充模型响应。`android-terminal.png`、`desktop-terminal.png`、`android-screen.txt`、`android.log` 与 `report.json` 保留对应截图和机器证据。Note 检查为 0 errors。

本机模拟器与构建验证不替代真实手机的字体、软键盘、触控滚动、旋转、异网、弱网和长期稳定性验收，也不宣称完整模型对话已验证。APK 为 `apps/android-lab/app/build/outputs/apk/debug/app-debug.apk`，桌面和 Android 必须一起更新。

## 异网信令与失败诊断

0.1.5 针对真机异网无法连接的反馈修复入口配置。此前桌面始终生成第一张非回环 IPv4 网卡的局域网信令地址，手机切换蜂窝网络后通常无法访问，甚至尚未开始 SDP/ICE；当前电脑同时存在 ZeroTier、物理以太网和 APIPA，第一网卡也不能代表正确 LAN 路径。桌面现在区分同局域网和异网：LAN 排除回环/APIPA，将常见虚拟网卡排后并允许手动选择；异网必须填写双方可访问的公网 `wss://` 信令，STUN 可配置，网络模式与服务地址保存在桌面 profile。主进程校验当前网卡及地址，公网拒绝明文 ws、URL 用户名/密码与 fragment；运行状态显示实际信令地址。网卡排序是启发式，未声称检测默认路由。

现有 `src/main/remote-signal.ts` 原本没有构建入口。`npm run remote:signal:build` 将同一生产信令代码打包为 `artifacts/remote-signal/server.mjs`，可复制到 Node.js 22+ 服务器独立运行，经 TLS WebSocket 反向代理提供公网入口。部署步骤见[信令说明](../../../scripts/remote-lab/signaling.md)。信令继续只转发 SDP/UDP ICE，不承载终端业务、secret 或授权 token；无 TURN。当前没有已配置或已部署的公共默认服务，代码改动不能自行赋予 LAN 地址公网可达性。

隐藏 WebRTC 窗口在 DataChannel 打开后最多约两秒重试读取选中候选对，避免统计稍晚出现导致已有 UDP 通道被误拒绝；确认前仍有界暂存 hello，未验证 UDP 或选中 relay/TCP 时仍拒绝。STUN 错误和本地 UDP/映射候选数量进入状态提示。自身信令失败/关闭时保留独立的已打开通道，重新加入不主动替换健康通道；若新手机已加入而旧通道随后关闭，则继续协商，避免快速重连漏掉 offer。信令明确通知对端离开房间时关闭通道，保证电脑停止远程后手机及时识别断开；这也意味着对端仅丢失信令时可能需要手动重连。失败原因在清理后上报，避免被通用“连接已断开”覆盖。

Android 使用阶段和候选计数区分信令未连通、未加入会话、等待电脑 offer、SDP 已验证但 UDP 未建立。总建连超时给出当前阶段提示；即时信令错误记录异常类别和 HTTP 状态，不记录二维码/密钥或候选地址。ICE 失败指出 STUN 映射及对端候选是否到达，界面保留具体错误，数据通道打开后的信令丢失不杀终端。阶段计数帮助定位，不能单凭有无 srflx 推断所有网络的 NAT 类型或可达性。

本机桌面 STUN 探测收到 Google STUN 响应，仅证明该电脑在此次探测中能访问该 STUN，不证明真实手机 UDP 可达、无 CGNAT 或异网验收完成。无中继无法保证任意 NAT/蜂窝网络联通；需公网信令与双方日志继续真机验证，当前异网验收项保持未勾选。

0.1.5 验证通过 30 项 Vitest（上述五个文件加 `tests/unit/mobile-network.test.ts`），新增覆盖公网 QR/地址校验、指定网卡、延迟统计以及 TCP/relay/缺失统计拒绝、保留健康通道与后续协商。TypeScript、变更 TS 文件 ESLint、i18n 检查及桌面构建通过。Android Build 完成 APK、4 项 Java 单测和 lint，结果为 0 errors、15 warnings；新增阶段诊断测试覆盖信令/协商/UDP 分流，映射计数不冒充连通且不暴露地址。

`npm run remote:signal:build` 产物复制到无 node_modules 的系统临时目录后，真实启动 Node 服务，验证健康检查、双端入房、SDP 转发及业务消息 1008 拒绝；证据为 `artifacts/android-lab/standalone-signal-report.json`。最终 `node scripts/android-lab/desktop-smoke.mjs` 通过本机 Electron/Android 全流程，证据为 `artifacts/android-lab/desktop-smoke-rUaagZ/`：新增公网地址必填、配置刷新保留、网卡选择及不可达信令的手机可见诊断，并复核审批、Claude 新启动、VT 显示、同终端重连、关闭开关断连保活。中间联调发现 peer-left 仍保留通道会延迟手机识别电脑停止，已修复并在最终运行复验；UIAutomator 自身偶发异常不作为 App 崩溃或真机证据。公网 TLS 部署、真实蜂窝异网、弱网及长期稳定性未执行。

## 临时公网测试入口

用户要求先提供一个可用地址后，已在当前开发电脑运行独立信令服务，绑定回环 `127.0.0.1:7683`，通过 Cloudflare Quick Tunnel 暴露 HTTPS/WSS。此次测试地址为 `wss://programme-columbus-efficient-snap.trycloudflare.com/signal`，仅用于当前临时运行，不写入产品默认配置。电脑、信令进程和 cloudflared 必须保持运行；关机、休眠或停止进程会使入口不可用，重建隧道会产生新地址，无长期可用性保证。正式公共默认服务仍未部署。

cloudflared 2026.10.2 从官方 GitHub Release 下载到忽略目录，SHA256 与官方 asset digest 一致（`12c7c887f8aaab779aef1dfa9b60673530a5adb88ecc55dd6df8f56e0b70f199`），未安装系统服务、修改全局网络配置或捆绑进 App。隧道仅转发已有信令，仍不承载终端业务或启用 TURN。运行 PID、地址和日志保存在 `artifacts/remote-signal/quick-tunnel/runtime.json`、`address.txt`、`signal.*.log` 与 `tunnel.*.log`；停止时应先核对 runtime 中 PID 对应的程序再结束，避免误杀后续复用 PID 的进程。

`node artifacts/remote-signal/quick-tunnel/verify-public.mjs <地址>` 经公网 HTTPS/WSS 对该服务完成六项检查：受信任 TLS 健康检查、host/client 入房、签名 offer、签名 answer、跨隧道心跳和业务消息 1008 拒绝。证据为 `artifacts/remote-signal/quick-tunnel/public-verification.json`。首次隧道注册前的 HTTP 1033 不计通过；隧道连接注册成功后完整检查通过。这是当前电脑经公网入口的真实信令验证，未覆盖真实手机蜂窝网络、UDP 跨网打洞、完整模型对话或长期稳定性，需求验收仍保持未勾选。
