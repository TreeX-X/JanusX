import { describe, expect, it, vi } from 'vitest'
import { createLoopToolsFromVercel, createVercelStream, toVercelMessages } from '../../../src/main/agent/loop/vercel-stream-adapter'

describe('Vercel stream adapter', () => {
  it('streams one model step without exposing executors to the SDK', async () => {
    const execute = vi.fn(async () => ({ ok: true }))
    const streamTextFn = vi.fn(async (options: any) => {
      expect(options.maxSteps).toBe(1)
      expect(options.tools.read.execute).toBeUndefined()
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
    expect(events).toEqual(['message_start', 'message_update'])
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
