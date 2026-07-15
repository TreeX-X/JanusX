import { PassThrough } from 'stream'
import { resolve } from 'path'
import { describe, expect, it, vi } from 'vitest'
import {
  MAX_CONCURRENT_WATCHES,
  OfficeWatchPool,
  isOfficeWatchProcessRunning,
  stopOfficeWatchProcess,
  type OfficeWatchPoolError,
} from '../../../src/main/office/office-watch-pool'
import type { TrustedOfficeFile } from '../../../src/main/office/office-workspace-guard'
import type { OfficeWatchEvictedEvent } from '../../../src/shared/office'

class FakeChild {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly exited: Promise<void>
  stopCount = 0
  private alive = true
  private finishExit!: () => void
  private stopGate?: Promise<void>
  private releaseStop?: () => void

  constructor() {
    this.exited = new Promise<void>((resolveExit) => { this.finishExit = resolveExit })
  }

  isAlive = (): boolean => this.alive

  ready(port: number): void {
    this.stdout.write(`Watch: http://127.0.0.1:${port}/\n`)
  }

  wrongPort(port: number): void {
    this.stdout.end(`Watch: http://127.0.0.1:${port + 1}/\n`)
  }

  crash(): void {
    if (!this.alive) return
    this.alive = false
    this.stdout.end()
    this.stderr.end()
    this.finishExit()
  }

  deferStop(): void {
    this.stopGate = new Promise<void>((resolveStop) => { this.releaseStop = resolveStop })
  }

  resumeStop(): void {
    this.releaseStop?.()
  }

  stop = async (): Promise<void> => {
    if (this.alive) {
      this.stopCount += 1
      await this.stopGate
      this.crash()
    }
    await this.exited
  }
}

function trustedFile(rootName: string, relPath = 'report.docx', workspaceId = rootName): TrustedOfficeFile {
  const rootPath = resolve('C:\\workspaces', rootName)
  return { workspaceId, rootPath, relPath, filePath: resolve(rootPath, relPath) }
}

function createHarness(options: {
  autoReady?: boolean
  maxConcurrent?: number
  provider?: { installed: boolean; compatible: boolean; path?: string }
  allocatePort?: () => Promise<number>
} = {}) {
  const children: FakeChild[] = []
  const events: OfficeWatchEvictedEvent[] = []
  const roots = new Map<string, string>()
  let nextPort = 4100
  let nextLease = 0
  let spawnMode: 'ready' | 'pending' | 'wrong-port' = options.autoReady === false ? 'pending' : 'ready'
  const pool = new OfficeWatchPool(
    async (workspaceId) => roots.get(workspaceId),
    {
      resolveProvider: async () => options.provider ?? {
        installed: true,
        compatible: true,
        path: resolve('C:\\tools\\officecli.exe'),
      },
      allocatePort: options.allocatePort ?? (async () => nextPort++),
      spawn: (_binary, _filePath, port) => {
        const child = new FakeChild()
        children.push(child)
        queueMicrotask(() => {
          if (spawnMode === 'ready') child.ready(port)
          if (spawnMode === 'wrong-port') child.wrongPort(port)
        })
        return child
      },
      reach: async () => true,
      leaseId: () => `lease-${++nextLease}`,
      onEvicted: (event) => events.push(event),
      startTimeoutMs: 100,
      maxConcurrent: options.maxConcurrent ?? 32,
    },
  )
  const register = (file: TrustedOfficeFile): TrustedOfficeFile => {
    roots.set(file.workspaceId, file.rootPath)
    return file
  }
  return {
    pool,
    children,
    events,
    register,
    setSpawnMode: (mode: typeof spawnMode) => { spawnMode = mode },
  }
}

function codeOf(error: unknown): string | undefined {
  return (error as OfficeWatchPoolError | undefined)?.code
}

