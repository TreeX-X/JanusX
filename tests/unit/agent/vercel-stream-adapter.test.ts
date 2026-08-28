import { describe, expect, it, vi } from 'vitest'
import { runJanusAgentLoop, type JanusAgentEvent } from '../../../src/main/agent/loop/janus-agent-loop'
import { createLoopToolsFromVercel, createVercelStream, toVercelMessages } from '../../../src/main/agent/loop/vercel-stream-adapter'

describe('Vercel stream adapter', () => {
  it('streams one model step without exposing executors to the SDK', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const streamTextFn = vi.fn(async (options: Record<string, unknown>) => {
      expect(options.maxSteps).toBe(1)
      const tools = options.tools as Record<string, Record<string, unknown>>
      expect(tools.read.execute).toBeUndefined()
      return {
        textStream: (async function* () { yield 'working' })(),
        toolCalls: Promise.resolve([{ toolCallId: 'call-1', toolName: 'read', args: { path: 'a.ts' } }]),
      }
    })
    const stream = createVercelStream({ model: {}, tools: { read: { parameters: {}, execute } }, streamTextFn })
    const events: string[] = []
    const result = await stream([{ role: 'user', content: 'read' }], new AbortController().signal, (event) => events.push(event.type))
    expect(result.toolCalls).toEqual([{ id: 'call-1', name: 'read', arguments: { path: 'a.ts' } }])
    expect(execute).not.toHaveBeenCalled()
    expect(events).toEqual(['message_start', 'message_update', 'tool_call_ready'])
  })

  it('turns AI SDK full stream tool fragments into one validated ready call', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const streamTextFn = vi.fn(async (options: Record<string, unknown>) => {
      expect(options.experimental_toolCallStreaming).toBe(true)
      return {
        textStream: (async function* () {})(),
        fullStream: (async function* () {
          yield { type: 'text-delta', textDelta: 'Reading ' }
          yield { type: 'reasoning-delta', textDelta: 'inspect files' }
          yield { type: 'tool-call-streaming-start', toolCallId: 'call-1', toolName: 'read' }
          yield { type: 'tool-call-delta', toolCallId: 'call-1', toolName: 'read', argsTextDelta: '{"path":"a' }
          yield { type: 'tool-call-delta', toolCallId: 'call-1', toolName: 'read', argsTextDelta: '.ts"}' }
          yield { type: 'tool-call', toolCallId: 'call-1', toolName: 'read', args: { path: 'a.ts' } }
          yield { type: 'step-finish', finishReason: 'tool-calls', usage: { promptTokens: 8, completionTokens: 3 } }
          yield { type: 'finish', finishReason: 'tool-calls', usage: { promptTokens: 8, completionTokens: 3 } }
        })(),
      }
    })
    const stream = createVercelStream({
      model: {},
      tools: { read: { parameters: { safeParse: () => ({ success: true }) }, execute } },
      streamTextFn,
    })
    const events: JanusAgentEvent[] = []

    const result = await stream([{ role: 'user', content: 'read' }], new AbortController().signal, (event) => events.push(event))

    expect(result).toMatchObject({
      message: { role: 'assistant', content: 'Reading ' },
      toolCalls: [{ id: 'call-1', name: 'read', arguments: { path: 'a.ts' } }],
    })
    expect(execute).not.toHaveBeenCalled()
    expect(events).toEqual(expect.arrayContaining([
      { type: 'reasoning_update', delta: 'inspect files' },
      { type: 'tool_call_start', callId: 'call-1', name: 'read' },
      { type: 'tool_call_update', callId: 'call-1', name: 'read', argumentsDelta: '{"path":"a' },
      { type: 'tool_call_ready', call: { id: 'call-1', name: 'read', arguments: { path: 'a.ts' } } },
      { type: 'model_finish', reason: 'tool_calls', usage: { promptTokens: 8, completionTokens: 3 } },
    ]))
    expect(events.filter((event) => event.type === 'model_finish')).toHaveLength(1)
  })

  it('returns the completed call and result to the next model step', async () => {
    let turn = 0
    const execute = vi.fn(async () => ({ content: 'a.ts contents' }))
    const streamTextFn = vi.fn(async (options: Record<string, unknown>) => {
      turn += 1
      if (turn === 1) {
        return {
          textStream: (async function* () {})(),
          fullStream: (async function* () {
            yield { type: 'tool-call', toolCallId: 'call-1', toolName: 'read', args: { path: 'a.ts' } }
            yield { type: 'finish', finishReason: 'tool-calls' }
          })(),
        }
      }
      expect(options.messages).toEqual(expect.arrayContaining([
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'read', args: { path: 'a.ts' } }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'read', result: { content: 'a.ts contents' } }] },
      ]))
      return {
        textStream: (async function* () {})(),
        fullStream: (async function* () {
          yield { type: 'text-delta', textDelta: 'done' }
          yield { type: 'finish', finishReason: 'stop' }
        })(),
      }
    })
    const vercelTools = { read: { parameters: {}, execute } }
    const messages = await runJanusAgentLoop([{ role: 'user', content: 'read a.ts' }], {
      tools: createLoopToolsFromVercel(vercelTools),
      stream: createVercelStream({ model: {}, tools: vercelTools, streamTextFn }),
    })

    expect(turn).toBe(2)
    expect(messages.at(-1)).toEqual({ role: 'assistant', content: 'done' })
    expect(execute).toHaveBeenCalledWith({ path: 'a.ts' })
  })

  it('surfaces full stream errors without executing a tool', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const stream = createVercelStream({
      model: {},
      tools: { read: { parameters: {}, execute } },
      streamTextFn: async () => ({
        textStream: (async function* () {})(),
        fullStream: (async function* () { yield { type: 'error', error: new Error('provider unavailable') } })(),
      }),
    })
    const events: string[] = []

    await expect(stream([{ role: 'user', content: 'read' }], new AbortController().signal, (event) => events.push(event.type)))
      .rejects.toThrow('provider unavailable')
    expect(events).toContain('model_error')
    expect(execute).not.toHaveBeenCalled()
  })

  it('converts assistant tool calls and tool results back into provider messages', () => {
    expect(toVercelMessages([
      { role: 'assistant', content: '', toolCalls: [{ id: 'call-1', name: 'read', arguments: { path: 'a.ts' } }] },
      { role: 'tool', content: '{"ok":true}', toolCallId: 'call-1', toolName: 'read' },
    ])).toEqual([
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'read', args: { path: 'a.ts' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'read', result: { ok: true } }] },
    ])
  })

  it('executes tool calls only when the Janus loop invokes them', async () => {
    const execute = vi.fn(async () => ({ value: 1 }))
    const [tool] = createLoopToolsFromVercel({ read: { parameters: {}, execute } })
    const result = await tool.execute({ id: 'call', name: 'read', arguments: {} }, new AbortController().signal)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.content).toBe('{"value":1}')
  })
})
