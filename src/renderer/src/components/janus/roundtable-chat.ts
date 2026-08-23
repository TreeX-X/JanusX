import type { RoundtableMessage, RoundtableRole } from '../../../../shared/ipc/janus-roundtable'
import type { Message } from './useJanusChat'

export function roundtableMessagesToChat(messages: RoundtableMessage[], workingRole: RoundtableRole | null = null, currentRound = 0): Message[] {
  const labels: Record<RoundtableMessage['role'], string> = { user: '你', 'agent-1': 'Agent-1', 'agent-2': 'Agent-2', host: 'JanusX' }
  const mapped: Message[] = messages.map((message) => ({
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    content: message.role === 'user' ? message.content : `**${labels[message.role]}**\n\n${message.content}`,
    timestamp: message.createdAt,
  }))
  if (!workingRole || workingRole === 'user') return mapped
  return [...mapped, {
    id: `roundtable-working-${currentRound}-${workingRole}`,
    role: 'assistant' as const,
    content: `**${labels[workingRole]}**\n\n正在思考并准备发言...`,
    timestamp: messages[messages.length - 1]?.createdAt ?? Date.now(),
  }]
}
