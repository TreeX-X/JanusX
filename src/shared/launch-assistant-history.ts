// Note: display history is scoped to a checkout and never replays config changes — see .agents/notes/agent/requirements/chat-work-timeline.md
import { normalizeChatTimeline, type ChatTimelineSnapshot } from './chat-timeline'

export interface LaunchAssistantMessage { role: 'user' | 'assistant'; content: string; timeline?: ChatTimelineSnapshot }
const MAX_HISTORY_CHARS = 1_000_000

export function normalizeLaunchAssistantHistory(value: unknown): LaunchAssistantMessage[] {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('messages' in value) || !Array.isArray(value.messages)) return []
  return value.messages.slice(-40).flatMap(message => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return []
    const timeline = message.role === 'assistant' ? normalizeChatTimeline(message.timeline) : undefined
    return [{ role: message.role, content: message.content.slice(-200_000), ...(timeline && (timeline.blocks.length || timeline.truncated) ? { timeline } : {}) }]
  })
}

export function serializeLaunchAssistantHistory(messages: LaunchAssistantMessage[]): string {
  let retained = normalizeLaunchAssistantHistory({ version: 1, messages })
  let result = JSON.stringify({ version: 1, messages: retained })
  while (result.length > MAX_HISTORY_CHARS && retained.length) {
    retained = retained.slice(1)
    result = JSON.stringify({ version: 1, messages: retained })
  }
  return result
}
