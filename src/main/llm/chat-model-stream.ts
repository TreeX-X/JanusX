// Note: reasoning uses an isolated SDK consumer — see .agents/notes/agent/requirements/chat-work-timeline.md
import { streamText } from 'ai-chat'
import { withChatStreamCompatibility } from '@janusx/llm-core'
import type { ChatTurnPorts } from '@janus-agent/janus-agent'

/** Preserve the agent loop's transport contract, ordering and retry ownership. */
export const streamChatModel: ChatTurnPorts['streamTextFn'] = async (options) => {
  const result = streamText({
    ...options,
    model: withChatStreamCompatibility(options.model as Parameters<typeof withChatStreamCompatibility>[0]) as unknown as Parameters<typeof streamText>[0]['model'],
    maxRetries: 0,
    toolCallStreaming: true,
    onError: () => undefined,
  } as Parameters<typeof streamText>[0])
  return {
    get textStream() { return result.textStream },
    fullStream: (async function* () {
      for await (const part of result.fullStream) {
        if (part.type === 'reasoning') yield { type: 'reasoning-delta', textDelta: part.textDelta }
        else yield part
      }
    })(),
  }
}
