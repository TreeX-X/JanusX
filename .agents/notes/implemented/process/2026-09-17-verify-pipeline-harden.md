# Agent Note: verify 管道硬化与 Windows 稳定性

Status: implemented

## Problem

`verify` 门禁在 `main` 连续全红，远端报错分三层，彼此掩盖。第一层是假失败：同级 `janus-agentX` 仓的 workspace 按字母序先编 `cli` 再编其依赖，单次全量构建必报 `TS2307`，三遍重试才收敛，每次都在 run 里留下 `##[error]` 注解，让真失败难以定位。第二层是真失败：`office-artifact-index` 边界用例调用不存在的 `expect().resolves.map` 链式，确定性抛 `TypeError`，且第二个断言的 `sinceMs` 取值与 inclusive 语义自相矛盾；`janus-ipc-contract` 的 capture 断言直写同步期望，无视 handler 的 fire-and-forget 语义，且未 mock 身份解析链，在测试环境里恒为零调用；`janus-resource-ui` 的 `data-turn` 计数断言停留在分组折叠之前的平铺假设里，可折叠分组收起后静态 markup 不再含卡片。第三层是 runner 崩溃与调度相关失败：`tinypool` 报 `Channel closed` 并连带 `fs-event.c` 断言杀死整个 run，吞掉尾部失败报告；`office-artifact-index` 的 debounce 组与 `officecli-installer` 的两例在远端全量时失败、本地隔离运行时全绿，受害集合随 worker 调度漂移。放任的代价是分支保护要求的 `verify` 变绿永无止境，直推 `main` 的 bypass 成为常态。

## Decision

`verify` 与 `release-win` 共用同一份同级仓分层构建：零依赖层（`agent-core`、`harness-core`）先行，接着一层依赖（`chat-core`、`node-hosts`、`harness-node`），再是 `janus-agent`，最后编 `cli` 与 `notes-cli`，一次通过，不再重试。分层依据是各包 `package.json` 的 `file:` 依赖边，本地删 `dist` 重编验证一遍通过。`setup-node` 的 npm 缓存同时覆盖 `JanusX` 与 `janus-agentX` 两份 lockfile，同级仓每轮不再冷装。`verify` 的单体 `npm run verify` 按 `package.json` 原顺序拆成具名步骤，失败直接归因到阶段；`package.json` 链本身不动，改链时以它为准同步 workflow。`vitest.config.ts` 在 `CI=true`（Actions 默认置位）时切到单进程顺序执行，本地保持并行速度；单进程不治 worker 状态污染，治的是不可复现——本地置 `CI=true` 即得与远端同一顺序，同一失败集合。顺序执行证伪“并行负载致崩”：双 worker 顺序跑照样崩溃，崩溃与文件并行度无关。边界用例改用先 `await` 再断言的合法写法，第二个 `sinceMs` 取边界下一毫秒，使两个断言恰好覆盖包含与排除。`janus-ipc-contract` 对 `workspace-identity` 做局部 mock（保留原模块其余导出，`captureForCwd` 只透传 `workspacePath` 加输入），capture 断言改 `vi.waitFor` 轮询，与 fire-and-forget 语义对齐。`janus-resource-ui` 的分组断言改为分组计数加相对位置（`First answer` 之前、`Second answer` 之后恰好一组），与可折叠分组收起态对齐。本地全量验证必须在干净检出上跑：同一检出内若有他人未提交的改动（如维护 harness 重构的工作区编辑），全量结果即被污染，不可作为结论依据。

## Alternatives considered

- 把排序修进 `janus-agentX` 仓（如加 `prebuild` 拓扑或改 workspace 声明顺序）——最强理由是根因归属最正，但 JanusX 侧 CI 当下就要变绿，跨仓改动还要等对方合入发版，远水不解近渴；层序注释留在 workflow 里，对方修好后此处依然正确。
- 保持重试循环，只把 `verify` 拆步——最强理由是改动最小，但重试的假 `##[error]` 注解继续污染每个 run，且浪费约一整遍同级构建时间，治标不留本。
- 全局关闭文件并行（含本地）——最强理由是两地行为完全一致，但本地 224 个文件顺序跑显著拖慢日常循环；CI 顺序、本地并行的分歧写进配置注释，影响面可控。
- 改产品侧 `>=` 为 `>` 以迎合旧断言——最强理由是测试不动产品动最少，但用例标题和首个断言共同声明 inclusive 语义，且产品唯一的带参调用者就是该用例，改产品等于为笔误改语义。
- Do nothing / reuse — 维持重试加单体 Verify，红灯照旧，bypass 照旧， issue #1 永不关闭；三个失败层继续互相掩盖，不可行。

## Consequences

- **Gains**: 同级构建从两次全量（含一次必败）降为一次定序构建，run 注解不再出现构建假 error；`Unit tests` 等具名步骤让失败阶段一眼可辨；`office-artifact-index` 边界用例、`janus-ipc-contract`、`janus-resource-ui` 在隔离运行下全绿；远端失败集合不再随并行调度漂移，本地 `CI=true` 复现即远端行为。
- **Costs and limits**: CI 与本地的 vitest 调度存在分歧，本地复现 CI 行为需显式置 `CI=true`；CI 单进程顺序跑比双 worker 慢，约为全量时间的数倍，以时间为代价换确定性；workflow 的分步命令是 `package.json` 链的人工镜像，改链必须同步两处，遗忘即漂移。门禁仍未全绿：`office-artifact-index` 的 debounce 组与 `officecli-installer` 两例在全量调度下失败、隔离运行时全绿，worker 崩溃（`Channel closed` 加 `fs-event.c` 断言）在顺序执行下依然出现，根因（疑似 worker 内跨文件状态或句柄累积）尚未定位，跟踪仍在 issue #1；`janus-agentX` 仓的排序归属保持原判。合并继续走管理 bypass 并留书面理由，直到 owning workstream 落地。
