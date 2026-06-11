import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('CodexParser', () => {
  let CodexParser: new () => { parseLine(json: Record<string, unknown>): import('../../../src/main/agent/types').AgentEvent[]; reset(): void }

  beforeEach(async () => {
    const mod = await import('../../../src/main/agent/parsers/codex-parser')
    CodexParser = mod.CodexParser
  })

  // --- text events ---

  describe('text events', () => {
    it('should emit text-chunk for agent_message with text', () => {
      const parser = new CodexParser()
      const events = parser.parseLine({ type: 'agent_message', text: 'Hello from Codex' })
      expect(events).toEqual([{ type: 'text-chunk', text: 'Hello from Codex' }])
    })

    it('should emit text-chunk for each agent_message independently', () => {
      const parser = new CodexParser()
      const events1 = parser.parseLine({ type: 'agent_message', text: 'First' })
      const events2 = parser.parseLine({ type: 'agent_message', text: 'Second' })
      expect(events1).toEqual([{ type: 'text-chunk', text: 'First' }])
      expect(events2).toEqual([{ type: 'text-chunk', text: 'Second' }])
    })

    it('should not emit event when text is missing', () => {
      const parser = new CodexParser()
      const events = parser.parseLine({ type: 'agent_message' })
      expect(events).toEqual([])
    })
  })

  // --- tool events ---

  describe('tool events', () => {
    it('should emit tool-start for item.started with command', () => {
      const parser = new CodexParser()
      const events = parser.parseLine({
        type: 'item.started',
        item: { id: 'item1', type: 'command', command: 'ls -la' },
      })
      expect(events).toEqual([
        { type: 'tool-start', id: 'item1', name: 'command', arg: 'ls -la' },
      ])
    })

    it('should extract path as arg when command is absent', () => {
      const parser = new CodexParser()
      const events = parser.parseLine({
        type: 'item.started',
        item: { id: 'item2', type: 'file_read', path: '/src/index.ts' },
      })
      expect(events).toEqual([
        { type: 'tool-start', id: 'item2', name: 'file_read', arg: '/src/index.ts' },
      ])
    })

    it('should extract query as arg when command and path are absent', () => {
      const parser = new CodexParser()
      const events = parser.parseLine({
        type: 'item.started',
        item: { id: 'item3', type: 'search', query: 'TODO' },
      })
      expect(events).toEqual([
        { type: 'tool-start', id: 'item3', name: 'search', arg: 'TODO' },
      ])
    })

    it('should use empty string when no command, path, or query', () => {
      const parser = new CodexParser()
      const events = parser.parseLine({
        type: 'item.started',
        item: { id: 'item4', type: 'unknown' },
      })
      expect(events).toEqual([
        { type: 'tool-start', id: 'item4', name: 'unknown', arg: '' },
      ])
    })

    it('should use type as name for tool-start', () => {
      const parser = new CodexParser()
      const events = parser.parseLine({
        type: 'item.started',
        item: { id: 'item1', type: 'shell', command: 'echo hi' },
      })
      expect(events[0]).toMatchObject({ name: 'shell' })
    })

    it('should use Date.now fallback when item.id is missing', () => {
      const parser = new CodexParser()
      const before = Date.now()
      const events = parser.parseLine({
        type: 'item.started',
        item: { type: 'command', command: 'ls' },
      })
      const after = Date.now()
      expect(events).toHaveLength(1)
      const id = Number(events[0].id)
      expect(id).toBeGreaterThanOrEqual(before)
      expect(id).toBeLessThanOrEqual(after)
    })

    it('should emit tool-end for item.completed', () => {
      const parser = new CodexParser()
      const events = parser.parseLine({
        type: 'item.completed',
        item: { id: 'item1' },
      })
      expect(events).toEqual([{ type: 'tool-end', id: 'item1' }])
    })

    it('should not emit tool-start when item is missing', () => {
      const parser = new CodexParser()
      expect(parser.parseLine({ type: 'item.started' })).toEqual([])
    })

    it('should not emit tool-end when item is missing', () => {
      const parser = new CodexParser()
      expect(parser.parseLine({ type: 'item.completed' })).toEqual([])
    })
  })

  // --- error events ---

  describe('error events', () => {
    it('should emit error event with message field', () => {
      const parser = new CodexParser()
      const events = parser.parseLine({ type: 'error', message: 'connection failed' })
      expect(events).toEqual([{ type: 'error', message: 'connection failed' }])
    })

    it('should fall back to error field when message is absent', () => {
      const parser = new CodexParser()
      const events = parser.parseLine({ type: 'error', error: 'timeout' })
      expect(events).toEqual([{ type: 'error', message: 'timeout' }])
    })

    it('should emit error with empty string when both fields are absent', () => {
      const parser = new CodexParser()
      const events = parser.parseLine({ type: 'error' })
      expect(events).toEqual([{ type: 'error', message: '' }])
    })
  })

  // --- done events ---

  describe('done events', () => {
    it('should emit done event for thread.completed', () => {
      const parser = new CodexParser()
      const events = parser.parseLine({ type: 'thread.completed' })
      expect(events).toEqual([{ type: 'done', exitCode: 0 }])
    })
  })

  // --- unknown types ---

  describe('unknown types', () => {
    it('should return empty array for unknown type', () => {
      const parser = new CodexParser()
      expect(parser.parseLine({ type: 'status_update', status: 'running' })).toEqual([])
    })

    it('should return empty array when type is missing', () => {
      const parser = new CodexParser()
      expect(parser.parseLine({ foo: 'bar' })).toEqual([])
    })
  })

  // --- reset ---

  describe('reset', () => {
    it('should clear startedItems set', () => {
      const parser = new CodexParser()
      parser.parseLine({
        type: 'item.started',
        item: { id: 'item1', type: 'command', command: 'ls' },
      })
      parser.reset()
      // After reset, starting the same item id should work without issue
      const events = parser.parseLine({
        type: 'item.started',
        item: { id: 'item1', type: 'command', command: 'pwd' },
      })
      expect(events).toEqual([
        { type: 'tool-start', id: 'item1', name: 'command', arg: 'pwd' },
      ])
    })
  })
})
