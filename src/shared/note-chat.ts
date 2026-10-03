export interface NoteChatChange {
  id: string
  conversationId: string
  workspacePath: string
  reason: string
  createdAt: string
  txId?: string
  reverted?: boolean
  files: Array<{ uri: string; title: string; before: string; after: string }>
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
  reason: string
  notes: NoteScopeItem[]
}
