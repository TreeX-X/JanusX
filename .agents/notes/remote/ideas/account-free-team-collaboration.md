---
{
  "schema": "harness-note/2",
  "id": "f4d29c6e-73a0-4c34-8b74-6f45e80fc1b1",
  "kind": "idea",
  "lifecycle": "proposed",
  "created": "2026-10-21",
  "updated": "2026-10-21T00:00:00Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/b653bb34-279f-45db-92d1-313d1c6bcdf5",
  "tags": ["remote", "collaboration", "account-free", "future"],
  "relations": [{"type":"related-to","target":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/86b5c53a-1895-442c-9e83-4a5bc52f4d2a"}]
}
---

# 无账号团队协作候选方向

## Intent

团队成员可以通过长期设备身份连接到被控电脑，不把手机配对绑定到 JanusX 账号体系。首版只做临时二维码、电脑审批和单工作区终端控制；本 Note 记录后续候选，不表示已实现或已接受。

## Candidate design

- 每台手机在本地生成持久设备密钥和可撤销设备 ID；二维码只用于首次引导和信令地址交换。
- 电脑拥有者保存设备公钥、角色、允许的工作区和最后连接时间，审批与撤销完全由电脑控制。
- 长期连接复用 WebRTC DataChannel、输出序号、有限回放和请求去重；网络切换后重新 ICE，不终止桌面进程。
- 多人协作需要会话锁、只读观察者、输入者和管理员角色，以及工作区级操作审计；文件同步和任务分发另设协议。
- 设备丢失时撤销设备密钥；密钥迁移需要本地恢复码或已批准设备确认，不能靠二维码截图恢复长期权限。

## Revisit signals

当需要超过一个拥有者、离线审批、跨电脑工作区共享、成员审计或设备恢复时，重新评估是否仍适合完全无账号方案。公网信令可以托管，但终端数据仍须走直连 UDP P2P；没有 TURN 时不能承诺所有网络可达。
