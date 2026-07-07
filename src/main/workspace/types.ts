import type { AgentNotificationSettings } from '../../shared/notifications'
import type { KnowledgeSettings } from '../../shared/knowledge-settings'

export interface Workspace {
  id: string
  name: string
  path: string
  clis: CLIConfig[]
  layout: LayoutConfig
  lastTerminalType?: string
  createdAt: string
  updatedAt: string
}

export interface CLIConfig {
  id: string
  type: string
  command: string
  args: string[]
  env: Record<string, string>
}

export interface LayoutConfig {
  mode: 'grid' | 'tabs'
  positions: LayoutPosition[]
}

export interface LayoutPosition {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface CreateWorkspaceDto {
  name: string
  path: string
}

export interface UpdateWorkspaceDto {
  name?: string
  path?: string
  clis?: CLIConfig[]
  layout?: LayoutConfig
  lastTerminalType?: string
}

export interface GlobalConfig {
  theme: 'dark' | 'light'
  defaultTerminalPreset: string
  defaultShell: string
  registeredCLIs: CLIRegistration[]
  recentWorkspaces: string[]
  notificationSettings: AgentNotificationSettings
  knowledgeSettings: KnowledgeSettings
}

export interface CLIRegistration {
  id: string
  name: string
  command: string
  args: string[]
  description: string
}
