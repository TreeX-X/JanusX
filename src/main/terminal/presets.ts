import { exec } from 'child_process'
import { promisify } from 'util'
import type { TerminalPreset, TerminalPresetConfig } from './types'

const execAsync = promisify(exec)

export const PRESETS: Record<TerminalPreset, TerminalPresetConfig> = {
  shell: {
    name: '普通终端',
    preset: 'shell',
    description: 'Bash / Zsh / PowerShell',
  },
  claude: {
    name: 'Claude Code',
    preset: 'claude',
    command: 'claude',
    description: '自动启动 Claude Code CLI',
  },
  codex: {
    name: 'Codex',
    preset: 'codex',
    command: 'codex',
    description: '自动启动 Codex CLI',
  },
  opencode: {
    name: 'OpenCode',
    preset: 'opencode',
    command: 'opencode',
    description: '自动启动 OpenCode CLI',
  },
}

export function getAutoCommand(preset: TerminalPreset): string | undefined {
  const config = PRESETS[preset]
  if (!config?.command) return undefined
  const args = config.args?.length ? ` ${config.args.join(' ')}` : ''
  return `${config.command}${args}\n`
}

export function getPresetName(preset: TerminalPreset): string {
  return PRESETS[preset]?.name ?? '终端'
}

export async function checkCommandExists(command: string): Promise<boolean> {
  try {
    const checkCmd = process.platform === 'win32' ? `where ${command}` : `which ${command}`
    await execAsync(checkCmd)
    return true
  } catch {
    return false
  }
}

export function getDefaultShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'
  return process.env.SHELL || '/bin/bash'
}

export function getShellName(shell: string): string {
  const basename = shell.split(/[/\\]/).pop() ?? shell
  const nameMap: Record<string, string> = {
    bash: 'Bash',
    zsh: 'Zsh',
    fish: 'Fish',
    powershell: 'PowerShell',
    'powershell.exe': 'PowerShell',
    pwsh: 'PowerShell',
    cmd: 'CMD',
    'cmd.exe': 'CMD',
  }
  return nameMap[basename.toLowerCase()] ?? basename
}
