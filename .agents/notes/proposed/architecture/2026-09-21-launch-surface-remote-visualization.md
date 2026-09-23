---
schema: harness-note/1
id: 82ff589f-72a0-4ad2-ba7c-fc2ab6606b0e
kind: decision
lifecycle: draft
created: 2026-09-21
class: architecture
---

# Agent Note: Launch surfaces with native GUI embedding, remote visual projection, and scoped input

## Problem

JanusX 的"启动"今天落在三套互不相通的实现里：`ProjectRunner`（`spawn` + 管道，`src/main/project/runner/runner.ts`）、`TerminalManager`（node-pty，`src/main/terminal/manager.ts`）、`BrowserSurface`（WebContentsView）。三者之间没有统一的"运行面"概念，UI 侧因此也是三张皮：终端 tab、`ProjectRunningList` 日志轮询（`src/renderer/src/services/project.ts:190` 的 `startProjectPolling`，runner 的 `project:output` 事件根本没有消费方）、浏览器 tab。

同一份 `LaunchConfiguration` 同时覆盖 dev server（vite/next/uvicorn）、编译型项目（`cpp-cmake`：`cmake --build` 后跑 `build/<target>.exe`）和自定义 `program`，其中就包括 Qt 这类原生 GUI 程序。但 `runner.ts:423` 一律按 `stdio: ['ignore','pipe','pipe']` 起进程：GUI exe 没有 stdout，运行列表只有空日志；它的窗口是自由浮动的顶层窗口，JanusX 既不知道它的存在，也无法管理它的生命周期。用户的本职场景（开发 Qt 软件、点运行看界面）因此完全在壳外。

远程侧只覆盖终端：`src/main/companion/terminal-control.ts` 提供 `submitLine` / `interrupt`（写 `\x03`）/ 审批应答，[2026-08-20 的 LAN remote note](../../implemented/feature/2026-08-20-tob-lan-remote.md) 把权限定为"快照 + 有界 tail + 单行提交 + 中断"，浏览器入口写着"以后复用同样的语义"，GUI 投影根本不存在。[2026-09-04 的 remote-control note](../../implemented/architecture/2026-09-04-remote-control.md) 则把 pixel streams 与 key injection 整体划在范围外，所以"远程看到并操作运行中的程序"今天既无机制也无授权路径。

硬约束：被启动的工程程序（Qt）**不会为远程功能做任何配合**——不加 `--embed` 参数、不改渲染路径、不暴露状态端点。一切机制必须由 JanusX 单侧完成。

本次要闭合的缺口：只有 JanusX 自己启动的进程进入统一管理（不 adopt 外部进程或窗口），覆盖多种运行形式（交互终端 / Web UI / 原生 GUI / 无界面服务），并使远程可视化能按形态投影每个运行面，并对 GUI 运行面提供范围受控的输入通道。设计先行，不含实现排期承诺。

## Proposal

### 1. LaunchSurface 统一模型

新增 shared 类型 `LaunchSurface`，main 侧由一个 manager 收口所有由 JanusX 启动的运行面：`surfaceId`、`kind`、`origin`、`workspaceId`、`process`、`display`、`projection`、`policy`、`lifecycle`。

- `kind` 四选一：`terminal`（pty 交互）、`web`（URL 型界面）、`gui`（原生窗口）、`service`（无界面，仅日志）。
- `origin` 只接受 `janusx-launch`。manager 不提供 adopt 外部进程/窗口的入口——进程必须由 JanusX spawn，句柄在手才能杀、才能授权捕获、才能审计。这是安全边界，也是本设计的范围边界。
- `lifecycle`：`starting → attaching（gui 等待顶层窗出现）→ running → exited/crashed/stopped`。
- manager 统一 start/stop/list/telemetry，并以推送替代渲染侧轮询；`project:output` 事件从"无人消费"变为 surface 生命周期事件的一路。

### 2. 四种运行形式的显示绑定

