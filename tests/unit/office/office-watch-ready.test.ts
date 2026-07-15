import { PassThrough } from 'stream'
import { describe, expect, it } from 'vitest'
import {
  matchesExpectedWatchLine,
  readinessFailureCode,
  waitForOfficeWatchReady,
  type OfficeWatchReadyChild,
} from '../../../src/main/office/office-watch-ready'
import { isOfficeWatchProcessRunning, type OfficeWatchProcessState } from '../../../src/main/office/office-watch-pool'

function childWithOutput(output: string, alive = true): OfficeWatchReadyChild {
  const stdout = new PassThrough()
  stdout.end(output)
  return {
    stdout,
    exited: new Promise<void>(() => {}),
    isAlive: () => alive,
  }
}

describe('Office watch readiness', () => {
  it('accepts only the exact expected loopback Watch URL', () => {
    expect(matchesExpectedWatchLine('Watch: http://127.0.0.1:4312/', 4312)).toBe(true)
    expect(matchesExpectedWatchLine('  Watch: http://localhost:4312', 4312)).toBe(true)
    expect(matchesExpectedWatchLine('Watch: http://127.0.0.1:4313/', 4312)).toBe(false)
    expect(matchesExpectedWatchLine('Server: http://127.0.0.1:4312/', 4312)).toBe(false)
    expect(matchesExpectedWatchLine('Watch: http://0.0.0.0:4312/', 4312)).toBe(false)
    expect(matchesExpectedWatchLine('Watch: http://127.0.0.1:4312/ extra', 4312)).toBe(false)
  })

  it('requires matching output, a live child, and reachability', async () => {
    const child = childWithOutput('noise\nWatch: http://127.0.0.1:4312/\n')
    await expect(waitForOfficeWatchReady({
      child,
      port: 4312,
      deadline: Date.now() + 100,
      reach: async () => true,
    })).resolves.toBeUndefined()
  })

  it('fails closed on wrong-port output, dead child, and unreachable timeout', async () => {
    await expect(waitForOfficeWatchReady({
      child: childWithOutput('Watch: http://127.0.0.1:4313/\n'),
      port: 4312,
      deadline: Date.now() + 100,
      reach: async () => true,
    })).rejects.toSatisfy((error) => readinessFailureCode(error) === 'START_FAILED')

    await expect(waitForOfficeWatchReady({
      child: childWithOutput('Watch: http://127.0.0.1:4312/\n', false),
      port: 4312,
      deadline: Date.now() + 100,
      reach: async () => true,
    })).rejects.toSatisfy((error) => readinessFailureCode(error) === 'START_FAILED')

    await expect(waitForOfficeWatchReady({
      child: childWithOutput('Watch: http://127.0.0.1:4312/\n'),
      port: 4312,
      deadline: Date.now() + 20,
      reach: async () => false,
    })).rejects.toSatisfy((error) => readinessFailureCode(error) === 'PORT_TIMEOUT')
  })

  it('rejects termination-initiated null-exit children before and after HTTP reachability', async () => {
    const killedBeforeReach: OfficeWatchProcessState = { exitCode: null, signalCode: null, killed: true }
    let reachCalls = 0
    await expect(waitForOfficeWatchReady({
      child: {
        ...childWithOutput('Watch: http://127.0.0.1:4312/\n'),
        isAlive: () => isOfficeWatchProcessRunning(killedBeforeReach),
      },
      port: 4312,
      deadline: Date.now() + 100,
      reach: async () => { reachCalls += 1; return true },
    })).rejects.toSatisfy((error) => readinessFailureCode(error) === 'START_FAILED')
    expect(reachCalls).toBe(0)

    const killedAfterReach: OfficeWatchProcessState = { exitCode: null, signalCode: null, killed: false }
    await expect(waitForOfficeWatchReady({
      child: {
        ...childWithOutput('Watch: http://127.0.0.1:4312/\n'),
        isAlive: () => isOfficeWatchProcessRunning(killedAfterReach),
      },
      port: 4312,
      deadline: Date.now() + 100,
      reach: async () => {
        killedAfterReach.killed = true
        return true
      },
    })).rejects.toSatisfy((error) => readinessFailureCode(error) === 'START_FAILED')
  })
})
