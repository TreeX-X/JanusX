---
{
  "schema": "harness-note/2",
  "id": "55fdeb68-aab4-437a-8802-36d53c13bf52",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-11",
  "updated": "2026-10-11T05:46:37.000Z",
  "module": "note://972afef3-2fc7-49de-a3ee-7e041225d28c/bdd26e4e-8207-4c1f-8ea3-21f450ee7570"
}
---

# 可选择的普通终端 Shell

## Intent

用户希望“打开终端”支持 Git Bash，并允许自行指定 shell。当前 Windows 默认 shell 由 `src/main/terminal/presets.ts` 与 `src/main/ipc/handlers.ts` 固定为 `powershell.exe`；终端选择页只提供一个 `shell` 预设，没有 PowerShell、Git Bash 等独立选项。建议“新建终端”的主操作使用全局默认 shell，旁边的菜单可临时选用已安装的 PowerShell、Git Bash、CMD 或 WSL；设置页允许选择默认项及填写自定义可执行文件路径、启动参数。可按需要再考虑工作区级覆盖，不预设为首版要求。

Git Bash 应检测 Git for Windows 的 `bash.exe` 并在嵌入式 PTY 中启动；`git-bash.exe` 通常打开独立窗口。未检测到的选项需明确提示安装状态。启动前应验证路径和参数，并沿用当前 worktree 工作目录；现有终端不因默认值变化而被替换，恢复会话时保留原 shell。手动 shell 选择不应隐式改变 Claude、Codex 等直接启动 CLI 的预设或项目运行器。

## Open questions

- 首版是否只保存全局默认 shell，还是同时保存工作区默认值？
- WSL 项需要选择具体发行版吗？如何在未安装 WSL 时呈现？
- 自定义 shell 是否允许配置环境变量与登录模式；Git Bash 的工作目录和交互启动参数应以 Windows 实测定型。
