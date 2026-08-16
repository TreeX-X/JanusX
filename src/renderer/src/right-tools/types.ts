import type { TypedI18nKey } from '@/i18n/types'

export type RightToolId = 'files' | 'git' | 'checkpoints' | 'assist'

export type RightToolIconKind = 'files' | 'git' | 'checkpoints' | 'assist'

export interface RightToolDefinition {
  id: RightToolId
  titleKey: TypedI18nKey
  shortTitleKey: TypedI18nKey
  ariaLabelKey: TypedI18nKey
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
