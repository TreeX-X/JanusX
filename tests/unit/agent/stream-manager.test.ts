import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

vi.mock('../../../src/main/agent/cli-resolver', () => ({
  resolveCLIPath: vi.fn().mockResolvedValue('/usr/bin/claude'),
}))

vi.mock('../../../src/main/agent/parsers', () => ({
  createParser: vi.fn(() => ({
    parseLine: vi.fn((json: Record<string, unknown>) => {
      // Default parser: emit a text-chunk for each line
      return [{ type: 'text-chunk', text: JSON.stringify(json) }]
    }),
    reset: vi.fn(),
  })),
}))

function createMockProcess() {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const proc = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    kill: vi.fn(),
    pid: 12345,
  })
  return proc
}

describe('AgentStreamManager', () => {
  let spawnMock: ReturnType<typeof vi.fn>
  let resolveCLIPathMock: ReturnType<typeof vi.fn>
  let createParserMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.useFakeTimers()
    const cp = await import('child_process')
    spawnMock = cp.spawn as unknown as ReturnType<typeof vi.fn>
    spawnMock.mockReset()

    const resolver = await import('../../../src/main/agent/cli-resolver')
    resolveCLIPathMock = resolver.resolveCLIPath as unknown as ReturnType<typeof vi.fn>
    resolveCLIPathMock.mockReset().mockResolvedValue('/usr/bin/claude')

    const parsers = await import('../../../src/main/agent/parsers')
    createParserMock = parsers.createParser as unknown as ReturnType<typeof vi.fn>
    createParserMock.mockReset().mockImplementation(() => ({
      parseLine: vi.fn((json: Record<string, unknown>) => {
        return [{ type: 'text-chunk', text: JSON.stringify(json) }]
      }),
      reset: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function importManager() {
    const { AgentStreamManager } = await import(
      '../../../src/main/agent/stream-manager'
    )
    return AgentStreamManager
  }

  // -------------------------------------------------------
  // 1. start() spawns process with correct args per engine
  // -------------------------------------------------------
  describe('start() spawns process with correct args', () => {
    it('claude engine uses correct args', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)
      resolveCLIPathMock.mockResolvedValue('/usr/bin/claude')

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const startPromise = manager.start({
        engine: 'claude',
        prompt: 'hello world',
        cwd: '/tmp',
      })

      // Emit close so start() resolves and session cleans up
      setTimeout(() => mockProc.emit('close', 0), 10)
      await vi.runAllTimersAsync()
      const id = await startPromise

      expect(spawnMock).toHaveBeenCalledWith(
        '/usr/bin/claude',
        [
          '-p', 'hello world',
          '--output-format', 'stream-json',
          '--include-partial-messages',
          '--verbose',
          '--no-session-persistence',
          '--permission-mode', 'acceptEdits',
        ],
        expect.objectContaining({ cwd: '/tmp' }),
      )
    })

    it('codex engine uses correct args', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)
      resolveCLIPathMock.mockResolvedValue('/usr/bin/codex')

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const startPromise = manager.start({
        engine: 'codex',
        prompt: 'test prompt',
        cwd: '/workdir',
      })

      setTimeout(() => mockProc.emit('close', 0), 10)
      await vi.runAllTimersAsync()
      await startPromise

      expect(spawnMock).toHaveBeenCalledWith(
        '/usr/bin/codex',
        [
          'exec', '--json', '--skip-git-repo-check',
          '--dangerously-bypass-approvals-and-sandbox',
          '--', 'test prompt',
        ],
        expect.objectContaining({ cwd: '/workdir' }),
      )
    })

    it('opencode engine uses correct args', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)
      resolveCLIPathMock.mockResolvedValue('/usr/bin/opencode')

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const startPromise = manager.start({
        engine: 'opencode',
        prompt: 'do something',
        cwd: '/project',
      })

      setTimeout(() => mockProc.emit('close', 0), 10)
      await vi.runAllTimersAsync()
      await startPromise

      expect(spawnMock).toHaveBeenCalledWith(
        '/usr/bin/opencode',
        [
          'run', '--format', 'json',
          '--dir', '/project',
          '--dangerously-skip-permissions',
          '--', 'do something',
        ],
        expect.objectContaining({ cwd: '/project' }),
      )
    })

    it('opencode engine includes --model when provided', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)
      resolveCLIPathMock.mockResolvedValue('/usr/bin/opencode')

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const startPromise = manager.start({
        engine: 'opencode',
        prompt: 'do something',
        cwd: '/project',
        model: 'gpt-4o',
      })

      setTimeout(() => mockProc.emit('close', 0), 10)
      await vi.runAllTimersAsync()
      await startPromise

      const args = spawnMock.mock.calls[0][1]
      expect(args).toContain('--model')
      expect(args).toContain('gpt-4o')
    })
  })

  // -------------------------------------------------------
  // 2. onEvent receives events from parsed stdout
  // -------------------------------------------------------
  describe('onEvent', () => {
    it('receives events when stdout emits JSON lines', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const receivedEvents: any[] = []

      const startPromise = manager.start({
        engine: 'claude',
        prompt: 'test',
        cwd: '/tmp',
      })

      // Register listener immediately after start
      setTimeout(() => {
        // Get the id from listSessions
        const sessions = manager.listSessions()
        if (sessions.length > 0) {
          manager.onEvent(sessions[0].id, (event) => {
            receivedEvents.push(event)
          })
        }

        // Write a JSON line to stdout
        mockProc.stdout.emit('data', Buffer.from('{"type":"test","value":42}\n'))

        // Close the process
        mockProc.emit('close', 0)
      }, 10)

      await vi.runAllTimersAsync()
      await startPromise

      expect(receivedEvents.length).toBeGreaterThan(0)
      // The mock parser wraps each JSON line as a text-chunk
      expect(receivedEvents.some((e) => e.type === 'text-chunk')).toBe(true)
      expect(receivedEvents.some((e) => e.type === 'done')).toBe(true)
    })

    it('onEvent returns an unsubscribe function', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const startPromise = manager.start({
        engine: 'claude',
        prompt: 'test',
        cwd: '/tmp',
      })

      let unsubscribe: (() => void) | null = null
      const receivedEvents: any[] = []

      setTimeout(() => {
        const sessions = manager.listSessions()
        if (sessions.length > 0) {
          unsubscribe = manager.onEvent(sessions[0].id, (event) => {
            receivedEvents.push(event)
          })
        }

        // Emit data before unsubscribe
        mockProc.stdout.emit('data', Buffer.from('{"before":"unsub"}\n'))

        // Unsubscribe
        unsubscribe?.()

        // Emit data after unsubscribe - should not be received
        mockProc.stdout.emit('data', Buffer.from('{"after":"unsub"}\n'))

        mockProc.emit('close', 0)
      }, 10)

      await vi.runAllTimersAsync()
      await startPromise

      // Should have events from before unsubscribe + done event
      // but not from after unsubscribe
      const textChunks = receivedEvents.filter((e) => e.type === 'text-chunk')
      // Only the "before" line should be captured (the after one is after unsub)
      for (const chunk of textChunks) {
        expect(chunk.text).not.toContain('after')
      }
    })
  })

  // -------------------------------------------------------
  // 3. cancel() kills the process
  // -------------------------------------------------------
  describe('cancel()', () => {
    it('kills the process with SIGTERM', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const startPromise = manager.start({
        engine: 'claude',
        prompt: 'test',
        cwd: '/tmp',
      })

      let sessionId = ''
      setTimeout(() => {
        const sessions = manager.listSessions()
        if (sessions.length > 0) {
          sessionId = sessions[0].id
          manager.cancel(sessionId)
        }
        // Emit close after cancel
        mockProc.emit('close', null)
      }, 10)

      await vi.runAllTimersAsync()
      await startPromise

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM')

      // After close, session should be cleaned up
      expect(manager.getSession(sessionId)).toBeUndefined()
    })

    it('does nothing for a non-existent session', async () => {
      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      // Should not throw
      manager.cancel('non-existent-id')
    })

    it('does nothing for an already completed session', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const startPromise = manager.start({
        engine: 'claude',
        prompt: 'test',
        cwd: '/tmp',
      })

      setTimeout(() => {
        mockProc.emit('close', 0)
      }, 10)

      await vi.runAllTimersAsync()
      const id = await startPromise

      // Session is already done and cleaned up, cancel should be a no-op
      manager.cancel(id)
      // kill was never called with SIGTERM (only close happened)
      expect(mockProc.kill).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------
  // 4. cancelAll() cancels all running sessions
  // -------------------------------------------------------
  describe('cancelAll()', () => {
    it('cancels all running sessions', async () => {
      const mockProc1 = createMockProcess()
      const mockProc2 = createMockProcess()
      spawnMock.mockReturnValueOnce(mockProc1).mockReturnValueOnce(mockProc2)

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const startPromise1 = manager.start({
        engine: 'claude',
        prompt: 'task 1',
        cwd: '/tmp',
      })
      const startPromise2 = manager.start({
        engine: 'claude',
        prompt: 'task 2',
        cwd: '/tmp',
      })

      setTimeout(() => {
        expect(manager.listSessions()).toHaveLength(2)
        manager.cancelAll()
        // Emit close for both
        mockProc1.emit('close', null)
        mockProc2.emit('close', null)
      }, 10)

      await vi.runAllTimersAsync()
      await Promise.all([startPromise1, startPromise2])

      expect(mockProc1.kill).toHaveBeenCalledWith('SIGTERM')
      expect(mockProc2.kill).toHaveBeenCalledWith('SIGTERM')
      expect(manager.listSessions()).toHaveLength(0)
    })

    it('clears the queue so queued tasks never run', async () => {
      // Fill up concurrency with 3 blocking tasks, queue a 4th, then cancelAll
      const procs = Array.from({ length: 4 }, () => createMockProcess())
      procs.forEach((p) => spawnMock.mockReturnValueOnce(p))

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager({ maxConcurrency: 3 })

      const p1 = manager.start({ engine: 'claude', prompt: '1', cwd: '/tmp' })
      const p2 = manager.start({ engine: 'claude', prompt: '2', cwd: '/tmp' })
      const p3 = manager.start({ engine: 'claude', prompt: '3', cwd: '/tmp' })
      // p4 is queued and will never resolve once the queue is cleared
      manager.start({ engine: 'claude', prompt: '4', cwd: '/tmp' })

      // Flush microtasks so p1-p3 resolve (runTask completes synchronously after spawn)
      await vi.advanceTimersByTimeAsync(0)

      setTimeout(() => {
        // 3 running, 1 queued
        expect(manager.listSessions()).toHaveLength(3)
        manager.cancelAll()
        // Only emit close for the 3 running processes
        procs[0].emit('close', null)
        procs[1].emit('close', null)
        procs[2].emit('close', null)
      }, 10)

      await vi.runAllTimersAsync()
      // Await only the 3 that were actually running
      await Promise.all([p1, p2, p3])

      // All sessions cleaned up, 4th task was never spawned
      expect(manager.listSessions()).toHaveLength(0)
      expect(spawnMock).toHaveBeenCalledTimes(3)
    })
  })

  // -------------------------------------------------------
  // 5. listSessions() returns active sessions
  // -------------------------------------------------------
  describe('listSessions()', () => {
    it('returns empty array when no sessions exist', async () => {
      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()
      expect(manager.listSessions()).toEqual([])
    })

    it('returns active sessions', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const startPromise = manager.start({
        engine: 'claude',
        prompt: 'test',
        cwd: '/tmp',
      })

      setTimeout(() => {
        const sessions = manager.listSessions()
        expect(sessions).toHaveLength(1)
        expect(sessions[0].engine).toBe('claude')
        expect(sessions[0].status).toBe('running')
        mockProc.emit('close', 0)
      }, 10)

      await vi.runAllTimersAsync()
      await startPromise
    })

    it('sessions are removed after process closes', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const startPromise = manager.start({
        engine: 'claude',
        prompt: 'test',
        cwd: '/tmp',
      })

      setTimeout(() => {
        expect(manager.listSessions()).toHaveLength(1)
        mockProc.emit('close', 0)
      }, 10)

      await vi.runAllTimersAsync()
      await startPromise

      expect(manager.listSessions()).toHaveLength(0)
    })
  })

  // -------------------------------------------------------
  // 6. resolveCLIPath failure throws error
  // -------------------------------------------------------
  describe('resolveCLIPath failure', () => {
    it('rejects when CLI path is null', async () => {
      resolveCLIPathMock.mockResolvedValue(null)

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      await expect(
        manager.start({ engine: 'claude', prompt: 'test', cwd: '/tmp' }),
      ).rejects.toThrow('CLI not found for engine: claude')
    })

    it('rejects when CLI path is empty string', async () => {
      resolveCLIPathMock.mockResolvedValue('')

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      await expect(
        manager.start({ engine: 'codex', prompt: 'test', cwd: '/tmp' }),
      ).rejects.toThrow('CLI not found for engine: codex')
    })
  })

  // -------------------------------------------------------
  // 7. Concurrency queue
  // -------------------------------------------------------
  describe('concurrency queue', () => {
    it('runs up to maxConcurrency tasks simultaneously', async () => {
      const procs = Array.from({ length: 3 }, () => createMockProcess())
      procs.forEach((p) => spawnMock.mockReturnValueOnce(p))

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager({ maxConcurrency: 3 })

      const promises = [
        manager.start({ engine: 'claude', prompt: '1', cwd: '/tmp' }),
        manager.start({ engine: 'claude', prompt: '2', cwd: '/tmp' }),
        manager.start({ engine: 'claude', prompt: '3', cwd: '/tmp' }),
      ]

      setTimeout(() => {
        // All 3 should be running
        expect(manager.listSessions()).toHaveLength(3)
        procs.forEach((p) => p.emit('close', 0))
      }, 10)

      await vi.runAllTimersAsync()
      await Promise.all(promises)

      // spawn should have been called 3 times immediately
      expect(spawnMock).toHaveBeenCalledTimes(3)
    })

    it('queues the 4th task when maxConcurrency=3', async () => {
      const procs = Array.from({ length: 4 }, () => createMockProcess())
      procs.forEach((p) => spawnMock.mockReturnValueOnce(p))

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager({ maxConcurrency: 3 })

      const results: string[] = []
      const promises = [
        manager.start({ engine: 'claude', prompt: '1', cwd: '/tmp' }).then((id) => {
          results.push(id)
          return id
        }),
        manager.start({ engine: 'claude', prompt: '2', cwd: '/tmp' }).then((id) => {
          results.push(id)
          return id
        }),
        manager.start({ engine: 'claude', prompt: '3', cwd: '/tmp' }).then((id) => {
          results.push(id)
          return id
        }),
        manager.start({ engine: 'claude', prompt: '4', cwd: '/tmp' }).then((id) => {
          results.push(id)
          return id
        }),
      ]

      // After the first tick, only 3 should be spawned (4th is queued)
      // Advance timers to let the microtask queue settle
      await vi.advanceTimersByTimeAsync(0)
      expect(spawnMock).toHaveBeenCalledTimes(3)
      expect(manager.listSessions()).toHaveLength(3)

      // Now close the first 3 processes -- this drains the queue and starts the 4th
      setTimeout(() => {
        procs[0].emit('close', 0)
        procs[1].emit('close', 0)
        procs[2].emit('close', 0)
      }, 10)

      await vi.advanceTimersByTimeAsync(20)

      // The 4th should now have been spawned
      expect(spawnMock).toHaveBeenCalledTimes(4)

      // Close the 4th process
      setTimeout(() => {
        procs[3].emit('close', 0)
      }, 10)

      await vi.runAllTimersAsync()
      await Promise.all(promises)

      // All 4 tasks completed
      expect(results).toHaveLength(4)
      expect(manager.listSessions()).toHaveLength(0)
    })

    it('queue drains sequentially as slots free up', async () => {
      const procs = Array.from({ length: 5 }, () => createMockProcess())
      procs.forEach((p) => spawnMock.mockReturnValueOnce(p))

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager({ maxConcurrency: 2 })

      const promises = Array.from({ length: 5 }, (_, i) =>
        manager.start({ engine: 'claude', prompt: `${i}`, cwd: '/tmp' }),
      )

      // After initial tick: 2 running, 3 queued
      await vi.advanceTimersByTimeAsync(0)
      expect(spawnMock).toHaveBeenCalledTimes(2)
      expect(manager.listSessions()).toHaveLength(2)

      // Free one slot -> one queued task starts
      setTimeout(() => procs[0].emit('close', 0), 10)
      await vi.advanceTimersByTimeAsync(20)
      expect(spawnMock).toHaveBeenCalledTimes(3)

      // Free another -> another queued task starts
      setTimeout(() => procs[1].emit('close', 0), 10)
      await vi.advanceTimersByTimeAsync(20)
      expect(spawnMock).toHaveBeenCalledTimes(4)

      // Free another -> last queued task starts
      setTimeout(() => procs[2].emit('close', 0), 10)
      await vi.advanceTimersByTimeAsync(20)
      expect(spawnMock).toHaveBeenCalledTimes(5)

      // Close remaining
      setTimeout(() => {
        procs[3].emit('close', 0)
        procs[4].emit('close', 0)
      }, 10)

      await vi.runAllTimersAsync()
      await Promise.all(promises)

      expect(manager.listSessions()).toHaveLength(0)
    })
  })

  // -------------------------------------------------------
  // Additional: getSession()
  // -------------------------------------------------------
  describe('getSession()', () => {
    it('returns undefined for non-existent session', async () => {
      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()
      expect(manager.getSession('nope')).toBeUndefined()
    })

    it('returns the session while running', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const startPromise = manager.start({
        engine: 'claude',
        prompt: 'test',
        cwd: '/tmp',
      })

      setTimeout(() => {
        const sessions = manager.listSessions()
        const session = manager.getSession(sessions[0].id)
        expect(session).toBeDefined()
        expect(session!.engine).toBe('claude')
        expect(session!.status).toBe('running')
        mockProc.emit('close', 0)
      }, 10)

      await vi.runAllTimersAsync()
      await startPromise
    })
  })

  // -------------------------------------------------------
  // Additional: stderr capture
  // -------------------------------------------------------
  describe('stderr handling', () => {
    it('does not crash when stderr emits data', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const startPromise = manager.start({
        engine: 'claude',
        prompt: 'test',
        cwd: '/tmp',
      })

      setTimeout(() => {
        mockProc.stderr.emit('data', Buffer.from('some warning\n'))
        mockProc.stderr.emit('data', Buffer.from('another warning\n'))
        mockProc.emit('close', 0)
      }, 10)

      await vi.runAllTimersAsync()
      await startPromise

      // Should complete without error
      expect(manager.listSessions()).toHaveLength(0)
    })
  })

  // -------------------------------------------------------
  // Additional: malformed stdout lines are skipped
  // -------------------------------------------------------
  describe('malformed stdout', () => {
    it('skips non-JSON lines without crashing', async () => {
      const mockProc = createMockProcess()
      spawnMock.mockReturnValue(mockProc)

      const AgentStreamManager = await importManager()
      const manager = new AgentStreamManager()

      const receivedEvents: any[] = []

      const startPromise = manager.start({
        engine: 'claude',
        prompt: 'test',
        cwd: '/tmp',
      })

      setTimeout(() => {
        const sessions = manager.listSessions()
        if (sessions.length > 0) {
          manager.onEvent(sessions[0].id, (event) => {
            receivedEvents.push(event)
          })
        }

        // Mix valid and invalid lines
        mockProc.stdout.emit('data', Buffer.from('not json at all\n'))
        mockProc.stdout.emit('data', Buffer.from('{"valid":true}\n'))
        mockProc.stdout.emit('data', Buffer.from('   \n'))
        mockProc.stdout.emit('data', Buffer.from('{"also_valid":true}\n'))

        mockProc.emit('close', 0)
      }, 10)

      await vi.runAllTimersAsync()
      await startPromise

      // Should have events from valid lines + done event
      const textChunks = receivedEvents.filter((e) => e.type === 'text-chunk')
      expect(textChunks).toHaveLength(2) // Only the two valid JSON lines
      expect(receivedEvents.some((e) => e.type === 'done')).toBe(true)
    })
  })
})
