import { describe, expect, it } from 'vitest'
import { streamText } from 'ai'
import { z } from 'zod'
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
  it('maps AI SDK v1 tools into the v3 provider call contract', async () => {
    let receivedOptions: any
    const model = {
      specificationVersion: 'v3',
      provider: 'test',
      modelId: 'test-model',
      doGenerate: async () => ({}),
      doStream: async (options: any) => {
        receivedOptions = options
        return {
          stream: new ReadableStream({ start: (controller) => controller.close() }),
        }
      },
    } as any

    await withAiSdkV1StreamCompatibility(model).doStream({
      inputFormat: 'messages',
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Read the workspace' }] }],
      maxTokens: 128,
      mode: {
        type: 'regular',
        tools: [{
          type: 'function',
          name: 'workspace_list',
          description: 'List files',
          parameters: { type: 'object', properties: { workspaceId: { type: 'string' } } },
        }],
        toolChoice: { type: 'required' },
      },
    } as any)

    expect(receivedOptions).not.toHaveProperty('mode')
    expect(receivedOptions).not.toHaveProperty('inputFormat')
    expect(receivedOptions).toMatchObject({
      maxOutputTokens: 128,
      toolChoice: { type: 'required' },
      tools: [{
        type: 'function',
        name: 'workspace_list',
        inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' } } },
      }],
    })
    expect(receivedOptions.tools[0]).not.toHaveProperty('parameters')
  })

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

  it('normalizes legacy JanusX MCP tool names before AI SDK validation', async () => {
    const model = {
      specificationVersion: 'v3',
      provider: 'test',
      modelId: 'test-model',
      doGenerate: async () => ({}),
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'tool-call-delta',
              toolCallId: 'call-1',
              toolName: 'janusx_workspace_tools:list_dir',
              delta: '{"path":"src"}'
            })
            controller.enqueue({
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'janusx_workspace_tools:list_dir',
              input: '{"path":"src"}'
            })
            controller.close()
          }
        })
      })
    } as any

    const result = await withAiSdkV1StreamCompatibility(model).doStream({} as any)
    const chunks = await readStream(result.stream)

    expect(chunks).toEqual([
      expect.objectContaining({ type: 'tool-call-delta', toolName: 'workspace_list' }),
      expect.objectContaining({ type: 'tool-call', toolName: 'workspace_list' })
    ])
  })

  it('completes an AI SDK v1 tool roundtrip through a v3 provider model', async () => {
    let callCount = 0
    const receivedOptions: any[] = []
    const model = withAiSdkV1StreamCompatibility({
      specificationVersion: 'v3',
      provider: 'test',
      modelId: 'test-model',
      doGenerate: async () => ({}),
      doStream: async (options: any) => {
        receivedOptions.push(options)
        callCount += 1
        return {
          stream: new ReadableStream({
            start(controller) {
              if (callCount === 1) {
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'workspace_list',
                  input: '{"workspaceId":"one"}',
                })
                controller.enqueue({
                  type: 'finish',
                  finishReason: { unified: 'tool-calls' },
                  usage: { inputTokens: 4, outputTokens: 2 },
                })
              } else {
                controller.enqueue({ type: 'text-delta', id: 'text-1', delta: 'Workspace ready' })
                controller.enqueue({
                  type: 'finish',
                  finishReason: { unified: 'stop' },
                  usage: { inputTokens: 8, outputTokens: 2 },
                })
              }
              controller.close()
            },
          }),
        }
      },
    } as any)
    const execute = async () => ({ entries: ['README.md'] })
    const result = await streamText({
      model,
      messages: [{ role: 'user', content: 'List the workspace' }],
      tools: {
        workspace_list: {
          description: 'List workspace files',
          parameters: z.object({ workspaceId: z.string() }),
          execute,
        },
      },
      maxSteps: 2,
    })

    let text = ''
    for await (const delta of result.textStream) text += delta

    expect(text).toBe('Workspace ready')
    expect(receivedOptions).toHaveLength(2)
    expect(receivedOptions[0].tools[0]).toMatchObject({
      name: 'workspace_list',
      inputSchema: expect.objectContaining({ type: 'object' }),
    })
    expect(receivedOptions[1].prompt).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'assistant',
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'tool-call',
            toolName: 'workspace_list',
            input: { workspaceId: 'one' },
          }),
        ]),
      }),
      expect.objectContaining({
        role: 'tool',
        content: [expect.objectContaining({
          type: 'tool-result',
          toolName: 'workspace_list',
          output: { type: 'json', value: { entries: ['README.md'] } },
        })],
      }),
    ]))
  })
})
