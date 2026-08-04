import type { ChatToolTraceEntry } from './llm'

export const JANUS_CHAT_CHANNELS = {
  load: 'janus-chat:load',
  save: 'janus-chat:save',
} as const

export interface JanusChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface PersistedJanusConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: JanusChatMessage[]
  providerId?: string
  modelId?: string
  attachedWorkspaceIds: string[]
  toolTraces: ChatToolTraceEntry[]
}

export interface JanusChatStorageSnapshot {
  version: 1
  activeConversationId: string
  conversations: PersistedJanusConversation[]
}

export interface JanusChatAPI {
  load(): Promise<JanusChatStorageSnapshot | null>
  save(snapshot: JanusChatStorageSnapshot): Promise<void>
}

const MAX_CONVERSATIONS = 100
const MAX_MESSAGES = 200
const MAX_TOOL_TRACES = 48
const MAX_ID_LENGTH = 128
const MAX_TITLE_LENGTH = 80
const MAX_MESSAGE_LENGTH = 100_000
const MAX_TRACE_FIELD_LENGTH = 2_000

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.slice(0, maxLength)
    : null
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function normalizeConversation(value: unknown): PersistedJanusConversation | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const id = boundedString(source.id, MAX_ID_LENGTH)
  const title = boundedString(source.title, MAX_TITLE_LENGTH)
  const createdAt = finiteTimestamp(source.createdAt)
  const updatedAt = finiteTimestamp(source.updatedAt)
  if (!id || !title || createdAt === null || updatedAt === null || !Array.isArray(source.messages)) return null

  const messages = source.messages.slice(-MAX_MESSAGES).flatMap((item): JanusChatMessage[] => {
    if (!item || typeof item !== 'object') return []
    const message = item as Record<string, unknown>
    const messageId = boundedString(message.id, MAX_ID_LENGTH)
    const content = typeof message.content === 'string'
      ? message.content.slice(0, MAX_MESSAGE_LENGTH)
      : null
    const timestamp = finiteTimestamp(message.timestamp)
    if (!messageId || content === null || timestamp === null) return []
    if (message.role !== 'user' && message.role !== 'assistant') return []
    return [{ id: messageId, role: message.role, content, timestamp }]
  })

  const attachedWorkspaceIds = Array.isArray(source.attachedWorkspaceIds)
    ? [...new Set(source.attachedWorkspaceIds.flatMap((item) => {
        const workspaceId = boundedString(item, MAX_ID_LENGTH)
        return workspaceId ? [workspaceId] : []
      }))].slice(0, 32)
    : []

  const toolTraces = Array.isArray(source.toolTraces)
    ? source.toolTraces.slice(-MAX_TOOL_TRACES).flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const trace = item as Record<string, unknown>
        const toolName = boundedString(trace.toolName, MAX_ID_LENGTH)
        const workspaceId = boundedString(trace.workspaceId, MAX_ID_LENGTH)
        const status = boundedString(trace.status, MAX_ID_LENGTH)
        const summary = boundedString(trace.summary, MAX_TRACE_FIELD_LENGTH)
        return toolName && workspaceId && status && summary
          ? [{ toolName, workspaceId, status, summary }]
          : []
      })
    : []

  const providerId = boundedString(source.providerId, MAX_ID_LENGTH) ?? undefined
  const modelId = boundedString(source.modelId, 256) ?? undefined
  return {
    id,
    title,
    createdAt,
    updatedAt,
    messages,
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
    attachedWorkspaceIds,
    toolTraces,
  }
}

export function normalizeJanusChatSnapshot(value: unknown): JanusChatStorageSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  if (source.version !== 1 || !Array.isArray(source.conversations)) return null

  const seen = new Set<string>()
  const conversations = source.conversations.slice(0, MAX_CONVERSATIONS).flatMap((item) => {
    const conversation = normalizeConversation(item)
    if (!conversation || seen.has(conversation.id)) return []
    seen.add(conversation.id)
    return [conversation]
  })
  if (conversations.length === 0) return null

  const requestedActiveId = boundedString(source.activeConversationId, MAX_ID_LENGTH)
  return {
    version: 1,
    activeConversationId: requestedActiveId && seen.has(requestedActiveId)
      ? requestedActiveId
      : conversations[0].id,
    conversations,
  }
}
