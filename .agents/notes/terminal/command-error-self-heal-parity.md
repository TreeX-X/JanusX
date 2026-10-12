---
{
  "schema": "harness-note/2",
  "id": "3178e4f9-f730-57ab-ad67-3f38ab60a5d4",
  "kind": "decision",
  "lifecycle": "implemented",
  "created": "2026-09-14",
  "class": "feature",
  "extensions": {
    "r6Organization": {
      "sourcePath": ".agents/notes/2026-09-14-agent-note-command--3178e4f9.md",
      "sourceHash": "eb77ddfbad30ea437baab2a39261bbc21f5435561d6af70c5510dce737cc3bf5",
      "originalBodyHash": "6dcbb3d138ea65b9fcf2399818e6c3ae59a2be8dcc1375bd9cf13075c4eeeeb7",
      "category": "formal",
      "reason": "Retains the source decision in implemented lifecycle; body documents 壳侧 command 报错自愈对齐与打包依赖固化. No age-based archival.",
      "edits": ["Removed redundant Agent Note title prefix","Removed lifecycle duplicated by frontmatter"],
      "baseline": {
        "revision": "d59d9a8808cf2e3a2f02520144d8371a20ebdf56",
        "path": ".agents/notes/implemented/feature/2026-09-14-command-error-self-heal-parity.md",
        "sourceHash": "eb77ddfbad30ea437baab2a39261bbc21f5435561d6af70c5510dce737cc3bf5",
        "originalBodyHash": "6dcbb3d138ea65b9fcf2399818e6c3ae59a2be8dcc1375bd9cf13075c4eeeeb7"
      }
    }
  },
  "updated": "2026-10-11T16:23:33.137Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# 壳侧 command 报错自愈对齐与打包依赖固化


## Problem

janus-agentX 落地报错自愈与 todo 续跑（见其仓 `2026-09-14-command-error-self-heal-and-todo-resume`）后，JanusX 壳侧仍有两处不对称。其一，壳内 `command-tools.ts` 是 node-hosts 的完整副本而非 re-export：env 白名单拒绝只报键名不给替代（实测 HTTP_PROXY 拦截后模型连烧 5 步诊断），同步 spawn 启动失败 reject 裸错，而壳内后台 runner 已有 `spawnHint`——同一进程内两条路径指引不对称；注册描述的轮询工具名写作 `project.process-output`，与 `project-tools` 的实际工具名漂移。其二，`npm install --install-links` 物化 file: 依赖修复了 Junction 打包越界，但物化即冻结：janus-agentX 更新后若忘记重跑安装链接，壳侧静默消费旧 dist，正是「改了源码、壳里还出错」的复发形态。

## Decision

副本行为对齐核心仓：env 拒绝文案同样枚举白名单键并给出参数式替代（`git -c http.proxy=... clone ...`）；`runner.ts` 的 `spawnHint` 导出，`command-tools.ts` 同步路径的 `error` 事件包装为「原始信息 + hint」，与后台 runner 共享同一指引；注册描述统一为 `project_process_output` 并补 60s 后台阈值规则。打包链前置 `prepackage`（`scripts/prepare-package.mjs`）。脚本用 `npm pack --dry-run --json --ignore-scripts` 一次读取六个 sibling 包的发布文件清单，比对源包与已安装副本的文件集合和 SHA256。变化包先备份安装目录并使其 root lockfile 条目失效，再由 `npm install --install-links` 重装并重新解析依赖声明，安装后逐文件复核。普通 install 对相同路径和版本返回 up to date，不能保证刷新本地包。壳侧不重复实现 todo 续跑——注入与 nudge 随 `@janus-agent/chat-core`/`janus-agent` 的 dist 重建自动生效；壳侧会话 LRU 本就未持久化 todos，无可回填资产，留待壳侧持久化落地再对齐。

## Alternatives considered

- 壳侧副本改为 re-export node-hosts 实现：单实现永不漂移；但 `command-tools.ts` 与壳的审批流、日志目录、工具注册深度耦合，迁移是大改，本回合只对齐行为，收敛副本留后。
- 白名单文案只写「请改用程序参数」不枚举键：文案更短；但枚举让模型第一次就选对键，省掉试错往返，成本只是几十字符。
- prepackage 只加一条不前置：依赖自觉调用；但 npm 只对精确同名脚本自动跑 pre 钩子，`package:win` 等带冒号的脚本不会触发，显式前置才是机械保证，否决。
- Do nothing / reuse：零代码；代价是壳侧与核心仓的报错行为分叉扩大，file: 依赖过期陷阱随每次打包重现。

## Consequences

- **Gains**: 壳内同步与后台启动失败共享同一 hint，env 拒绝当轮自纠，轮询工具名一致；`npm run package:*` 自动核对并刷新当前 sibling 发布文件，避免消费旧的已安装副本。
- **Costs and limits**: 白名单键与 shim 名单仍两仓各存一份，增补需同步；`prepackage` 每次执行一次发布文件扫描和一次 npm install，未变包保留安装目录；缺失 sibling 或 main 构建入口时在安装前失败。安装失败恢复备份的本地包与两份 lockfile，npm 新装的其他依赖不做全树回滚。脚本核对的是已构建产物，不编译 sibling 源码；必须先在 janus-agentX 仓构建 dist。
- **Verification**: `npm run typecheck` 通过；`npx vitest run tests/unit/agent/command-tools.test.ts` 13 通过（含 spawn hint 与 `git -c` 指引新用例）。

依赖刷新验证使用 `tests/unit/prepare-package.test.ts` 的真实离线 npm 安装：内容变动、文件新增和删除、发布 files 白名单、新增本地依赖、未变包与 lockfile 保持、缺失 sibling/build 的前置失败，以及安装异常后恢复旧包和 lockfile。它不把入口文件存在视为 sibling 源码已完成编译的证明。