- `terminal`：复用现有 pty + xterm（`CLITerminal.tsx`），含 preset（shell/claude/codex/opencode/janus/pi），不变。
- `web`：复用 `BrowserSurface`（WebContentsView），并把 runner 已有的端口提取（`runner.ts:500` 的 `project:ready`）接到"一键在壳内浏览器 tab 打开"的动作上——今天事件发了但没有消费方。
- `gui`：新增 Windows 原生窗口嵌壳，见下。
- `service`：日志视图，复用现有 output 环形缓冲与 adhoc 落盘快照。

四类共用一个 pane 容器：运行面作为工作区 pane 的一种内容出现（终端 pane 已在此结构中），带 kind 徽标，本地交互方式按 kind 分化。这就是"隔离壳体"的含义——壳是 pane 容器 + 生命周期管理 + 进程隔离，不是沙箱。

### 3. GUI 嵌壳（Windows，外部强挂，无应用配合）

启动面显式声明：`LaunchConfiguration` 增加 display 声明（`surface: 'gui' | 'terminal' | 'web' | 'service'`，缺省按 project type 推断，`cpp-cmake`/`custom` 起 GUI exe 时给建议值）。GUI 启动走 `windowsHide`，避免控制台窗口闪烁。

win32 native addon（沿用 node-pty 的 prebuild / asar unpack 基建）提供六个原语：

- `awaitTopLevelWindow(pid, timeout)`：按 pid 枚举顶层可见窗（Qt 主窗类名形如 `Qt6xxQWindowIcon`，只按 pid 匹配，不依赖类名）。
- `attach(childHwnd, hostHwnd)`：去 `WS_POPUP`/`WS_CAPTION`、加 `WS_CHILD`、`SetParent`、`SetWindowPos` 到宿主客户区；保留子窗原有 `WS_CLIPSIBLINGS`/`WS_CLIPCHILDREN` 组合，这是 ANGLE/D3D 应用重父窗后仍能绘制的关键。
- `adoptNewTopLevelWindows(pid)`：轮询补挂该 pid 新出现的顶层窗。Qt 的 `QDialog::exec()`、右键菜单、无主窗口都是独立顶层 HWND，不补挂就会飞出壳体——这是无配合模式下最大的坑。补挂是启发式：按可见性、最小尺寸、`WS_EX_TOOLWINDOW` 过滤工具提示类，补挂失败的窗口记入 surface 诊断。
- `syncGeometry(hostHwnd)`：宿主 `WM_MOVE`/`WM_SIZE` 时同步全部子窗几何。
- `detach(childHwnd)`：仅用于将来"弹出为独立窗口"，v1 不需要。
- `getProcessDpiAwareness(pid)`：查询被嵌进程的 DPI awareness，用于启动时的一致性检查与告警。

**宿主是一个独立的 WS_CHILD native 子窗**，位于编辑窗口客户区内；渲染侧占位 div 用 ResizeObserver 上报 rect（窗口客户坐标）经 IPC 到 main 侧 `SetWindowPos`。选独立 native 子窗而非直接挂 BrowserWindow 的 HWND：pane/tab 切换时 `ShowWindow` 即可隐藏，无需 detach/attach，也不与 Chromium 合成器争 z-order。

**崩溃恢复**：子进程退出时按配置重启并重新 attach（新 HWND，旧枚举关系整体作废）。

**隔离**：每个 surface 一个 Job Object（`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`，宿主退出即杀全树），现有 `tryTreeKill`（`runner.ts:83` 的 taskkill /T）降级为兜底。不做 AppContainer/受限令牌——与窗口嵌壳基本互斥。

**无配合模式的三个已知缺口及兜底**：

