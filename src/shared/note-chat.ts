// Note: Janus extends the shared agentX runtime — see .agents/notes/blueprint/agentx-harness-inheritance.md
export type { NoteChatChange } from '@janus-agent/harness-node'

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
  reason: string
  notes: NoteScopeItem[]
}
