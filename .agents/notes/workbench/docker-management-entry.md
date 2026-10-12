---
{
  "schema": "harness-note/2",
  "id": "76db499e-08e3-494e-8916-25e0b80ec482",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-11",
  "updated": "2026-10-11T05:46:37.000Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Docker 管理网页的工作台入口

## Intent

用户希望下载 Docker Desktop 部署与运行容器，并在 JanusX 中快速打开现成网页执行日常管理，尽量避免重做 Docker Desktop 界面。建议把 Docker Engine/Desktop 作为运行层，以 Portainer CE 作为较完整的容器管理网页；偏重 `compose.yaml` 项目时可评估 Dockge。JanusX 已有内置浏览器，可先打开用户配置的本机或远程管理地址，再考虑工具栏中的可固定“Docker 管理”入口。管理网页需要完整工作区尺寸，不宜默认塞进狭窄的右侧工具面板。

Portainer 管理容器、镜像、卷、网络、日志和 Stack，但不负责 Docker Desktop 自身的安装、更新、引擎启动与 WSL2/Hyper-V 设置；管理网页也不替代容器引擎。Docker Desktop Extensions 是在 Docker Desktop 内运行的扩展机制，不等于 JanusX 可直接复用的插件系统。第一版仅需可配置 URL 与快捷打开；项目/worktree 到 Compose Stack 的联动要在实际使用后另定。远程地址及 Docker socket 的访问权限需与管理操作相匹配。

参考：[Portainer CE](https://github.com/portainer/portainer)、[Portainer 的 WSL / Docker Desktop 安装说明](https://docs.portainer.io/start/install-ce/server/docker/wsl)、[Dockge](https://github.com/louislam/dockge)。

## Open questions

- 入口放在全局工具区、项目工具区，还是同时支持固定与搜索？
- 默认只打开管理地址，还是需要显示 Docker/Portainer 未运行时的明确状态与启动指引？
- 是否需要按项目保存管理地址或 Stack 链接；远程 Docker 环境是否在首版范围？