1. **模态/弹出窗逃逸**。补挂是启发式，漏网之窗（无边框瞬现窗、极短命菜单）会浮在壳外。兜底是帧通道的**逃逸捕获**：帧通道的捕获源可以是"该 pid 的顶层窗集合"而不只是嵌入子窗，逃逸窗仍会被投影给远程侧；本地看不见它，但远程不丢信息。这是不要求应用配合的前提下唯一能补的洞。
2. **DPI awareness 启动后不可更改**。被嵌进程与宿主缩放比例不一致时会模糊，且无法修复。只能启动时用 `getProcessDpiAwareness` 检测、在 surface 面板上显式警告，并在配置中声明支持范围。
3. **ANGLE/D3D 渲染路径重父窗后黑屏/闪烁**。兜底是该 surface **降级为帧通道只读**（窗口仍浮在壳外或半嵌入，但远程与本地都靠捕获帧观看），并在诊断中记录降级原因。重挂加重试一次作为第一响应。

### 4. 远程投影与输入

投影三种形态：**text**（replay/tail）、**state**（结构化状态 + 日志 + status）、**frames**（像素）。每个 surface 声明自己支持哪些投影，远程 UI 取最优可用形态。

远程操作面在现有 gateway 上扩展：

- `surface.list(workspaceId)` / `surface.status(surfaceId)`
- `surface.subscribe(surfaceId, { frames, fps, resolution })` / `surface.unsubscribe(surfaceId)`
- `surface.logTail(surfaceId, n)`
- `surface.armInput(surfaceId, { mode })` / `surface.disarmInput(surfaceId)`
- `surface.inputEvent(surfaceId, event)`
- 既有 `terminal.submitLine`/`interrupt` 语义不变。

**frames 通道**：`Windows.Graphics.Capture` 抓取，默认源是嵌入子窗 HWND（优先子窗而非整个 JanusX 窗口——后者会把其他面板一起送出去，是隐私问题）；存在逃逸窗时源扩展为该 pid 的顶层窗集合。D3D11 取帧 → MediaFoundation H.264 硬件编码（MJPEG 兜底），fps 默认 2、上限 10，分辨率上限 720p，**无订阅者时零捕获**（按需启动、最后一个退订即停）。Win10 需要窗口可见、Win11 支持捕获最小化窗口；JanusX 最小化时帧通道暂停而非失败。本地同样复用该通道做 surface 收起时的实时缩略图。

**输入通道（scoped input）**——这是对 2026-09-04 决策的第二个开口，设计约束比帧通道更严：

- **机制**：`PostMessage` 把 `WM_MOUSEMOVE`/`WM_*BUTTON*`/`WM_KEYDOWN`/`WM_CHAR` 直接投递给嵌入子窗，**不使用 `SendInput`**。`SendInput` 会移动真实光标、影响本地用户、且能打到机器上任何窗口，v1 明确禁用；仅作为"目标应用忽略投递消息"时记录在案的备选，且需要更严格的开关。
- **坐标钳制**：远程事件携带归一化坐标（0..1，相对 surface  rect），main 侧映射到子窗客户坐标后钳制在子窗矩形内——物理上不可能点到壳外。
- **焦点管理**：跨进程焦点需要 `AttachThreadInput` + `SetFocus` 到子窗，输入会话结束时还原宿主焦点。这是本设计里最脆的一段，需要专项验证（Qt 的快捷键、输入法、以及焦点在本地用户与远程之间切换时的竞态）。
- **授权模型**：输入是独立于查看的**单独授权**，默认关闭；`armInput` 需要与查看相同的 gateway 鉴权，外加一次显式 armed 动作（不是订阅即获得输入权）；每次 arm/disarm 留审计（surface、对端设备、起止时间、事件计数）。
- **本地优先与急停**：armed 期间检测到本地键鼠事件即自动 disarm（本地用户永远赢）；宿主上常驻"远程输入中"指示器，本地用户可一键急停；空闲超时自动 disarm。
- **已知边界**：依赖 `GetCursorPos`/`GetKeyState`/raw input 的 Qt 代码路径对投递消息无反应（命中测试、拖拽、部分快捷键），这类交互在远程输入下会失效或错位，需要在 surface 诊断中标注"输入兼容性：部分"。

