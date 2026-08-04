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
  it.each([
    ['Watch: http://127.0.0.1:4312/', 4312, true],
    ['  Watch: http://localhost:4312', 4312, true],
    ['Watch: http://127.0.0.1:4313/', 4312, false],
    ['Server: http://127.0.0.1:4312/', 4312, false],
    ['Watch: http://0.0.0.0:4312/', 4312, false],
    ['Watch: http://127.0.0.1:4312/ extra', 4312, false],
  ] as const)('matchesExpectedWatchLine(%j, %i) -> %s', (line, port, expected) => {
    expect(matchesExpectedWatchLine(line, port)).toBe(expected)
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

  it.each([
    {
      name: 'wrong-port output',
      setup: () => ({ child: childWithOutput('Watch: http://127.0.0.1:4313/\n'), deadline: Date.now() + 100, reach: async () => true }),
      expectedCode: 'START_FAILED',
    },
    {
      name: 'dead child',
      setup: () => ({ child: childWithOutput('Watch: http://127.0.0.1:4312/\n', false), deadline: Date.now() + 100, reach: async () => true }),
      expectedCode: 'START_FAILED',
    },
    {
      name: 'unreachable timeout',
      setup: () => ({ child: childWithOutput('Watch: http://127.0.0.1:4312/\n'), deadline: Date.now() + 20, reach: async () => false }),
      expectedCode: 'PORT_TIMEOUT',
    },
  ])('fails closed on $name', async ({ setup, expectedCode }) => {
    const { child, deadline, reach } = setup()
    await expect(waitForOfficeWatchReady({
      child,
      port: 4312,
      deadline,
      reach,
    })).rejects.toSatisfy((error) => readinessFailureCode(error) === expectedCode)
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
