import { describe, expect, it } from 'vitest'
import { consumeSteeredIds, removeMessageById } from '../../src/renderer/src/components/janus/janusSteering'
import type { Message } from '../../src/renderer/src/components/janus/useJanusChat'

function message(id: string, content = id): Message {
  return { id, role: 'user', content, timestamp: 1 }
}

describe('janusSteering (R6-full)', () => {
  it('clears only acked ids from the pending badge set', () => {
    expect(consumeSteeredIds(['a', 'b'], ['b', 'unknown'])).toEqual(['a'])
  })

  it('keeps the reference when nothing matches', () => {
    const pending = ['a']
    expect(consumeSteeredIds(pending, [])).toBe(pending)
    expect(consumeSteeredIds(pending, ['missing'])).toBe(pending)
  })

  it('removes a cancelled optimistic message by id', () => {
    const messages = [message('a'), message('b')]
    const next = removeMessageById(messages, 'a')
    expect(next.map((item) => item.id)).toEqual(['b'])
    expect(messages).toHaveLength(2)
  })

  it('returns the same reference when the id is already gone', () => {
    const messages = [message('a')]
    expect(removeMessageById(messages, 'missing')).toBe(messages)
  })
})
