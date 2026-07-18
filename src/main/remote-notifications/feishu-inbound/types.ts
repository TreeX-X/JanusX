import type { CompanionCommand, CompanionRequestContext, CompanionResult } from '../../companion/contracts'

export interface FeishuInboundMessage {
  kind: 'message'
  context: CompanionRequestContext
  messageId: string
  chatType: 'p2p' | 'group'
  mentionedBot: boolean
  mentionKeys: string[]
  text: string
}

export interface FeishuInboundCardAction {
  kind: 'card-action'
  context: CompanionRequestContext
  messageId: string
  command: CompanionCommand
  actionToken: string
}

export type FeishuInboundEvent = FeishuInboundMessage | FeishuInboundCardAction

export interface FeishuReceiptSender {
  send(chatId: string, messageId: string, text: string): Promise<void>
}

export interface FeishuInboundChannel {
  onMessage(handler: (event: unknown) => void | Promise<void>): () => void
  onCardAction(handler: (event: unknown) => void | Promise<void>): () => void
  onError(handler: (error: unknown) => void): () => void
  onReconnecting(handler: () => void): () => void
  onReconnected(handler: () => void): () => void
  connect(): Promise<void>
  disconnect(): Promise<void>
  getStatus?(): FeishuConnectionStatus
  receipts: FeishuReceiptSender
}

export interface FeishuConnectionStatus {
  state: 'disabled' | 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
  error?: string
}

export function receiptText(result: CompanionResult): string {
  if (result.replayed) return `Duplicate: ${result.message}`
  if (result.ok) return `Accepted: ${result.message}`
  const prefix: Partial<Record<CompanionResult['code'], string>> = {
    'expired-binding': 'Expired',
    'expired-token': 'Expired',
    'unbound': 'Unbound',
    'terminal-unavailable': 'Stale target',
    'invalid-target': 'Stale target',
    'execution-failed': 'Failed',
  }
  return `${prefix[result.code] ?? 'Rejected'}: ${result.message}`
}
