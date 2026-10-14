---
{
  "schema": "harness-note/2",
  "id": "770d7e33-737c-4939-bb7e-362d5a88b894",
  "kind": "task",
  "lifecycle": "accepted",
  "created": "2026-10-13",
  "class": "feature",
  "tags": ["shell","gitbash","terminal","settings"],
  "work": {
    "scope": [
      {
        "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
        "paths": [
          "src/main/terminal/",
          "src/main/config/",
          "src/main/ipc/handlers.ts",
          "src/main/ipc/terminal-handlers.ts",
          "src/shared/terminalLaunch.ts",
          "src/renderer/src/lib/terminal-launch.ts",
          "src/renderer/src/components/TerminalArea.tsx",
          "src/renderer/src/components/AppSettingsModal.tsx",
          "src/renderer/src/components/ui/TerminalPresetIcon.tsx",
          "src/renderer/src/i18n/locales/",
          "tests/unit/terminal/",
          ".agents/notes/"
        ]
      }
    ],
    "acceptanceRefs": [
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/770d7e33-737c-4939-bb7e-362d5a88b894","criterionId":"AC-1"},
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/770d7e33-737c-4939-bb7e-362d5a88b894","criterionId":"AC-2"},
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/770d7e33-737c-4939-bb7e-362d5a88b894","criterionId":"AC-3"},
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/770d7e33-737c-4939-bb7e-362d5a88b894","criterionId":"AC-4"},
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/770d7e33-737c-4939-bb7e-362d5a88b894","criterionId":"AC-5"},
      {"uri":"note://972afef3-2fc7-49de-a3ee-7e041225d28c/770d7e33-737c-4939-bb7e-362d5a88b894","criterionId":"AC-6"}
    ],
    "verification": [
      {
        "id": "V-1",
        "kind": "command",
        "required": true,
        "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
        "cwd": ".",
        "program": "npm",
        "args": ["run","typecheck"]
      },
      {
        "id": "V-2",
        "kind": "command",
        "required": true,
        "repoId": "972afef3-2fc7-49de-a3ee-7e041225d28c",
        "cwd": ".",
        "program": "npx",
        "args": ["vitest","run","tests/unit/terminal"]
      }
    ],
    "review": "self"
  },
  "updated": "2026-10-13T10:30:00.000Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---
# Git Bash 与自定义 Shell 终端管理实现

## Goal

依据[可选择的普通终端 Shell](../shell-profiles.md)的定稿设计，交付用户自建 shell 条目、检测候选区、三处一致入口与 CLI 预设卡片显隐的终端管理功能。首版预置 PowerShell 一条默认种子项；其余 shell（含 Git Bash）经检测候选区确认添加。本 Task 与 [Docker 管理入口实现](../../workbench/tasks/docker-management-entry.md)相互独立，可分开执行。

## Scope

P1 数据模型与配置存储：shell 条目 schema（名称、图标、自由命令、启动后缀、显隐开关、默认标记）与全局默认项持久化；PowerShell 种子条目；CLI 预设卡片显隐配置位。配置只存全局级。

P2 启动链路：自由命令 + 启动后缀按 PTY 直启拼接（命令按可执行名与参数解析、后缀追加为尾参；引号、管道等复杂串由用户写入命令本身，必要时用系统 shell 包裹）；工作目录固定沿用当前 worktree；启动前验证路径。Git Bash 检测 Git for Windows 的 `bash.exe`（非 `git-bash.exe`），建议后缀 `--login -i` 与 worktree 落位以 Windows 实测定型。会话恢复保留原 shell，改默认值不替换现有终端。

P3 检测与候选区：扫描已知 shell 与 CLI（bash、pwsh、cmd 等）进入候选区；候选默认隐藏，确认后入库并预填命令与建议后缀；可执行名丢失的条目标红并提供重新检测或隐藏入口。

P4 设置“终端管理”：已配置列表（编辑命令与后缀、显隐开关、默认标记）与候选区两个区块；默认项唯一标记。

P5 三处入口适配：Shell 卡片（主体启动默认项 + 始终可见下拉临时选择）、空白页卡片、`TerminalPresetCapsule` 新建终端菜单提供一致入口；菜单只含“已配置 + 显示”项；创建后的终端显示实际 shell 名称；临时选择只作用本次新建，不隐式改变 Claude、Codex 等 CLI 预设或项目运行器。

## Acceptance criteria

- [ ] AC-1: 设置“终端管理”可增删改任意自由命令条目（名称、图标、命令、启动后缀、显隐、默认标记），默认项唯一；全新用户预置 PowerShell 一条默认种子项。
- [ ] AC-2: Shell 卡片、空白页、`TerminalPresetCapsule` 三处入口一致：主体点击启动默认项，下拉临时选择仅作用本次新建；只展示“已配置 + 显示”项，创建后终端显示实际 shell 名称。
- [ ] AC-3: 自由命令 + 启动后缀按 PTY 直启契约拼接，工作目录固定沿用 worktree；Git Bash 检测 `bash.exe`，未检测到的项明确提示安装状态；建议后缀与落位在 Windows 实测定型。
- [ ] AC-4: CLI 预设卡片（Claude、Codex、Janus 等）纳入显隐管理；隐藏只影响新建入口，已有终端与会话照常运行；shell 选择不隐式改变 CLI 预设。
- [ ] AC-5: 检测候选默认隐藏，确认入库预填命令与建议后缀；可执行名丢失的条目标红并可重新检测或隐藏。
- [ ] AC-6: 首版边界守住：仅全局默认、无工作区覆盖、无 WSL 专门支持、无环境变量与登录模式字段；`npm run typecheck` 与相关单测绿。

## Verification

- V-1: `npm run typecheck`（required）。
- V-2: `npx vitest run tests/unit/terminal`（新增：条目 schema、启动拼接、检测候选、显隐过滤；回归：既有终端启动与会话恢复）。
- V-3: Windows 手动实测：Git Bash `bash.exe` 检测与 worktree 落位、`--login -i` 建议后缀、三处入口交互、临时选择不改默认、恢复会话保留原 shell。

## Boundary

不做工作区级默认覆盖、不做 WSL 专门支持、不设环境变量与登录模式字段（自由命令 + 启动后缀已覆盖，如 `env FOO=1 bash --login`）。不改动 Claude、Codex 等 CLI 预设的启动语义，仅管理显隐。

## Results

2026-10-13 落地 P1–P5（Main Agent xdo，单次执行，无子代理）：

- P1 数据模型与存储：`src/shared/shellProfiles.ts` 定义条目 schema（名称、可选字形、自由命令、启动后缀、显隐、默认标记）与 CLI 预设显隐；`GlobalConfig.shellProfiles` 持久化，缺席时回落 PowerShell 种子条目（兼容旧配置）；`normalizeShellProfiles` 保证默认项唯一、id 唯一、空列表不被重新播种。
- P2 启动链路：命令按可执行名与参数解析（引号内 Windows 路径保持整体），后缀追加为尾参；`terminal:create` 新增 `shellProfileId` / `shellCommand`，主进程据此直启；工作目录沿用既有 cwd（worktree）。启动前校验：显式路径不存在或可执行名不在 PATH 时报错，错误在已有 try 内抛出，走完整 rollback。冷恢复在 manifest 记录 `shell` 启动行并按原样重建，改默认值不替换现有终端；retry 沿用记录里的启动行。
- P3 检测与候选区：`detectShellCandidates` 按平台探测 bash / pwsh / powershell / cmd（Windows）与 zsh / bash / fish / sh（其他）；Windows 上 `bash` 优先取 Git for Windows 路径而非 System32 的 WSL bash；建议后缀 `--login -i`。候选默认不进新建入口，确认后入库并预填命令与建议后缀；可执行名丢失的条目在设置里标红，提供重新检测与隐藏。
- P4 设置「终端管理」：新增 AppSettingsModal `terminal` 页（文案走 terminal 命名空间，未给 settings.json 追加 key），含已配置列表（增删改、显隐、默认单选）、CLI 预设卡片显隐、检测候选区三个区块。
- P5 三处入口：空白页 Shell 卡片主体启动默认项并显示默认 shell 启动行，常驻下拉箭头提供本次临时选择；`TerminalPresetCapsule` 菜单改为「可见 shell 条目 + 可见 CLI 预设」，默认项带标记；临时选择只作用本次新建，不改全局默认值，也不改 Claude/Codex 等 CLI 预设启动语义。

验证状态：

- V-1 `npm run typecheck`：**通过**（退出码 0，2026-10-13 在本机跑通）。
- V-2 `npx vitest run tests/unit/terminal`：**通过** —— 17 个文件 109 个测试全绿（含既有终端启动与会话恢复回归）。新增 `tests/unit/shell-profiles.test.ts`（23 例：条目 schema、命令解析、启动拼接、显隐过滤、候选探针、带空格路径加引号）与 `tests/unit/shell-profile-launch.test.ts`（14 例：默认/临时选择解析、缺失路径与 PATH 报错、冷恢复直启、Git Bash 择优、候选已配置标记）单独跑 41 例全绿。
- V-3 Windows 手动实测仍未执行：Git Bash `bash.exe` 实测定位与 worktree 落位、`--login -i` 建议后缀、三处入口交互、恢复会话保留原 shell 待实测。`--login -i` 目前只是候选区预填建议值，未经 Windows 实测定型。AC 勾选待 V-3 与界面走查后由维护者确认。

补记（本地无 node_modules 期间的替代验证，已被上面的正式结果取代，留作过程记录）：曾用 node 24 类型剥离对纯逻辑跑过 shared 24 条、主进程 18 条断言（`.cache/` 临时脚本，已删）。正是那段验证暴露出下面两处缺陷。

落地过程中修过的两处自身缺陷（均由上述替代验证暴露）：

- 候选区预填的绝对路径若含空格（`C:\Program Files\Git\cmd\bash.exe`）会被命令行解析拆开，导致启动失败且匹配不上「已配置」；改为预填时自动加引号，并补了回归用例。
- `terminal:create` 的 continue 路径原先只传 `shell` 字符串，普通终端会落到当前默认条目而丢掉原 shell；改为按 `preset === 'shell'` 传 `shellCommand`。

另外：新建终端菜单的 shell 项名称来自条目名（种子项为 PowerShell），`tests/e2e/desktop-smoke.spec.ts` 里 `New Shell terminal` 的选择器随之改为 `New PowerShell terminal`；菜单行宽放不下完整启动行，默认 shell 的启动行改由该项 tooltip 展示。

## Handoff

Main Agent 负责本 Task 的排期与状态维护；子代理只读。执行前重读[设计 note](../shell-profiles.md)的 Decisions 与 Pending validation。