describe('OfficeWatchPool', () => {
  it('uses the full execa lifecycle and signals only a healthy running child before awaiting exit', async () => {
    const healthy = { exitCode: null, signalCode: null, killed: false, kill: vi.fn() }
    const killed = { exitCode: null, signalCode: null, killed: true, kill: vi.fn() }
    const signaled = { exitCode: null, signalCode: 'SIGTERM', killed: true, kill: vi.fn() }
    const exitedProcess = { exitCode: 0, signalCode: null, killed: false, kill: vi.fn() }
    expect(isOfficeWatchProcessRunning(healthy)).toBe(true)
    expect(isOfficeWatchProcessRunning(killed)).toBe(false)
    expect(isOfficeWatchProcessRunning(signaled)).toBe(false)
    expect(isOfficeWatchProcessRunning(exitedProcess)).toBe(false)

    let finishExit!: () => void
    const exited = new Promise<void>((resolveExit) => { finishExit = resolveExit })
    let stopSettled = false
    const stop = stopOfficeWatchProcess(healthy, exited).finally(() => { stopSettled = true })
    expect(healthy.kill).toHaveBeenCalledOnce()
    expect(healthy.kill).toHaveBeenCalledWith('SIGTERM')
    await Promise.resolve()
    expect(stopSettled).toBe(false)
    finishExit()
    await expect(stop).resolves.toBeUndefined()

    for (const stopped of [killed, signaled, exitedProcess]) {
      let finishStopped!: () => void
      const stoppedExit = new Promise<void>((resolveExit) => { finishStopped = resolveExit })
      let stoppedSettled = false
      const stoppedStop = stopOfficeWatchProcess(stopped, stoppedExit).finally(() => { stoppedSettled = true })
      expect(stopped.kill).not.toHaveBeenCalled()
      await Promise.resolve()
      expect(stoppedSettled).toBe(false)
      finishStopped()
      await expect(stoppedStop).resolves.toBeUndefined()
    }
    expect(exitedProcess.kill).not.toHaveBeenCalled()
  })

  it('uses the documented production cap', () => {
    expect(MAX_CONCURRENT_WATCHES).toBe(32)
  })

  it('single-flights the canonical target and mints unique leases on one port', async () => {
    const harness = createHarness()
    const file = harness.register(trustedFile('alpha'))

    const [first, second] = await Promise.all([
      harness.pool.acquire(file),
      harness.pool.acquire({ ...file, relPath: './report.docx' }),
    ])

    expect(harness.children).toHaveLength(1)
    expect(first.port).toBe(second.port)
    expect(first.previewLeaseId).not.toBe(second.previewLeaseId)
  })

  it('counts unique STARTING and READY keys and recovers capacity after stop', async () => {
    const harness = createHarness({ autoReady: false, maxConcurrent: 2 })
    const one = harness.register(trustedFile('one'))
    const two = harness.register(trustedFile('two'))
    const three = harness.register(trustedFile('three'))
    const first = harness.pool.acquire(one)
    const firstWaiter = harness.pool.acquire(one)
    const second = harness.pool.acquire(two)
    await vi.waitFor(() => expect(harness.children).toHaveLength(2))

    await expect(harness.pool.acquire(three)).rejects.toSatisfy((error) => codeOf(error) === 'TOO_MANY')
    harness.children[0].ready(4100)
    harness.children[1].ready(4101)
    const [leaseOne, leaseOneAgain, leaseTwo] = await Promise.all([first, firstWaiter, second])
    expect(leaseOne.port).toBe(leaseOneAgain.port)

    await harness.pool.release(leaseTwo.previewLeaseId)
    harness.setSpawnMode('ready')
    await expect(harness.pool.acquire(three)).resolves.toMatchObject({ relPath: 'report.docx' })
  })

  it('returns stable provider and port errors without spawning', async () => {
    const missing = createHarness({ provider: { installed: false, compatible: false } })
    await expect(missing.pool.acquire(missing.register(trustedFile('missing'))))
      .rejects.toSatisfy((error) => codeOf(error) === 'NOT_INSTALLED')
    expect(missing.children).toHaveLength(0)

    const incompatible = createHarness({ provider: { installed: true, compatible: false } })
    await expect(incompatible.pool.acquire(incompatible.register(trustedFile('incompatible'))))
      .rejects.toSatisfy((error) => codeOf(error) === 'INCOMPATIBLE')
    expect(incompatible.children).toHaveLength(0)

    const noPort = createHarness({ allocatePort: async () => { throw new Error('busy') } })
    await expect(noPort.pool.acquire(noPort.register(trustedFile('no-port'))))
      .rejects.toSatisfy((error) => codeOf(error) === 'NO_PORT')
    expect(noPort.children).toHaveLength(0)
  })

  it('cleans failed starts and permits a clean retry', async () => {
    const harness = createHarness()
    const file = harness.register(trustedFile('failure'))
    harness.setSpawnMode('wrong-port')

    await expect(harness.pool.acquire(file)).rejects.toSatisfy((error) => codeOf(error) === 'START_FAILED')
    expect(harness.children).toHaveLength(2)
    expect(harness.children.every((child) => child.stopCount === 1)).toBe(true)

    harness.setSpawnMode('ready')
    await expect(harness.pool.acquire(file)).resolves.toMatchObject({ relPath: file.relPath })
    expect(harness.children).toHaveLength(3)
  })

  it('releases leases idempotently and stops immediately after the last lease', async () => {
    const harness = createHarness()
    const file = harness.register(trustedFile('release'))
    const first = await harness.pool.acquire(file)
    const second = await harness.pool.acquire(file)

    await harness.pool.release(first.previewLeaseId)
    await harness.pool.release(first.previewLeaseId)
    expect(harness.children[0].stopCount).toBe(0)
    await harness.pool.release(second.previewLeaseId)
    expect(harness.children[0].stopCount).toBe(1)

    const replacement = await harness.pool.acquire(file)
    expect(replacement.previewLeaseId).not.toBe(second.previewLeaseId)
    expect(harness.children).toHaveLength(2)
  })

  it('evicts every lease on crash and cleanly respawns', async () => {
    const harness = createHarness()
    const file = harness.register(trustedFile('crash'))
    const first = await harness.pool.acquire(file)
    const second = await harness.pool.acquire(file)
    harness.children[0].crash()

    await vi.waitFor(() => expect(harness.events).toHaveLength(1))
    expect(harness.events[0]).toEqual({
      previewLeaseIds: [first.previewLeaseId, second.previewLeaseId],
      relPath: file.relPath,
      reason: 'crashed',
    })
    await expect(harness.pool.acquire(file)).resolves.toMatchObject({ relPath: file.relPath })
    expect(harness.children).toHaveLength(2)
  })

  it('never reuses a dead READY child before its exit callback runs', async () => {
    const harness = createHarness()
    const file = harness.register(trustedFile('immediate-crash'))
    const first = await harness.pool.acquire(file)
    const second = await harness.pool.acquire(file)
    harness.children[0].crash()

    const replacement = await harness.pool.acquire(file)

    expect(harness.children).toHaveLength(2)
    expect(replacement.port).not.toBe(first.port)
    expect(replacement.port).not.toBe(second.port)
    expect(harness.events).toEqual([{
      previewLeaseIds: [first.previewLeaseId, second.previewLeaseId],
      relPath: file.relPath,
      reason: 'crashed',
    }])
    await harness.pool.release(first.previewLeaseId)
    await harness.pool.release(second.previewLeaseId)
    expect(harness.children[1].stopCount).toBe(0)
  })

  it('reloads with a new lease and no stale process', async () => {
    const harness = createHarness()
    const file = harness.register(trustedFile('reload'))
    const original = await harness.pool.acquire(file)
    const reloaded = await harness.pool.reload(original.previewLeaseId, file)

    expect(reloaded.previewLeaseId).not.toBe(original.previewLeaseId)
    expect(harness.children[0].stopCount).toBe(1)
    expect(harness.children).toHaveLength(2)
  })

  it('lets stop supersede a deferred reload without publishing a replacement', async () => {
    const harness = createHarness()
    const file = harness.register(trustedFile('reload-stop-race'))
    const original = await harness.pool.acquire(file)
    harness.children[0].deferStop()

    const reload = harness.pool.reload(original.previewLeaseId, file)
    await vi.waitFor(() => expect(harness.children[0].stopCount).toBe(1))
    let stopSettled = false
    const stop = harness.pool.release(original.previewLeaseId, file.filePath)
      .finally(() => { stopSettled = true })
    await Promise.resolve()

    expect(stopSettled).toBe(false)
    harness.children[0].resumeStop()
    await expect(reload).rejects.toSatisfy((error) => codeOf(error) === 'START_FAILED')
    await expect(stop).resolves.toBeUndefined()
    expect(harness.children).toHaveLength(1)
    expect(harness.children[0].isAlive()).toBe(false)

    const replacement = await harness.pool.acquire(file)
    expect(replacement.previewLeaseId).not.toBe(original.previewLeaseId)
    expect(harness.children).toHaveLength(2)
  })

  it('stops only canonical targets under one workspace and stopAll reaps STARTING and READY', async () => {
    const harness = createHarness()
    const target = harness.register(trustedFile('workspace'))
    const sibling = harness.register(trustedFile('workspace-copy'))
    await harness.pool.acquire(target)
    await harness.pool.acquire(sibling)

    await harness.pool.stopUnderRoot(target.workspaceId)
    expect(harness.children[0].stopCount).toBe(1)
    expect(harness.children[1].stopCount).toBe(0)

    harness.setSpawnMode('pending')
    const pendingFile = harness.register(trustedFile('pending'))
    const pending = harness.pool.acquire(pendingFile)
    await vi.waitFor(() => expect(harness.children).toHaveLength(3))
    await harness.pool.stopAll()

    await expect(pending).rejects.toSatisfy((error) => codeOf(error) === 'START_FAILED')
    expect(harness.children[1].stopCount).toBe(1)
    expect(harness.children[2].stopCount).toBe(1)

    harness.setSpawnMode('ready')
    await expect(harness.pool.acquire(pendingFile)).resolves.toMatchObject({ relPath: pendingFile.relPath })
    expect(harness.children).toHaveLength(4)
  })
})
