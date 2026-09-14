# Agent Note: 壳侧 command 报错自愈对齐与打包依赖固化

Status: implemented

## Problem

janus-agentX 落地报错自愈与 todo 续跑（见其仓 `2026-09-14-command-error-self-heal-and-todo-resume`）后，JanusX 壳侧仍有两处不对称。其一，壳内 `command-tools.ts` 是 node-hosts 的完整副本而非 re-export：env 白名单拒绝只报键名不给替代（实测 HTTP_PROXY 拦截后模型连烧 5 步诊断），同步 spawn 启动失败 reject 裸错，而壳内后台 runner 已有 `spawnHint`——同一进程内两条路径指引不对称；注册描述的轮询工具名写作 `project.process-output`，与 `project-tools` 的实际工具名漂移。其二，`npm install --install-links` 物化 file: 依赖修复了 Junction 打包越界，但物化即冻结：janus-agentX 更新后若忘记重跑安装链接，壳侧静默消费旧 dist，正是「改了源码、壳里还出错」的复发形态。

## Decision

副本行为对齐核心仓：env 拒绝文案同样枚举白名单键并给出参数式替代（`git -c http.proxy=... clone ...`）；`runner.ts` 的 `spawnHint` 导出，`command-tools.ts` 同步路径的 `error` 事件包装为「原始信息 + hint」，与后台 runner 共享同一指引；注册描述统一为 `project_process_output` 并补 60s 后台阈值规则。打包链新增 `prepackage`（`npm install --install-links`）并前置到 `package:win/mac/linux`，每次打包强制重新物化 file: 依赖，杜绝静默过期。壳侧不重复实现 todo 续跑——注入与 nudge 随 `@janus-agent/chat-core`/`janus-agent` 的 dist 重建自动生效；壳侧会话 LRU 本就未持久化 todos，无可回填资产，留待壳侧持久化落地再对齐。

## Alternatives considered

- 壳侧副本改为 re-export node-hosts 实现：单实现永不漂移；但 `command-tools.ts` 与壳的审批流、日志目录、工具注册深度耦合，迁移是大改，本回合只对齐行为，收敛副本留后。
- 白名单文案只写「请改用程序参数」不枚举键：文案更短；但枚举让模型第一次就选对键，省掉试错往返，成本只是几十字符。
- prepackage 只加一条不前置：依赖自觉调用；但 npm 只对精确同名脚本自动跑 pre 钩子，`package:win` 等带冒号的脚本不会触发，显式前置才是机械保证，否决。
- Do nothing / reuse：零代码；代价是壳侧与核心仓的报错行为分叉扩大，file: 依赖过期陷阱随每次打包重现。

## Consequences

- **Gains**: 壳内同步与后台启动失败共享同一 hint，env 拒绝当轮自纠，轮询工具名一致；`npm run package:*` 自动重新物化依赖，打包产物永远对应当前源码状态。
- **Costs and limits**: 白名单键与 shim 名单仍两仓各存一份，增补需同步；`prepackage` 每次打包多一次 npm install（实测约 3.5s）；todo 续跑在壳侧生效依赖先在 janus-agentX 仓构建 dist 再安装链接，两步顺序不可颠倒。
- **Verification**: `npm run typecheck` 通过；`npx vitest run tests/unit/agent/command-tools.test.ts` 13 通过（含 spawn hint 与 `git -c` 指引新用例）。
