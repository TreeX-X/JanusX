# JanusX Android P2P Lab

Android 原生测试 App 已接入 JanusX 桌面配对与真实 Claude Code 终端；本目录的合成主机仅验证 WebRTC DataChannel 的 UDP 消息往返。仅使用 ICE/STUN，不配置 TURN，不中继业务消息，手机配对不依赖账号。

## 手机扫码配对（0.1.10）

安装 `apps/android-lab/app/build/outputs/apk/debug/app-debug.apk`，标题应显示版本 0.1.10，可覆盖安装旧测试版。重启更新后的电脑 dev，在设置 → 创新功能 → 远程协作控制中开启开关，再从底部手机远程入口生成新二维码；默认选择当前工作区，也可在开启前选择其他工作区。新配置默认异网并预填已部署的 Cloudflare 信令，无需自行部署或填写域名。旧配置保留明确的 LAN/自建地址选择，空地址和临时 Quick Tunnel 地址会填充或迁移到新入口；旧 LAN 配置需手动切换异网。手机点击「扫码配对」，允许相机权限，对准电脑二维码后在电脑批准。安卓初始地址与桌面共享默认配置，扫码内容始终覆盖初始值。

浏览器能打开健康页而 App 信令超时时，先断开，在「详情 → 检查信令网络」运行 App 内检查；检查会自动打开独立日志窗口，也可点击顶部「日志」重新打开，使用「复制全部」提供包含 HTTPS 结果及证书详情的 `NET` 日志。检查依次使用 HTTP/1.1 健康请求和独立连接池的 WebSocket 握手，不发送邀请、配对密钥或业务消息。HTTPS 检查显示 DNS、TCP、TLS 和 HTTP 阶段；WSS 仅能观察 DNS、握手成功或最终失败，不能凭最后阶段确定具体 TCP/TLS/升级阻塞点。系统 VPN 标记及 HTTP proxy 类型不等于已证明该目标经过 VPN 节点；浏览器可能使用不同的 DNS、代理或 HTTP 协议路径。

0.1.4 使用离线 xterm 显示真实终端屏幕，处理 ANSI/VT 光标、清屏、颜色及中英文，不再把原始控制序列和连接日志追加到同一个文本框。默认「适宽」显示全部列，A−/A+ 放大后可左右滑动；支持历史滚动、到底部、同步、常用控制键和软键盘输入。连接参数与日志折叠到「详情」。断开后点击「连接」恢复同一终端，新建按钮明确创建新进程；原生应用离开前台仍会断开连接。关闭创新功能会停止远程服务，但电脑终端继续运行。电脑状态栏显示手机连接和远程终端数，面板提供「在桌面查看」。详见[配对握手 Note](../../.agents/notes/remote/android-pairing-handshake.md)。

0.1.3 修复沙箱 preload 格式/路径、构建后资源定位、安卓 SDP 签名缺失及过早 hello 丢失。电脑底部「远程已开启」面板自动显示连接阶段与待审批设备，点击批准后手机显示授权结果；创建 Claude Code 后自动订阅输出。详细原因、实现与验证边界见[配对握手 Note](../../.agents/notes/remote/android-pairing-handshake.md)。

0.1.2 针对真机持续无法识别的反馈，扩大扫码取景区域并启用连续对焦，隐藏正常但容易引起误解的红色指示线。电脑端二维码原显示区域约 176px，现扩大为最大 320px，以整数比例生成二维码、保留四模块留白并使用像素显示。需要重启更新后的桌面 dev 并重新生成二维码；Android 包不能改变旧桌面生成的图片。上述是针对识别困难的改进，不代表已定位所有机型上的唯一原因。

0.1.2 验证：Android 构建及 lint 通过（0 errors、6 warnings），APK 签名校验通过；模拟器覆盖安装、自定义扫描页启动及取消返回通过，无崩溃日志，相机日志确认实际采用 continuous-picture。用 ZXing Core 3.4.1 对浏览器在 1、1.25、2 倍像素密度下显示的新二维码截图解码，三份均还原完整配对 JSON。证据位于 `artifacts/android-lab/scan-fix-build.log`、`scan-fix-camera.png`、`qr-display-*.png`；这不代表真实相机光学识别已验收。

扫码采用固定版本 ZXing Embedded 4.3.0，在设备本地识别，不保存相机图片，不需要外部扫码 App。只接受 v1 配对 JSON，校验地址、邀请、密钥格式和有效期；无效或过期码显示错误，不发起连接。取消扫码返回主界面；拒绝权限可以重试或保留粘贴 JSON 的方式。相机为可选硬件，无相机设备仍可手动配对。进入扫描页会按现有前台连接规则断开当前连接。

0.1.1 本机验证：assembleDebug 与 lintDebug 成功（0 errors、6 warnings），APK v2 签名校验通过；模拟器覆盖安装、相机权限拒绝提示、授权后相机预览及取消返回均通过，最终运行未见崩溃。使用调试启动参数验证不支持版本、过期和无效密钥三种载荷均被拒绝（与扫码共用校验函数）；这不是镜头解码测试。证据：`artifacts/android-lab/scan-build.log`、`scan-camera.png`、`scan-validation.log`。真机镜头识别和扫码到电脑审批的完整闭环尚未执行。

## 本机环境

工具位于 `D:\JanusX-Android`：Microsoft JDK 17、Gradle 8.9、Android SDK 35、Android Emulator 和 Google APIs x86_64 系统镜像。AVD 名称为 `JanusX_API35`，使用 WHPX 加速。未修改系统 PATH 或全局 Java。Windows Hypervisor Platform 已启用；系统可能仍提示重启，脚本不会自动重启。

