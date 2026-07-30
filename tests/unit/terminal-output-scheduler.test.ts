import { describe, expect, it, vi } from 'vitest'
import { createTerminalOutputScheduler } from '../../src/renderer/src/lib/terminal-output-scheduler'

describe('terminal output scheduler', () => {
  it('splits long output and waits for each xterm parse callback', () => {
    const writes: Array<{ data: string; parsed: () => void }> = []
    const done = vi.fn()
    const scheduler = createTerminalOutputScheduler({
      write: (data, parsed) => writes.push({ data, parsed }),
      chunkSize: 4,
    })

    scheduler.enqueue('abcdefghij', done)
    expect(writes.map(({ data }) => data)).toEqual(['abcd'])

    writes[0].parsed()
    expect(writes.map(({ data }) => data)).toEqual(['abcd', 'efgh'])
    writes[1].parsed()
    expect(writes.map(({ data }) => data)).toEqual(['abcd', 'efgh', 'ij'])
    expect(done).not.toHaveBeenCalled()

    writes[2].parsed()
    expect(done).toHaveBeenCalledOnce()
  })

  it('yields after the configured burst before writing more output', () => {
    const turns: Array<() => void> = []
    const writes: Array<() => void> = []
    const scheduler = createTerminalOutputScheduler({
      write: (_data, parsed) => writes.push(parsed),
      chunkSize: 1,
      maxWritesPerTurn: 2,
      scheduleTurn: (callback) => { turns.push(callback); return turns.length },
      cancelTurn: vi.fn(),
      now: () => 0,
    })

    scheduler.enqueue('abcd')
    writes[0]()
    writes[1]()

    expect(writes).toHaveLength(2)
    expect(turns).toHaveLength(1)
    turns[0]()
    expect(writes).toHaveLength(3)
  })

  it('restores the captured viewport after parsing each chunk', () => {
    const parsed: Array<() => void> = []
    const afterWrite = vi.fn()
    const scheduler = createTerminalOutputScheduler({
      write: (_data, callback) => parsed.push(callback),
      beforeWrite: () => ({ topLine: 42, revision: 3 }),
      afterWrite,
    })

    scheduler.enqueue('output')
    parsed[0]()

    expect(afterWrite).toHaveBeenCalledWith({ topLine: 42, revision: 3 })
  })

  it('drops queued work after disposal', () => {
    const parsed: Array<() => void> = []
    const done = vi.fn()
    const scheduler = createTerminalOutputScheduler({
      write: (_data, callback) => parsed.push(callback),
      chunkSize: 1,
    })

    scheduler.enqueue('ab', done)
    scheduler.dispose()
    parsed[0]()

    expect(parsed).toHaveLength(1)
    expect(done).not.toHaveBeenCalled()
  })

  it('requests replay recovery before the queued output can grow without bound', () => {
    const parsed: Array<() => void> = []
    const recovery = vi.fn()
    const dropped = vi.fn()
    const scheduler = createTerminalOutputScheduler({
      write: (_data, callback) => parsed.push(callback),
      chunkSize: 2,
      maxQueuedBytes: 4,
      onRecoveryRequired: recovery,
    })

    scheduler.enqueue('abcd')
    scheduler.enqueue('efghi', dropped)

    expect(recovery).toHaveBeenCalledWith('queue-overflow')
    expect(dropped).toHaveBeenCalledOnce()
    parsed[0]()
    expect(parsed).toHaveLength(1)
  })

  it('requests replay recovery when xterm never acknowledges a write', () => {
    const watchdogs: Array<() => void> = []
    const recovery = vi.fn()
    const done = vi.fn()
    createTerminalOutputScheduler({
      write: vi.fn(),
      writeTimeoutMs: 10,
      scheduleWatchdog: (callback) => { watchdogs.push(callback); return watchdogs.length },
      cancelWatchdog: vi.fn(),
      onRecoveryRequired: recovery,
    }).enqueue('stalled', done)

    watchdogs[0]()

    expect(recovery).toHaveBeenCalledWith('write-timeout')
    expect(done).toHaveBeenCalledOnce()
  })
})
