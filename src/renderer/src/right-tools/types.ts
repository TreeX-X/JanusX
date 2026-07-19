export type RightToolId = 'files' | 'git' | 'checkpoints' | 'assist'

export type RightToolIconKind = 'files' | 'git' | 'checkpoints' | 'assist'

export interface RightToolDefinition {
  id: RightToolId
  title: string
  shortTitle: string
  ariaLabel: string
  icon: RightToolIconKind
  order: number
  instancePolicy: 'single'
  mountPolicy: 'while-open'
}

export interface RightToolPreferencesV1 {
  schemaVersion: 1
  openToolIds: RightToolId[]
  activeToolId: RightToolId | null
  panelWidth: number
}

export type PanelCollapseCommand = 'none' | 'expand' | 'collapse' | 'toggle'

export interface RightToolTransition {
  preferences: RightToolPreferencesV1
  panelCollapseCommand: PanelCollapseCommand
}
