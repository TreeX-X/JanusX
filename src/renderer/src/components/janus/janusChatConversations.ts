import type {
  JanusChatStorageSnapshot,
  PersistedJanusConversation,
} from '../../../../shared/ipc/janus-chat'
// Retained for isolated renderer harnesses; production conversations are persisted by main IPC.
export const CONVERSATION_STORAGE_KEY = 'janusx.janus-chat.conversations.v1'
export const NEW_CONVERSATION_TITLE = 'New conversation'
export const MAX_CHAT_MESSAGES = 200
export const MAX_TOOL_TRACES = 48

export function capChatMessages(
  messages: PersistedJanusConversation['messages'],
): PersistedJanusConversation['messages'] {
  return messages.length > MAX_CHAT_MESSAGES ? messages.slice(-MAX_CHAT_MESSAGES) : messages
}

export function createJanusConversation(id = crypto.randomUUID()): PersistedJanusConversation {
  const now = Date.now()
  return {
    id,
    title: NEW_CONVERSATION_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: [],
    attachedWorkspaceIds: [],
    toolTraces: [],
  }
}

export function titleFromMessages(messages: PersistedJanusConversation['messages']): string {
  const first = messages.find((message) => message.role === 'user')?.content.trim()
  if (!first) return NEW_CONVERSATION_TITLE
  const compact = first.replace(/\s+/g, ' ')
  return compact.length > 36 ? `${compact.slice(0, 36)}...` : compact
}

export function getRetryTurn(messages: PersistedJanusConversation['messages']): {
  history: PersistedJanusConversation['messages']
  userMessage: PersistedJanusConversation['messages'][number]
} | null {
  let index = messages.length - 1
  while (index >= 0 && messages[index].role !== 'user') index -= 1
  return index < 0 ? null : { history: messages.slice(0, index), userMessage: messages[index] }
}

export function createInitialSnapshot(): JanusChatStorageSnapshot {
  const conversation = createJanusConversation()
  return { version: 1, activeConversationId: conversation.id, conversations: [conversation] }
}
