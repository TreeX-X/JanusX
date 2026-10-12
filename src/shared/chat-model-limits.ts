import type { ChatContextStatus } from './chat-context'

export interface ChatModelLimits {
  contextWindow: number
  maxOutputTokens: number
}
export interface ChatModelBudget extends ChatModelLimits {
  source: ChatContextStatus['source']
  resolved: boolean
}
export function validChatModelLimits(value: unknown): value is ChatModelLimits {
  if (!value || typeof value !== 'object') return false
  const limits = value as ChatModelLimits
  return Number.isSafeInteger(limits.contextWindow) && limits.contextWindow >= 1024 && limits.contextWindow <= 10_000_000
    && Number.isSafeInteger(limits.maxOutputTokens) && limits.maxOutputTokens >= 256
    && limits.maxOutputTokens < limits.contextWindow
}
