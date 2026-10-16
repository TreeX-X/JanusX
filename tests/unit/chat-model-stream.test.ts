import { describe, expect, it } from 'vitest'
import { jsonSchema } from 'ai-chat'
import { withAiSdkV1StreamCompatibility } from '../../packages/llm-core/dist/utils/stream-compat'
import { streamChatModel } from '../../src/main/llm/chat-model-stream'

describe('reasoning-capable chat model transport', () => {
  it('passes real provider chunks through compatibility and SDK without losing order or tool arguments', async () => {
    let received: any
    const source = {
      specificationVersion: 'v3', provider: 'test', modelId: 'test',
      doStream: async (options: unknown) => {
        received = options
        return { stream: new ReadableStream({ start(controller) {
          for (const part of [
            { type: 'stream-start', warnings: [] },
            { type: 'reasoning-delta', id: 'r', delta: 'Check the script.' },
            { type: 'text-delta', id: 't', delta: 'Reading the configuration.' },
            { type: 'tool-input-start', id: 'c', toolName: 'read' },
            { type: 'tool-input-delta', id: 'c', delta: '{"path":"package.json"}' },
            { type: 'tool-call', toolCallId: 'c', toolName: 'read', input: '{"path":"package.json"}' },
            { type: 'finish', finishReason: { unified: 'tool-calls' }, usage: { inputTokens: { total: 3 }, outputTokens: { total: 5 } } },
          ]) controller.enqueue(part)
          controller.close()
        } }) }
      },
    } as any
    const model = withAiSdkV1StreamCompatibility(source)
    const result = await streamChatModel({ model, messages: [{ role: 'user', content: 'Check config' }],
      maxTokens: 100, tools: { read: { parameters: jsonSchema({ type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }) } },
    })
    const parts = []
    for await (const part of result.fullStream!) parts.push(part)
    expect(parts.filter(part => ['reasoning-delta', 'text-delta', 'tool-call'].includes(part.type))).toMatchObject([
      { type: 'reasoning-delta', textDelta: 'Check the script.' },
      { type: 'text-delta', textDelta: 'Reading the configuration.' },
      { type: 'tool-call', toolCallId: 'c', args: { path: 'package.json' } },
    ])
    expect(parts.some(part => part.type === 'error')).toBe(false)
    expect(received.maxOutputTokens).toBe(100)
    expect(parts.find(part => part.type === 'finish')).toMatchObject({ usage: { promptTokens: 3, completionTokens: 5 } })

    // Legacy non-chat consumers still receive a stream their SDK understands.
    const legacy = await model.doStream({} as any)
    const reader = legacy.stream.getReader()
    const legacyParts = []
    for (;;) { const part = await reader.read(); if (part.done) break; legacyParts.push(part.value) }
    expect(legacyParts.some((part: any) => part.type.startsWith('reasoning'))).toBe(false)
  })
})