新机器可运行 `node scripts/android-lab/setup-tools.mjs` 安装固定版本便携工具，再执行 Prepare。安装器校验下载摘要；Gradle 官方下载失败时使用摘要相同的镜像。需要 Node.js、网络及足够的 D 盘空间。

## 运行

在仓库根目录打开 PowerShell。首次安装测试依赖及 Chromium：

```powershell
npm --prefix scripts/android-lab install
npm --prefix scripts/android-lab exec -- playwright install chromium
powershell -ExecutionPolicy Bypass -File scripts/android-lab/run.ps1 -Action Prepare
powershell -ExecutionPolicy Bypass -File scripts/android-lab/run.ps1 -Action Build
powershell -ExecutionPolicy Bypass -File scripts/android-lab/run.ps1 -Action Emulator
```

若 Maven 下载缓慢，可在执行 Build 前设置当前终端变量。该设置不修改系统代理：

```powershell
$env:JANUSX_ANDROID_GOOGLE_MIRROR='https://maven.aliyun.com/repository/google'
$env:JANUSX_ANDROID_CENTRAL_MIRROR='https://maven.aliyun.com/repository/central'
```

模拟器启动后，构建桌面程序，再运行真实桌面/安卓联调：

```powershell
npm run build:app
```

安装 App 并自动测试：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/android-lab/run.ps1 -Action Install
powershell -ExecutionPolicy Bypass -File scripts/android-lab/run.ps1 -Action Smoke
```

Smoke 调用 `desktop-smoke.mjs`，启动隔离 profile 的真实 Electron 和临时信令端口，解码电脑二维码后经 `10.0.2.2` 交给模拟器。它检查自动审批显示、授权前拒绝操作、批准、真实新建 Claude Code 与启动界面输出、电脑停止远程。需要电脑已安装 Claude Code。它会覆盖安装模拟器上的测试 APK、清空模拟器 logcat 并操作测试 App；结束后关闭该次桌面测试程序和终端，不操作已有桌面会话。它不验证真实摄像头、模型响应或异网穿透。

APK 输出：`apps/android-lab/app/build/outputs/apk/debug/app-debug.apk`。Smoke 证据位于 `artifacts/android-lab/desktop-smoke-*/`，包括 `report.json`、`android.log` 和 `terminal-startup.txt`。二维码载荷与临时凭据仅在忽略目录保存。原 `server.mjs`、`host.html` 是历史合成 echo 对端，不支持新签名配对，不再作为 Android MVP 的 Smoke。

## 传输与边界

Android 0.1.7 与桌面共享默认 `wss://janusx-signal.740288105.workers.dev/signal`。用户报告手机健康检查可达，公网 WSS 经电脑代理验证通过；仍需两端实际网络都能连接，不能将健康检查等同于手机 WebSocket 或 UDP 成功。旧 LAN 二维码仍不能供普通蜂窝网络访问，STUN 也不会公开 LAN 信令。部署与排障见[说明](../remote-lab/signaling.md)。无 TURN，无法保证所有 NAT 可达。

Android 使用固定版本的 `io.github.webrtc-sdk:android` 原生 libwebrtc 构建和 OkHttp 信令。`LabTransport` 隔离连接、发送、路径检查及关闭。当前只有一个可靠有序通道，单次发送最多 16 KiB，缓冲量超过 256 KiB 时拒绝新消息。正式文件传输应分块并单独设计流控。

Node WebSocket 仅传递 SDP 和 UDP ICE 候选，拒绝业务消息及 relay 候选。合成主机是无头 Chromium 测试夹具，提供 ping/pong 与 Unicode echo，不执行 shell，不验证真实桌面配对与终端回放。原生 App 离开前台断开，网络切换需手动重连。调试版允许本地 ws，正式版要求 wss。

模拟器联通不证明真实跨网打洞成功。无 TURN 无法保证所有 NAT、防火墙及蜂窝网络可达；STUN 与信令仍需可达。后续应使用真机蜂窝连接异网宿主，测试建立时延、长连接、丢包、切换网络和恢复。当前邀请、设备批准和凭据用于单次桌面远程启用期间的配对，不代表长期团队信任已实现。

## 检查

```powershell
node --test scripts/android-lab/server.test.mjs
npx vitest run tests/unit/mobile-handshake.test.ts
node scripts/check-agent-notes.mjs
```

原生编译、Android lint 与 Java HMAC 单测由 Build 执行，Gradle preBuild 用 Node/esbuild 将已安装的 `@xterm/xterm` 打包成 APK 离线资源，因此构建前需在仓库根目录安装 Node 依赖。真实桌面/Android 本机链路由 Smoke 执行，覆盖开关门控、真实创建与桌面显示、WebView 终端绘制、适宽/字号、分片 VT/中文/emoji fixture、同终端重连和关闭服务保留进程。VT fixture 单独标注，不冒充真实 CLI 输出。server.test.mjs 仅是历史合成服务的测试。实际执行结果记录在配对握手 Note 中，未执行的真机跨网测试不计为通过。

2026-10-20 本机执行结果：Build 成功，Android lint 为 0 errors、3 warnings（实验界面的翻译、图标和备份配置建议）；两项信令服务测试通过。Smoke 连续两次通过，手动 Disconnect → Connect 后再次收到 pong。ADB 点击发送中文 `你好 JanusX`，界面回显内容一致，选中路径为 UDP、host/prflx，无 relay。观察到的消息往返约 4–41 ms，仅作功能证据，不是性能基准。截图保存在 `artifacts/android-lab/emulator.png`。真机跨网、长期稳定性、弱网和网络切换测试尚未运行。
