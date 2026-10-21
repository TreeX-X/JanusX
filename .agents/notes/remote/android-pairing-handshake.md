---
{
  "schema": "harness-note/2",
  "id": "c1f8b8a9-04b5-437c-b73a-6053b4edf498",
  "kind": "note",
  "lifecycle": "accepted",
  "created": "2026-10-20",
  "updated": "2026-10-21T03:25:21Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5",
  "tags": ["remote", "android", "pairing", "verification"]
}
---

# Android 与桌面配对握手

手机扫码后先连接信令，再交换经过二维码密钥认证的 SDP，建立 UDP DataChannel，最后提交设备申请。电脑收到申请后才显示批准按钮。`SIGNAL connected` 仅表示 WebSocket 打开；关闭电脑远程时手机收到信令断开，也不能证明此前建立过 P2P。主动重连产生的旧连接 CLOSED 日志不应混入新连接状态。

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