### 5. 对 2026-09-04 的显式修订

[remote-control note](../../implemented/architecture/2026-09-04-remote-control.md) 的 "pointer or pixel paths stay out of scope" 收窄为：**全局桌面共享、跨应用任意输入注入、以及任何以机器桌面为对象的通道仍然出界；对 JanusX 启动的 GUI surface，开两个按 surface 单独授权、可撤销、有上限的窄通道——只读帧通道（view）与坐标钳制的投递式输入通道（control）**。远程对象依然是 session/workflow，帧与输入都是 surface 的投影，不是桌面的镜像。

revisit 信号：出现跨 surface 抓取、任意窗口请求、`SendInput` 全局注入诉求，或本地优先策略被要求关闭时，回到全禁并重开决策。

### 6. 分期

- **P0 本地嵌壳**：surface 模型 + gui 启动声明 + win32 attach/adopt/geometry + Job Object + pane 占位宿主 + 崩溃重挂 + DPI 检测警告。做完本地效果即成立，不含任何远程通道。
- **P1 帧通道（本地）**：capture → 渲染侧 video（WebCodecs）+ 上限 + 收起缩略图 + 逃逸捕获。同时验证带宽与编码选型。
- **P2 远程投影与输入**：gateway 扩展 surface 操作；frames 授权/撤销/审计；输入 arm/disarm、坐标钳制、本地优先与急停。**本修订与该实现同批落地，不允许代码先行。** 输入与帧通道在 P2 硬绑定，没有滑出通道：焦点管理专项验证是 P2 的准入条件，不过则 P2 不交付，而不是把输入挪走。
- **P3 可选**：surface 结构化状态通道的本地侧（日志/status 已覆盖大部分诉求）；macOS/Linux 适配，见非目标。

## Alternatives considered

- 纯结构化镜像、完全不开帧通道 — 最强理由是零像素外泄、完全贴合既有架构。否决原因是不满足核心诉求：用户要"看到运行的程序效果"，结构化状态给不了真实渲染。
- 要求被启动程序配合（`--embed`、暴露状态端点、改用可嵌入渲染）— 最强理由是模态、DPI、渲染路径全部由应用自己处理，机制最稳。否决原因是工程约束：这是用户的正式工程项目，不会为远程功能修改产物；一切机制必须 JanusX 单侧完成。
- 全局桌面共享 / 远程桌面内核 — 最强理由是一举覆盖所有远程需求。否决原因是 2026-09-04 已从产品定位上否决（设备控制不是会话监管），且把设备级风险拖进工作流工具。
- `SendInput` 全局键鼠注入作为输入通道的主机制 — 最强理由是对应用零要求、所有交互都通。否决原因是移动真实光标、可击中机器上任何窗口、与本地用户直接冲突；`PostMessage` + 坐标钳制 + 本地优先已覆盖主要交互，`SendInput` 只作记录在案的备选。
- VNC / 独立桌面会话托管 — 最强理由是成熟、对应用零要求。否决理由是重量与运维成本，与桌面 ADE 的产品形态差得太远。
- 用现有管道输出 + ANSI 渲染做"伪 GUI" — 最强理由是零新增原生依赖。否决原因是 GUI 程序没有 stdout，且交互在原理上不可能。
- 用 `webviewTag` / `WebContentsView` 承载原生窗口 — 最强理由是复用 Electron 既有能力。否决原因是二者只能承载 web 内容，与原生 HWND 无关。
- Do nothing / reuse — 保持现状的代价就是 Problem 描述的三张皮：Qt 窗口在壳外自由浮动，远程只能看终端，`project:output` 无人消费。

## Acceptance criteria

