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
