import type { IPty } from 'node-pty'

export type TerminalPreset = 'shell' | 'claude' | 'codex' | 'opencode'

export interface TerminalConfig {
  id: string
  workspaceId: string
  cwd: string
  shell: string
  autoCommand?: string
}

export interface TerminalInstance {
  id: string
  pty: IPty
  config: TerminalConfig
  status: 'idle' | 'running' | 'exited'
  createdAt: number
}

export interface TerminalPresetConfig {
  name: string
  preset: TerminalPreset
  command?: string
  args?: string[]
  description: string
}
