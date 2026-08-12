import { describe, expect, it, vi } from 'vitest'
import { runJanusAgentLoop, type JanusAgentMessage, type JanusAgentTool } from '../../../src/main/agent/loop/janus-agent-loop'

const userMessage: JanusAgentMessage = { role: 'user', content: 'start' }

describe('JanusAgentLoop', () => {
  it('runs tool calls, emits lifecycle events, and finishes on a plain response', async () => {
    const events: string[] = []
    let calls = 0
    const tool: JanusAgentTool = {
      name: 'workspace.read',
      execute: async () => ({ content: 'file contents' }),
    }
    const messages = await runJanusAgentLoop([userMessage], {
      tools: [tool],
      stream: async (context) => {
        calls += 1
        if (calls === 1) {
          expect(context.at(-1)?.role).toBe('user')
          return { message: { role: 'assistant', content: '' }, toolCalls: [{ id: '1', name: tool.name, arguments: { path: 'a.ts' } }] }
        }
        expect(context.at(-1)?.role).toBe('tool')
        return { message: { role: 'assistant', content: 'done' } }
      },
      onEvent: (event) => events.push(event.type),
    })
    expect(messages.at(-1)).toEqual({ role: 'assistant', content: 'done' })
    expect(events).toEqual(expect.arrayContaining(['agent_start', 'tool_execution_start', 'tool_execution_end', 'turn_end', 'agent_end']))
  })

  it('lets hooks block calls and replace results without knowing policy details', async () => {
    const after = vi.fn(async () => ({ content: 'redacted', isError: false }))
    const messages = await runJanusAgentLoop([userMessage], {
      tools: [{ name: 'workspace.edit', execute: async () => ({ content: 'should not run' }) }],
      stream: async () => ({ message: { role: 'assistant', content: '' }, toolCalls: [{ id: '1', name: 'workspace.edit', arguments: {} }] }),
      beforeToolCall: async () => ({ block: true, reason: 'approval required' }),
      afterToolCall: after,
      maxTurns: 1,
    })
    expect(after).not.toHaveBeenCalled()
    expect(messages.at(-1)).toMatchObject({ role: 'tool', content: 'approval required' })
  })

  it('executes parallel tools together and preserves steering messages', async () => {
    const order: string[] = []
    const tools = ['a', 'b'].map((name): JanusAgentTool => ({
      name,
      executionMode: 'parallel',
      execute: async () => {
        order.push(name)
        return { content: name }
      },
    }))
    let turn = 0
    const messages = await runJanusAgentLoop([userMessage], {
      tools,
      maxTurns: 2,
      stream: async () => {
        turn += 1
        return turn === 1
          ? { message: { role: 'assistant', content: '' }, toolCalls: tools.map((tool) => ({ id: tool.name, name: tool.name, arguments: {} })) }
          : { message: { role: 'assistant', content: 'done' } }
      },
      getSteeringMessages: async () => [{ role: 'user', content: 'continue' }],
    })
    expect(order).toHaveLength(2)
    expect(messages.some((message) => message.content === 'continue')).toBe(true)
  })
})
