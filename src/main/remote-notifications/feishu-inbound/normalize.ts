import { createHash } from 'crypto'
import { z } from 'zod'
import type { CompanionCommand } from '../../companion/contracts'
import type { FeishuInboundCardAction, FeishuInboundMessage } from './types'

const messageSchema = z.object({
  messageId: z.string().min(1).max(256),
  chatId: z.string().min(1).max(256),
  chatType: z.enum(['p2p', 'group']),
  senderId: z.string().min(1).max(256),
  content: z.string().max(16_000),
  rawContentType: z.string(),
  mentionedBot: z.boolean(),
  mentions: z.array(z.object({ key: z.string().max(256), isBot: z.boolean().optional() })).default([]),
  rootId: z.string().max(256).optional(),
  threadId: z.string().max(256).optional(),
  createTime: z.number().finite(),
})

const cardSchema = z.object({
  messageId: z.string().min(1).max(256),
  chatId: z.string().min(1).max(256),
  operator: z.object({ openId: z.string().min(1).max(256) }),
  action: z.object({ value: z.unknown() }),
})

const actionValueSchema = z.object({
  janusx: z.literal(1),
  action: z.enum(['bind', 'stop', 'approve', 'reject', 'create-terminal']),
  terminalId: z.string().min(1).max(256).optional(),
  workspaceId: z.string().min(1).max(256).optional(),
  engine: z.enum(['claude', 'codex', 'opencode']).optional(),
  token: z.string().min(1).max(4096),
  threadId: z.string().min(1).max(256).optional(),
})

export function normalizeFeishuMessage(raw: unknown): FeishuInboundMessage | null {
  const parsed = messageSchema.safeParse(raw)
  if (!parsed.success || parsed.data.rawContentType !== 'text') return null
  const value = parsed.data
  return {
    kind: 'message',
    context: {
      provider: 'feishu',
      eventId: value.messageId,
      operatorOpenId: value.senderId,
      chatId: value.chatId,
      threadId: value.threadId ?? value.rootId,
      timestamp: normalizeTimestamp(value.createTime),
    },
    messageId: value.messageId,
    chatType: value.chatType,
    mentionedBot: value.mentionedBot,
    mentionKeys: value.mentions.filter((mention) => mention.isBot).map((mention) => mention.key),
    text: value.content,
  }
}

export function normalizeFeishuCardAction(raw: unknown, now = Date.now): FeishuInboundCardAction | null {
  const card = cardSchema.safeParse(raw)
  if (!card.success) return null
  const value = actionValueSchema.safeParse(card.data.action.value)
  if (!value.success) return null
  if (value.data.action === 'create-terminal' && (!value.data.workspaceId || !value.data.engine)) return null
  if (value.data.action === 'bind' && !value.data.terminalId) return null
  const command: CompanionCommand = value.data.action === 'bind'
    ? { type: 'bind', terminalId: value.data.terminalId! }
    : value.data.action === 'create-terminal' && value.data.workspaceId && value.data.engine
      ? { type: 'create-terminal', workspaceId: value.data.workspaceId, engine: value.data.engine }
    : { type: value.data.action as 'stop' | 'approve' | 'reject' }
  return {
    kind: 'card-action',
    context: {
      provider: 'feishu',
      eventId: stableCardEventId(card.data.messageId, card.data.operator.openId, value.data.token),
      operatorOpenId: card.data.operator.openId,
      chatId: card.data.chatId,
      threadId: value.data.threadId,
      timestamp: now(),
    },
    messageId: card.data.messageId,
    command,
    actionToken: value.data.token,
  }
}

function normalizeTimestamp(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value
}

function stableCardEventId(messageId: string, openId: string, token: string): string {
  return `card-${createHash('sha256').update(`${messageId}\0${openId}\0${token}`).digest('hex')}`
}