- AC-1: 一个 GUI 启动配置（`cpp-cmake` target 或 `custom` program）启动后，其顶层窗口在 JanusX 壳内占位面板中渲染，本地可正常交互（点击、键盘输入）。
- AC-2: 该进程后续弹出的模态对话框与新的顶层窗同样进入壳内；无法补挂的窗口被明确过滤、记入 surface 诊断，且其画面仍进入帧通道的逃逸捕获范围。
- AC-3: 宿主窗口移动、缩放、最小化、还原时嵌入窗口跟随；pane/tab 切换时嵌入窗口随之隐藏/恢复而不丢失挂载关系。
- AC-4: 停止 surface 时进程树全杀、无残留；子进程崩溃后按配置重启并重新挂载新窗口。
- AC-5: 帧通道未授权时，远程侧无法获得该 surface 的任何像素数据；授权后仅该 surface 的帧，fps 与分辨率受配置上限约束，撤销即时生效且每次授权/撤销/订阅留审计。
- AC-6: 输入通道未 arm 时，远程侧的任何输入事件被拒绝且不留副作用；arm 后的事件坐标被钳制在子窗矩形内，本地用户的一次键鼠操作即触发 disarm，"远程输入中"指示器在 armed 期间常驻，急停可一键执行。
- AC-7: 非 JanusX 启动的进程与窗口不在管理范围内，没有任何 API 可以 adopt 它们。
- AC-8: 终端、web、service 三种形式的既有行为不回潮：终端提交/中断语义、浏览器 tab 行为、adhoc 日志落盘与快照读取均保持现状。
- AC-9: P2 落地时，2026-09-04 的修订同批写入 note，代码入口有反向注释指向 note。

## Risks

- Qt6 + ANGLE/D3D11 渲染路径在重父窗后黑屏/闪烁：兜底是重挂一次、随后降级为帧通道只读；`WS_CLIPSIBLINGS` 保留与 `SetParent` 顺序需要专项验证。
- 模态/弹出窗补挂是启发式，规则会随 Qt 版本与窗口风格漂移；漏网窗在本地不可见，只有帧通道兜底。
- 进程 DPI awareness 启动后不可更改，跨缩放比例的屏幕上必然模糊；只能检测与警告，不能修复。
- 跨进程焦点管理（`AttachThreadInput` + `SetFocus`）是输入通道最脆的一段：输入法、Qt 快捷键、本地与远程焦点竞态都可能导致输入丢失或错投。输入已与 P2 硬绑定，这段未通过专项验证即阻塞 P2 整体交付。
- 依赖 `GetCursorPos`/`GetKeyState`/raw input 的应用代码路径对投递消息无反应，远程输入只能覆盖部分交互，需在诊断中标注兼容性。
- 帧通道是视觉外泄路径：必须默认关、按 surface 授权、可撤销、有审计、有 fps/分辨率上限，且抓取对象是嵌入子窗（或该 pid 的顶层窗集合）而非宿主窗口。
- 带宽与续航：按需捕获 + 无订阅者即停 + 上限三件套缺一不可。
- 输入通道把"远程操作被启动程序"变成现实，即使范围受钳制，也需要本地优先、急停、空闲超时三道闸同时成立才允许默认开启。
- native addon 的长期维护：跟随 electron 主版本 rebuild、打包签名、asar unpack，任一环节缺失都会在发布形态下静默失效。
- Win10 无法捕获最小化窗口，JanusX 最小化期间帧通道只能暂停，远程侧需要区分"暂停"与"断开"。
- 远程二进制帧流与现有 envelope/token 语义的整合尚未设计，relay 传输层在此之前保持预留。
- macOS/Linux 的窗口嵌壳前提不同：Wayland 下无法重父窗别的应用窗口，X11 可以；macOS 没有公开的跨进程 SetParent，嵌入基本要求应用配合。因此后续移植时 GUI surface 在这两个平台大概率只能走"窗口浮动 + 帧通道投影"，本地嵌入能力不回填——这是记录在案的非目标，避免未来按错误前提排期。
