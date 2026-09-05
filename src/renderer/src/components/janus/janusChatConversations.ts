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

/* ════════════════════════════════════════════════════════════
   R7：手动 /compact —— 确定性持久化压缩（无 LLM 调用）
   把旧消息折叠为一条 assistant 摘要（路径/hash/查询原文保留，
   永不改写，沿用 P1 handoff 原则），释放持久化历史与下轮上下文。
   会话树分支（/tree//fork）按需再议，暂不做。
   ════════════════════════════════════════════════════════════ */

export const COMPACT_COMMAND = '/compact'
export const COMPACT_DEFAULT_KEEP_LAST = 10
export const COMPACT_MIN_KEEP_LAST = 2
export const COMPACT_MAX_KEEP_LAST = 50
export const COMPACT_SUMMARY_MAX_CHARS = 4_000
export const COMPACT_MESSAGE_PREVIEW_CHARS = 160
export const COMPACT_TOOL_TRACE_KEEP_LAST = 24
export const COMPACT_SUMMARY_PREFIX = '[Compacted conversation summary'

/** 解析 `/compact` / `/compact N`，非指令返回 null。 */
export function parseCompactCommand(text: string): { keepLast: number } | null {
  const match = text.trim().match(/^\/compact(?:\s+(\d+))?\s*$/)
  if (!match) return null
  const parsed = match[1] === undefined ? COMPACT_DEFAULT_KEEP_LAST : Number(match[1])
  if (!Number.isFinite(parsed)) return { keepLast: COMPACT_DEFAULT_KEEP_LAST }
  return {
    keepLast: Math.min(COMPACT_MAX_KEEP_LAST, Math.max(COMPACT_MIN_KEEP_LAST, Math.floor(parsed))),
  }
}

export interface JanusChatCompactionResult {
  messages: PersistedJanusConversation['messages']
  toolTraces: PersistedJanusConversation['toolTraces']
  compactedCount: number
  keptCount: number
  droppedToolTraces: number
  summaryChars: number
}

function singleLinePreview(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  return compact.length > COMPACT_MESSAGE_PREVIEW_CHARS
    ? `${compact.slice(0, COMPACT_MESSAGE_PREVIEW_CHARS)}…`
    : compact
}

/**
 * 确定性折叠旧消息：保留最近 keepLast 条，旧部记为一条 assistant 摘要。
 * 短会话直接 no-op（compactedCount 0），调用方据此提示“已足够紧凑”。
 */
export function compactJanusConversation(
  messages: PersistedJanusConversation['messages'],
  toolTraces: PersistedJanusConversation['toolTraces'] = [],
  keepLast: number = COMPACT_DEFAULT_KEEP_LAST,
): JanusChatCompactionResult {
  const clamped = Number.isFinite(keepLast)
    ? Math.min(COMPACT_MAX_KEEP_LAST, Math.max(COMPACT_MIN_KEEP_LAST, Math.floor(keepLast)))
    : COMPACT_DEFAULT_KEEP_LAST
  if (messages.length <= clamped) {
    return {
      messages,
      toolTraces,
      compactedCount: 0,
      keptCount: messages.length,
      droppedToolTraces: 0,
      summaryChars: 0,
    }
  }
  const dropped = messages.slice(0, messages.length - clamped)
  const kept = messages.slice(-clamped)
  const header = `${COMPACT_SUMMARY_PREFIX}: ${dropped.length} older messages collapsed; kept last ${kept.length}. ` +
    'Paths/hashes/queries below are verbatim — re-read a file before editing it.]'
  const lines = dropped.map((message) => `- ${message.role}: ${singleLinePreview(message.content)}`)
  const traceLines = toolTraces
    .slice(-COMPACT_TOOL_TRACE_KEEP_LAST)
    .map((entry) => `- ${entry.toolName}[${entry.workspaceId}] ${entry.status}: ${entry.summary}`)
  const sections = traceLines.length > 0
    ? [...lines, 'Earlier tool calls (most recent last):', ...traceLines]
    : lines
  // 有界：超限从最早行丢弃，保证摘要永不胀破预算。
  let omitted = 0
  while (sections.length > 0 && [header, ...sections].join('\n').length > COMPACT_SUMMARY_MAX_CHARS) {
    sections.shift()
    omitted += 1
  }
  const body = omitted > 0
    ? [header, `(earliest ${omitted} lines omitted for length)`, ...sections].join('\n')
    : [header, ...sections].join('\n')
  const summary: PersistedJanusConversation['messages'][number] = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: body,
    timestamp: Date.now(),
  }
  const keptTraces = toolTraces.slice(-COMPACT_TOOL_TRACE_KEEP_LAST)
  return {
    messages: [summary, ...kept],
    toolTraces: keptTraces,
    compactedCount: dropped.length,
    keptCount: kept.length,
    droppedToolTraces: toolTraces.length - keptTraces.length,
    summaryChars: body.length,
  }
}
