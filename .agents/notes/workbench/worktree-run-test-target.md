---
{
  "schema": "harness-note/2",
  "id": "cc4811c7-b7f1-490f-8770-81eaae8805e6",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-12",
  "updated": "2026-10-12T16:34:24Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/19cd1394-b2cb-4819-8fde-5f12de16574c",
  "tags": ["worktree", "runner", "testing"],
  "relations": [
    {"type": "related-to", "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/80e64e6f-91eb-50a2-94b4-fbc40b112e10"},
    {"type": "related-to", "target": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/55fdeb68-aab4-437a-8802-36d53c13bf52"}
  ]
}
---

# 按当前 worktree 运行与测试项目

## Intent

用户需要验证不同 worktree 中开发的功能。探索让运行与测试入口跟随当前选中的 worktree，并按 worktree 管理进程，减少手动切目录及误运行主盘代码。作为 0.9.2 候选功能记录，尚未实现，未确定发布承诺。

## 当前行为与临时用法

Island 的启动入口通过 `useProjectRunning` 读取 `activeWorkspace.path`，优先选择名为 `dev` 的启动配置，否则选择第一项；切换工作区内的 worktree 不改变该启动路径。配置读取自目标目录的 `.janusX/janusX.launch.json`。ProjectRunner 默认以传入项目路径为工作目录，配置中的 `cwd` 可覆盖它。

项目设置中的运行与测试使用该面板传入的 `projectPath`；工作区启动面板默认指向工作区根目录，也可以指向选中的子项目候选。现有这些入口没有统一跟随当前 worktree 的语义。

当前可在目标 worktree 的终端中先确认目录和分支，再执行项目的开发启动、类型检查和测试命令；依赖缺失或变化时需先安装依赖。也可把目标 worktree 单独添加为工作区并配置启动。Web 项目同时运行需处理端口冲突；Electron 开发实例还需确认应用数据、调试端口和单实例机制是否允许隔离运行。

## 建议范围

- 运行与测试操作在触发时确定目标 worktree，界面明确显示分支和路径；异步读取配置期间切换 worktree 不应把操作送到另一目录。
- 在目标 worktree 内解析项目目录、配置及工作目录，支持子项目；避免绝对 `cwd` 或主盘配置复用导致意外运行主盘代码。
- 运行状态、输出、停止和重启按所属 worktree 区分；一个 worktree 已运行不应阻止另一个启动。切换 worktree 时保留已有进程，停止操作的作用范围应明确。
- 测试沿用目标 worktree 的脚本和依赖，结果保留目标身份，便于核对实际验证了哪份代码。
- 先交付目标选择和进程归属，再评估自动分配端口、安装依赖及 Electron 多实例隔离。

## Open questions

- 当前 worktree 的选中状态以哪个共享状态为准；未选中或目标已删除时如何回退及提示？
- 启动配置独立存于各 worktree，还是继承工作区模板并允许覆盖；缺失配置时如何引导？
- Island 快捷启动与项目设置、子项目入口如何共享同一套目标解析规则？
- 停止当前 worktree 与停止整个工作区如何分别呈现；同一 worktree 是否允许多个配置并行？
- 0.9.2 是否只交付运行与测试目标跟随，端口和 Electron 实例隔离留到后续？
