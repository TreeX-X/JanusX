---
{
  "schema": "harness-note/2",
  "id": "76db499e-08e3-494e-8916-25e0b80ec482",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-11",
  "updated": "2026-10-14T07:20:37Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c"
}
---

# Docker 面板的工作台入口

## Intent

用户决定 JanusX **自研** Docker 的日常管理面板，首版只做基本能力；不再接入 Portainer CE 网页。原 Portainer 接入方向（顶栏图标打开管理网页、多地址管理、部署引导、自签证书信任）已于 2026-10-14 放弃，已落地的集成代码同日移除。本文记录新方向、首版边界与承载形态；实现尚未开始。

首版能力即用户当日确认的清单：

| 能力 | 具体范围 |
|---|---|
| 连接状态 | 显示本机 Docker 是否可用；无法连接时提供明确提示 |
| 容器列表 | 名称、状态、镜像、端口；搜索；查看全部或仅运行中 |
| 常用操作 | 启动、停止、重启，显示操作进度和失败原因 |
| 容器日志 | 实时查看、暂停滚动、搜索、复制 |
| 容器终端 | 在 Janus 现有分屏中打开，清楚标明容器名称 |
| 访问服务 | 点击已发布的 HTTP 地址，在内置浏览器打开 |
| Compose 分组 | 把同一项目的容器放在一起，支持整组启动、停止 |

首版先不做：镜像仓库、镜像构建配置、卷与网络管理、磁盘清理、运行时安装、远程环境管理。这些操作保留「打开 Docker Desktop」入口。

## Agreed direction

Docker 面板是中央工作区的一种新 pane 内容类型，和终端、编辑器、浏览器一样能打开、拖动、并排显示；复用现有标签页与分屏，不引入第二套窗口机制。这与 Markdown 独立 pane 是同一条路径（见 [Markdown 独立 pane 与顶栏工具分组](./markdown-pane-entry.md)）：新增内容类型、纳入 pane 树、接通拖拽落点与快照保留，而不是"在浏览器里再开一个网页"。

选型的真正理由是分屏：面板与容器日志、HTTP 请求、代码编辑器并排时，用户发一次请求就能在旁边看到服务日志，改一次代码立刻看到容器重启结果。Portainer 网页只能占满一个 pane，且与请求页、编辑器不共享视野——接入方给不了 JanusX 自己的分屏优势。自研还顺带消除了接入期的全部未验证项：登录态保持、实时日志、容器控制台、文件上传下载、自签证书在内置浏览器里的信任。

连接状态只回答"本机 Docker 现在可不可用"，不推断为什么不可用；无法连接时给出可操作的下一步（启动 Docker Desktop / 打开 Docker Desktop），不堆错误码。容器终端明确标注容器名称，避免在分屏里忘记自己连的是哪个容器。访问服务复用的是既有内置浏览器 surface，不新开系统浏览器。

HTTP 请求工具与 Docker 面板配套，单独设计见 [HTTP 请求 pane](./http-request-pane.md)。

## Rationale and validation

原判断是"自研完整管理界面成本过高，接入成熟界面先满足日常管理"：完整管理还需交互终端、容器创建、镜像构建与拉取、Compose、远程认证、跨平台连接与断线恢复，确实需要长期维护。但用户实际每天用的是清单里那七项，完整管理界面里的镜像仓库、卷网络、Stack 编辑并不会因为嵌在 JanusX 里而更好用。把范围收窄到七项之后，自研是一次性的本地 Docker CLI / Engine API 调用，维护面远小于原先估计；接入方反而要额外背着 Portainer 的版本兼容、证书信任、登录态与浏览器兼容性验证。

Portainer 接入在实现期暴露的成本已经记录在 [Docker 管理入口实现 Task](./tasks/docker-management-entry.md) 的 Progress：自签证书信任需要为内置浏览器单独开精确 origin 白名单、登录态依赖 `persist:janusx-browser` 分区、加载失败会停在深色底上表现为纯黑。这些都不是 Docker 管理本身的需求，却都由接入方式产生。

