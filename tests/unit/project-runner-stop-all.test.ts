import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import ProjectRunner from '../../src/main/project/runner/runner'

function makeFakeProcess(): EventEmitter & {
  kill: ReturnType<typeof vi.fn>
  killed: boolean
} {
  const proc = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>
    killed: boolean
  }
  proc.killed = false
  proc.kill = vi.fn((signal?: string) => {
    if (signal === 'SIGKILL' || signal === 'SIGTERM') {
      proc.killed = true
      // simulate async exit
      setTimeout(() => proc.emit('exit', 0), 0)
    }
    return true
  })
  return proc
}

describe('ProjectRunner.stopAll', () => {
  it('stops all running projects best-effort', async () => {
    const runner = new ProjectRunner(5)
    const internal = runner as unknown as {
      runningProjects: Map<string, {
        process: ReturnType<typeof makeFakeProcess>
        terminated: boolean
        pid: number
        config: { type: string; name: string }
        startTime: Date
        port: number | null
        output: string[]
        outputBuffer: string
        eventEmitter: EventEmitter
      }>
      activeCount: number
    }

    const a = makeFakeProcess()
    const b = makeFakeProcess()
    internal.runningProjects.set('p1', {
      process: a,
      terminated: false,
      pid: 1,
      config: { type: 'node', name: 'a' },
      startTime: new Date(),
      port: null,
      output: [],
      outputBuffer: '',
      eventEmitter: new EventEmitter(),
    })
    internal.runningProjects.set('p2', {
      process: b,
      terminated: false,
      pid: 2,
      config: { type: 'node', name: 'b' },
      startTime: new Date(),
      port: null,
      output: [],
      outputBuffer: '',
      eventEmitter: new EventEmitter(),
    })
    internal.activeCount = 2

    await runner.stopAll(100)

    expect(a.kill).toHaveBeenCalled()
    expect(b.kill).toHaveBeenCalled()
  })

  it('no-ops when nothing is running', async () => {
    const runner = new ProjectRunner(5)
    await expect(runner.stopAll()).resolves.toBeUndefined()
  })
})
