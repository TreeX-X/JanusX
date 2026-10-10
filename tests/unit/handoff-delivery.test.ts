import { describe, expect, it } from 'vitest'
import {
  deliverHandoff,
  waitForComposerReady,
  type HandoffTransport,
} from '../../src/main/sessions/handoff-delivery'

const DECSET_2004 = '\x1b[?2004h'

function fakeTransport(overrides: Partial<HandoffTransport> = {}) {
  const listeners = new Set<(data: string) => void>()
  const written: string[] = []
  const transport: HandoffTransport = {
    isAlive: () => true,
    write: (data) => {
      written.push(data)
      return true
    },
    observeOutput: (handler) => {
      listeners.add(handler)
      return () => listeners.delete(handler)
    },
    ...overrides,
  }
  return {
    transport,
    written,
    emit: (data: string) => {
      for (const listener of [...listeners]) listener(data)
    },
  }
}

const instantSleep = async (): Promise<void> => {}

describe('waitForComposerReady', () => {
  it('resolves on the bracketed-paste handshake even across chunks', async () => {
    const { transport, emit } = fakeTransport()
    const ready = waitForComposerReady(transport, 5000)
    emit('booting\r\n')
    emit('\x1b[?20')
    emit('04h\r\n')
    await expect(ready).resolves.toBe(true)
  })

  it('resolves on an engine marker', async () => {
    const { transport, emit } = fakeTransport()
    const ready = waitForComposerReady(transport, 5000, {
      readyPattern: /codex>\s*$/,
    })
    emit('banner\r\ncodex> ')
    await expect(ready).resolves.toBe(true)
  })

  it('resolves true when output goes quiet, and false when nothing was ever printed', async () => {
    const quiet = fakeTransport()
    const quietReady = waitForComposerReady(quiet.transport, 5000, { quietWindowMs: 5 })
    quiet.emit('banner\r\n')
    await expect(quietReady).resolves.toBe(true)

    // Silence from a terminal that never printed is a timeout, not a composer.
    const silent = fakeTransport()
    await expect(
      waitForComposerReady(silent.transport, 20, { quietWindowMs: 5 }),
    ).resolves.toBe(false)

    // Output keeps arriving, so the quiet window never closes: the hard timer rules.
    const noisy = fakeTransport()
    const ready = waitForComposerReady(noisy.transport, 25, { quietWindowMs: 10 })
    const ticker = setInterval(() => noisy.emit('churn'), 3)
    try {
      await expect(ready).resolves.toBe(false)
    } finally {
      clearInterval(ticker)
    }
  })
})

describe('deliverHandoff', () => {
  it('reports delivered when the composer was observed and the write landed', async () => {
    const { transport, written, emit } = fakeTransport()
    const pending = deliverHandoff({
      transport,
      handoff: '继续任务「a」。',
      options: { sleep: instantSleep, readinessTimeoutMs: 5000 },
    })
    emit(DECSET_2004)
    await expect(pending).resolves.toEqual({ verdict: 'delivered' })
    expect(written[0]).toBe('\x1b[200~继续任务「a」。\x1b[201~')
    expect(written[1]).toBe('\r')
  })

  it('reports unconfirmed when the paste landed but no composer was seen', async () => {
    const { transport, written } = fakeTransport()
    const result = await deliverHandoff({
      transport,
      handoff: '继续任务「a」。',
      options: { sleep: instantSleep, readinessTimeoutMs: 5, quietWindowMs: 1 },
    })
    expect(result.verdict).toBe('unconfirmed')
    expect(result.reason).toContain('composer was never observed')
    expect(written).toHaveLength(2)
  })

  it('reports failed when the terminal never came up', async () => {
    const { transport } = fakeTransport({ isAlive: () => false })
    const result = await deliverHandoff({
      transport,
      handoff: '继续任务「a」。',
      options: { sleep: instantSleep, spawnTimeoutMs: 5 },
    })
    expect(result.verdict).toBe('failed')
    expect(result.reason).toContain('never came up')
  })

  it('reports failed when the paste is refused', async () => {
    const { transport, emit } = fakeTransport({
      write: () => false,
    })
    const pending = deliverHandoff({
      transport,
      handoff: '继续任务「a」。',
      options: { sleep: instantSleep, readinessTimeoutMs: 5000 },
    })
    emit(DECSET_2004)
    await expect(pending).resolves.toMatchObject({ verdict: 'failed' })
  })

  it('reports unconfirmed when the terminal dies between paste and submit', async () => {
    let alive = true
    const { transport, emit } = fakeTransport({
      isAlive: () => alive,
      write: (data) => {
        if (data === '\r') {
          alive = false
          return true
        }
        return true
      },
    })
    const pending = deliverHandoff({
      transport,
      handoff: '继续任务「a」。',
      options: {
        sleep: async () => {
          alive = false
        },
        readinessTimeoutMs: 5000,
      },
    })
    emit(DECSET_2004)
    await expect(pending).resolves.toMatchObject({ verdict: 'unconfirmed' })
  })

  it('refuses an empty handoff', async () => {
    const { transport, written } = fakeTransport()
    await expect(
      deliverHandoff({ transport, handoff: '   ', options: { sleep: instantSleep } }),
    ).resolves.toMatchObject({ verdict: 'failed' })
    expect(written).toHaveLength(0)
  })
})