Dockge 更偏重 Compose 项目管理，保留为后续评估的替代方案；本轮不评估。

尚未验证：自研面板与 Docker Engine 的实际连接方式（命名管道 / Unix socket / `docker` CLI）、Compose 分组所需的项目标签来源、容器终端在现有分屏中的落点。实现前需要一台本机 Docker 环境实测。

## Decisions

2026-10-13 收敛原三条开放问题（历史，已随方向变更作废）：

- 全局入口放在顶部（Titlebar）全局工具区，与浏览器图标同权，点击语义与终端解耦（见 Agreed direction）。
- 部署引导默认 Portainer CE LTS、端口 9443（HTTPS）、自签证书 + 内置浏览器信任处理。
- 首版保存多个管理地址并支持环境切换，交互为”主体打开当前 + 下拉临时切换”。

2026-10-14 补充两条放置与状态决策（历史，顶栏入口已随 Portainer 一并移除）：

- 入口采用**右上角固定**，与蓝图/知识库同排但由竖分隔线隔开，不做悬浮球。理由：悬浮球常驻中央工作区上方会遮挡它要打开的全屏 pane 内容，且丢失标题栏按钮天然的键盘可达性，并与 `WorkbenchSwitcher` 形成两套”打开工作界面”的交互语言。
- 三个工具入口**打开后即置灰，关闭对应标签后恢复可点**。理由：每个工具在一个工作区里只开一个实例，重复点击不产生新内容，置灰比保留一个”只做聚焦”的按钮更诚实。该语义对浏览器与 Markdown 仍然成立，实现见 `resolveGlobalToolOpenState`（`lib/global-tool-entry.ts`），刻意只看 pane 树里有没有对应内容、不看焦点。

2026-10-14 转向自研，当日生效：

- **放弃 Portainer CE 接入，改自研首版七项能力**。理由见 Rationale：范围收窄后自研成本低于接入的兼容与信任成本，且只有自研能把面板放进 JanusX 的分屏。
- **已落地的 Portainer 集成全部移除**：顶栏 Docker 图标与环境下拉、设置「Docker 管理」页与 `docker` i18n 命名空间、`shared/dockerSettings.ts` 及配置/IPC/preload/store 链路、`main/browser/cert-trust.ts` 自签证书信任。移除后工作区不再有 Docker 专属 `browser-docker:<envId>` surfaceId，浏览器入口恢复"第一个浏览器 tab 即工作区浏览器"的简单语义，`findFirstUserBrowserPaneContent` 与 `isDockerSurfaceId` 一并删除。
- **Docker 面板与 HTTP 请求都实现为新的 pane 内容类型**，入口、标签、拖拽落点与快照保留规则一并改造；不停留在"浏览器里再开一个网页"。
- **首版不做**镜像仓库、镜像构建配置、卷与网络管理、磁盘清理、运行时安装、远程环境管理；这些保留「打开 Docker Desktop」入口。不做远程环境也意味着首版不需要多地址列表——原 `dockerSettings` 的整套地址管理随之失去用途。

## Open questions

- 自研面板与 Docker 的通信方式：直接调 Engine API（命名管道 / Unix socket）还是包一层 `docker` CLI。影响分发与权限模型，实现前定。
- Compose 分组依赖容器的项目标签（`com.docker.compose.project`），标签缺失时的归组行为待定。
- 容器终端是新的 pane 内容类型，还是复用现有终端内容类型加一个"附加到容器"的来源。倾向后者，待实现时确认。
- 顶栏是否保留一个 Docker 入口，以及它的置灰语义；首版能力落地时与 HTTP 请求入口一起定。

## Implementation

原实现排期见 [Docker 管理入口实现（Portainer CE）](./tasks/docker-management-entry.md)，其中的 P1（顶栏全局工具入口）与 P3 的 pane 树改造仍然有效，P2/P4/P5/P6 属 Portainer 承载与兼容性验证，已随 2026-10-14 的转向取消。自研面板与 HTTP 请求 pane 的 Task 尚未建立。
