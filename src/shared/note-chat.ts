// Note: Janus extends the shared agentX runtime — see .agents/notes/blueprint/agentx-harness-inheritance.md
export type { NoteChatChange } from '@janus-agent/harness-node'

// Note: explicit UI intent is separate from working Notes — see .agents/notes/blueprint/navigation/requirements/module-focus-navigation.md
export type NoteFocusAction = 'preview' | 'enter' | 'locate'

export interface NoteBrowserState {
  blueprintId: string
  workspacePath: string
  moduleBrowsing: boolean
  moduleId: string | null
  selectedId: string | null
  visibleIds: string[]
}

export interface NoteScopeItem {
  uri: string
  title: string
  role: 'target' | 'reference' | 'dependency'
  reason: string
  pinned?: boolean
}

export interface NoteFocusEvent {
  id: string
  /** Renderer-owned assistant message identity for grouping access within a turn. */
  turnId?: string
  conversationId: string
  workspacePath: string
  mode: 'display' | 'scope' | 'access'
  focus: 'auto' | 'explicit' | 'none'
  /** Missing in historical events means locate. Scope/access events never navigate. */
  action?: NoteFocusAction
  reason: string
  notes: NoteScopeItem[]
}
