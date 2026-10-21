---
{
  "schema": "harness-note/2",
  "id": "c1f8b8a9-04b5-437c-b73a-6053b4edf498",
  "kind": "note",
  "lifecycle": "accepted",
  "created": "2026-10-20",
  "updated": "2026-10-20T17:15:08Z",
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

这些结果不勾选[真实远程终端需求](./requirements/android-remote-terminal.md)中的异网真机验收：本轮没有验证手机摄像头的光学识别、蜂窝网络穿透、完整模型对话、弱网、网络切换或长期稳定性。手机输出仍是原生测试文本视图，完整 VT 屏幕排版不是本轮新增能力。旧 APK 与旧桌面需要一起更新；重新开启远程生成新的五分钟二维码后继续真机测试。
