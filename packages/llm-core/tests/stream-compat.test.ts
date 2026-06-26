import { describe, expect, it } from 'vitest'
import { withAiSdkV1StreamCompatibility } from '../src/utils/stream-compat'

async function readStream(stream: ReadableStream<any>): Promise<any[]> {
  const reader = stream.getReader()
  const chunks: any[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  return chunks
}

describe('stream compatibility', () => {
  it('normalizes newer AI SDK stream chunks to v1 chunks', async () => {
    const model = {
      specificationVersion: 'v3',
      provider: 'test',
      modelId: 'test-model',
      defaultObjectGenerationMode: undefined,
      doGenerate: async () => ({
        text: 'hello',
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0 },
        rawCall: { rawPrompt: {}, rawSettings: {} }
      }),
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            controller.enqueue({ type: 'text-start', id: 'text-1' })
            controller.enqueue({ type: 'text-delta', id: 'text-1', delta: 'hello' })
            controller.enqueue({ type: 'reasoning-delta', id: 'reasoning-1', delta: 'hidden' })
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 }
            })
            controller.close()
          }
        }),
        warnings: [],
        rawCall: { rawPrompt: {}, rawSettings: {} }
      })
    } as any

    const result = await withAiSdkV1StreamCompatibility(model).doStream({} as any)
    const chunks = await readStream(result.stream)

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toEqual({ type: 'text-delta', textDelta: 'hello' })
    expect(chunks[1]).toMatchObject({
      type: 'finish',
      finishReason: 'stop',
      usage: { promptTokens: 3, completionTokens: 2 }
    })
  })
})
