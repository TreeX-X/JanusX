---
{
  "schema": "harness-note/2",
  "id": "a26b2bc4-ff89-489b-a538-4086b0f3c4f3",
  "kind": "decision",
  "lifecycle": "accepted",
  "created": "2026-10-20",
  "updated": "2026-10-20T15:45:44Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5",
  "tags": [
    "remote",
    "android",
    "p2p"
  ]
}
---

# Android 原生 P2P 实验

## Problem

用户优先开发 Android 测试 App 并在本机搭建模拟器，要求业务流量无中继，重视稳定性与扩展性。需要先验证原生传输，再决定生产终端接入。

## Decision

采用 Java 原生 Android 测试界面及 libwebrtc DataChannel，通过 LabTransport 隔离传输。可靠有序消息、DTLS 加密、拥塞控制与 ICE 由成熟协议栈提供；仅使用 UDP 候选及可选 STUN，禁用 TURN。依赖 io.github.webrtc-sdk 的第三方原生构建并固定版本；生产接入前仍需评估维护来源、更新和许可证。

本地 Node 服务只交换 SDP 与 ICE 候选；临时邀请限制为一台模拟主机和一个客户端，不转发业务消息。无头 Chromium 仅作为合成测试对端，提供 ping/pong 与 echo，无终端、文件或生产工作区访问。调试版允许本地明文 ws，正式版要求 wss；当前邀请机制不能替代生产设备身份与配对审批。

Android 35 x86_64 模拟器、SDK、JDK 17 与 Gradle 安装在 D:/JanusX-Android。已观察模拟器启动完成。App 仅前台连接，离开前台即断开，网络切换后显式重连。构建与端到端结果见[实验说明](../../../scripts/android-lab/README.md)，未完成的检查不得计为通过。

本机已执行 Build（assembleDebug 与 lintDebug）成功，信令服务 2 项测试通过，Smoke 两次通过，并通过 ADB 点击验证手动断开重连及中文 echo。双方选中 UDP host/prflx 路径，没有 relay 候选。证据位于忽略目录 artifacts/android-lab 的 build.log、android-log.txt、host-report.json 与 emulator.png。长期连接、弱网、网络切换及真机跨网尚未验证。

## Alternatives considered

原始 UDP 需要自行处理可靠性、拥塞、加密与连接状态，维护成本高。QUIC 能提供可靠传输但不自动解决发现与 NAT 穿透，可在将来有具体需求时重新评估。业务中继能改善覆盖率，但不符合本轮约束。浏览器控制暂缓，合成浏览器对端仅用于验证 Android 原生链路。

## Consequences

实验后续以[Android 真实远程终端需求](./requirements/android-remote-terminal.md)为交付目标：配对不依赖账号系统，必须从手机真实新启动电脑端 Claude Code 并流式收发。当前合成主机及实验邀请只证明传输功能，不能作为该目标的交付证据。

无中继意味着部分网络明确连接失败，原生 App 不消除这个限制。跨网仍需要可达的协商通道与通常需要的 STUN；无需业务中继不等于完全不依赖公网服务。模拟器成功仅证明本机功能，不证明蜂窝网络或 CGNAT 下可达。下一阶段必须通过真机 Wi-Fi/蜂窝与宿主异网测试记录候选类型、连接时延、长连接和重连结果。

业务层仍需版本化消息、设备身份、审批撤销、请求去重、输出回放与流控，再接入生产远控。文件传输需分块和独立背压，不能直接扩大单条有序消息。是否进入生产取决于真实网络覆盖与恢复测试。
