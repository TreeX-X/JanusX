import type { CompanionCommand, CompanionRequest } from '../../companion/contracts'
import type { CompanionGateway } from '../../companion/gateway'
import type { FeishuInboundEvent, FeishuInboundMessage, FeishuReceiptSender } from './types'
import { receiptText } from './types'

const HELP = 'Commands: /status, /bind <terminal-id>, /unbind, /stop, /p <text>'

export class FeishuInboundRouter {
  constructor(
    private readonly gateway: Pick<CompanionGateway, 'execute'>,
    private readonly receipts: FeishuReceiptSender,
    private readonly groupPromptPrefix = '/p',
  ) {}

  async handle(event: FeishuInboundEvent): Promise<void> {
    const request = event.kind === 'card-action' ? {
      context: event.context,
      command: event.command,
      actionToken: event.actionToken,
    } : this.messageRequest(event)

    if (!request) {
      await this.safeReceipt(event, `Rejected: ${HELP}`)
      return
    }
    const result = await this.gateway.execute(request)
    await this.safeReceipt(event, receiptText(result))
  }

  async rejectMalformed(chatId?: string, messageId?: string): Promise<void> {
    if (!chatId || !messageId) return
    await this.receipts.send(chatId, messageId, 'Rejected: malformed Feishu event').catch(() => undefined)
  }

  private messageRequest(event: FeishuInboundMessage): CompanionRequest | null {
    let text = event.text.trim()
    if (event.chatType === 'group') {
      const prefixed = hasCommandPrefix(text, this.groupPromptPrefix)
      if (!event.mentionedBot && !prefixed) return null
      text = stripMentions(text, event.mentionKeys)
    }
    const command = parseCommand(text, true, this.groupPromptPrefix)
    return command ? { context: event.context, command } : null
  }

  private async safeReceipt(event: FeishuInboundEvent, text: string): Promise<void> {
    await this.receipts.send(event.context.chatId, event.messageId, text.slice(0, 300)).catch(() => undefined)
  }
}

export function parseCommand(
  text: string,
  allowPlainFollowUp: boolean,
  promptPrefix = '/p',
): CompanionCommand | null {
  const value = text.trim()
  if (value === '/status') return { type: 'status' }
  if (value === '/unbind') return { type: 'unbind' }
  if (value === '/stop') return { type: 'stop' }
  const bind = /^\/bind ([^\s]+)$/.exec(value)
  if (bind) return { type: 'bind', terminalId: bind[1] }
  const prompt = new RegExp(`^${escapeRegExp(promptPrefix)} (.+)$`).exec(value)
  if (prompt) return { type: 'follow-up', text: prompt[1] }
  if (value.startsWith('/')) return null
  return allowPlainFollowUp && value ? { type: 'follow-up', text: value } : null
}

function hasCommandPrefix(text: string, prefix: string): boolean {
  return text === prefix || text.startsWith(`${prefix} `)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripMentions(text: string, keys: string[]): string {
  let value = text
  for (const key of keys) value = value.split(key).join(' ')
  return value.replace(/\s+/g, ' ').trim()
}
