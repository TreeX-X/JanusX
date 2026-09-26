import { describe, expect, it } from 'vitest'
import { sanitizeLoopMessages } from '../../../src/main/llm/loop-message-sanitize'

describe('sanitizeLoopMessages', () => {
  it('keeps leading system messages untouched', () => {
    const messages = [
      { role: 'system', content: 'prefix' },
      { role: 'system', content: 'prompt' },
      { role: 'user', content: 'hello' },
    ]
    expect(sanitizeLoopMessages(messages)).toEqual(messages)
    expect(sanitizeLoopMessages(messages)[0]).toBe(messages[0])
  })

  it('demotes system follow-ups after tool results to user', () => {
    const followUp = { role: 'system', content: 'Tool repair (x): retry once.' }
    const messages = [
      { role: 'system', content: 'prompt' },
      { role: 'user', content: 'read the notes' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'workspace_list' }] },
      { role: 'tool', content: 'ok' },
      followUp,
    ]
    const result = sanitizeLoopMessages(messages)
    expect(result.slice(0, 4).map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'tool'])
    expect(result[4]).toMatchObject({ role: 'user', content: followUp.content })
    expect(result[4]).not.toBe(followUp)
  })

  it('preserves order, content, and tool-call pairing', () => {
    const messages = [
      { role: 'system', content: 'a' },
      { role: 'user', content: 'b' },
      { role: 'system', content: 'c' },
      { role: 'system', content: 'd' },
      { role: 'assistant', content: 'e' },
    ]
    expect(sanitizeLoopMessages(messages).map((message) => `${message.role}:${message.content}`))
      .toEqual(['system:a', 'user:b', 'user:c', 'user:d', 'assistant:e'])
  })

  it('passes empty and system-only histories through', () => {
    expect(sanitizeLoopMessages([])).toEqual([])
    const only = [{ role: 'system', content: 'prompt' }]
    expect(sanitizeLoopMessages(only)).toEqual(only)
  })
})
