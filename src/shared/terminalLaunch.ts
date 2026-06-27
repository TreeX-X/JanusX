export type TerminalPreset = 'shell' | 'claude' | 'codex' | 'opencode'

export interface TerminalPresetMeta {
  name: string
  label: string
  command?: string
  args?: string[]
  autoCommand?: string
}

type TerminalLaunchInput =
  | TerminalPreset
  | {
      preset?: string
      command?: string
      args?: string[]
      autoCommand?: string
    }
  | undefined

const TERMINAL_PRESET_META: Record<TerminalPreset, TerminalPresetMeta> = {
  shell: {
    name: 'bash',
    label: 'Shell'
  },
  claude: {
    name: 'claude',
    label: 'Claude',
    command: 'claude'
  },
  codex: {
    name: 'codex',
    label: 'Codex',
    command: 'codex'
  },
  opencode: {
    name: 'opencode',
    label: 'OpenCode',
    command: 'opencode'
  }
}

for (const meta of Object.values(TERMINAL_PRESET_META)) {
  meta.autoCommand = composeTerminalCommand(meta.command, meta.args)
}

export function isTerminalPreset(value: unknown): value is TerminalPreset {
  return (
    value === 'shell' ||
    value === 'claude' ||
    value === 'codex' ||
    value === 'opencode'
  )
}

export function getTerminalPresetMeta(preset: TerminalPreset): TerminalPresetMeta {
  return TERMINAL_PRESET_META[preset]
}

export function resolveTerminalLaunchCommand(input: TerminalLaunchInput): string | undefined {
  if (!input) return undefined

  if (typeof input === 'string') {
    return isTerminalPreset(input) ? getTerminalPresetMeta(input).autoCommand : undefined
  }

  if (isTerminalPreset(input.preset)) {
    return getTerminalPresetMeta(input.preset).autoCommand
  }

  return composeTerminalCommand(input.command, input.args) ?? normalizeTerminalCommand(input.autoCommand)
}

function composeTerminalCommand(command?: string, args?: string[]): string | undefined {
  const normalizedCommand = normalizeTerminalCommand(command)
  if (!normalizedCommand) return undefined

  const normalizedArgs = args?.map(normalizeTerminalCommand).filter(Boolean) ?? []
  return [normalizedCommand, ...normalizedArgs].join(' ')
}

function normalizeTerminalCommand(command?: string): string | undefined {
  const normalized = command?.replace(/[\r\n]+$/g, '').trim()
  return normalized || undefined
}
