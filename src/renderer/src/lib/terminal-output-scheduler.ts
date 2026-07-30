const DEFAULT_CHUNK_SIZE = 16 * 1024
const DEFAULT_MAX_WRITES_PER_TURN = 8
const DEFAULT_TIME_BUDGET_MS = 8
const DEFAULT_MAX_QUEUED_BYTES = 4 * 1024 * 1024
const DEFAULT_WRITE_TIMEOUT_MS = 5_000

export type TerminalOutputRecoveryReason = 'queue-overflow' | 'write-timeout'
type SchedulerTimerHandle = number | ReturnType<typeof setTimeout>

export interface TerminalOutputScheduler {
  enqueue(data: string, onDrained?: () => void): void
  dispose(): void
}

interface TerminalOutputSchedulerOptions {
  write: (data: string, onParsed: () => void) => void
  beforeWrite?: () => unknown
  afterWrite?: (snapshot: unknown) => void
  chunkSize?: number
  maxWritesPerTurn?: number
  timeBudgetMs?: number
  maxQueuedBytes?: number
  writeTimeoutMs?: number
  onRecoveryRequired?: (reason: TerminalOutputRecoveryReason) => void
  now?: () => number
  scheduleTurn?: (callback: () => void) => SchedulerTimerHandle
  cancelTurn?: (handle: SchedulerTimerHandle) => void
  scheduleWatchdog?: (callback: () => void, timeoutMs: number) => SchedulerTimerHandle
  cancelWatchdog?: (handle: SchedulerTimerHandle) => void
}

type OutputChunk = {
  data: string
  onDrained?: () => void
}

/**
 * Serializes xterm writes and yields between bounded bursts. xterm's parser is
 * asynchronous, so the next chunk is not submitted until the prior callback.
 */
export function createTerminalOutputScheduler({
  write,
  beforeWrite,
  afterWrite,
  chunkSize = DEFAULT_CHUNK_SIZE,
  maxWritesPerTurn = DEFAULT_MAX_WRITES_PER_TURN,
  timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  maxQueuedBytes = DEFAULT_MAX_QUEUED_BYTES,
  writeTimeoutMs = DEFAULT_WRITE_TIMEOUT_MS,
  onRecoveryRequired,
  now = () => performance.now(),
  scheduleTurn = (callback) => globalThis.setTimeout(callback, 0),
  cancelTurn = (handle) => globalThis.clearTimeout(handle),
  scheduleWatchdog = (callback, timeoutMs) => globalThis.setTimeout(callback, timeoutMs),
  cancelWatchdog = (handle) => globalThis.clearTimeout(handle),
}: TerminalOutputSchedulerOptions): TerminalOutputScheduler {
  const queue: OutputChunk[] = []
  let disposed = false
  let recovering = false
  let writing = false
  let queuedBytes = 0
  let activeWriteToken = 0
  let scheduledTurn: SchedulerTimerHandle | null = null
  let watchdog: SchedulerTimerHandle | null = null
  let activeChunk: OutputChunk | null = null
  let turnStartedAt = 0
  let writesThisTurn = 0

  const clearWatchdog = () => {
    if (watchdog !== null) cancelWatchdog(watchdog)
    watchdog = null
  }

  const releaseQueue = () => {
    for (const chunk of queue) chunk.onDrained?.()
    queue.length = 0
    queuedBytes = 0
  }

  const requireRecovery = (reason: TerminalOutputRecoveryReason, active?: OutputChunk) => {
    if (recovering || disposed) return
    recovering = true
    clearWatchdog()
    activeWriteToken += 1
    writing = false
    active?.onDrained?.()
    releaseQueue()
    onRecoveryRequired?.(reason)
  }

  const schedule = () => {
    if (disposed || writing || scheduledTurn !== null || queue.length === 0) return
    scheduledTurn = scheduleTurn(() => {
      scheduledTurn = null
      turnStartedAt = now()
      writesThisTurn = 0
      drain()
    })
  }

  const continueOrYield = () => {
    if (queue.length === 0) return
    if (writesThisTurn >= maxWritesPerTurn || now() - turnStartedAt >= timeBudgetMs) {
      schedule()
      return
    }
    drain()
  }

  const drain = () => {
    if (disposed || writing) return
    const next = queue.shift()
    if (!next) return
    queuedBytes -= next.data.length
    activeChunk = next

    writing = true
    const writeToken = ++activeWriteToken
    writesThisTurn += 1
    const viewport = beforeWrite?.()
    try {
      watchdog = scheduleWatchdog(() => {
        if (disposed || writeToken !== activeWriteToken) return
        requireRecovery('write-timeout', activeChunk ?? next)
      }, writeTimeoutMs)
      write(next.data, () => {
        if (writeToken !== activeWriteToken) return
        clearWatchdog()
        writing = false
        activeChunk = null
        if (disposed) return
        afterWrite?.(viewport)
        next.onDrained?.()
        continueOrYield()
      })
    } catch (error) {
      clearWatchdog()
      writing = false
      activeChunk = null
      next.onDrained?.()
      schedule()
      throw error
    }
  }

  return {
    enqueue(data, onDrained) {
      if (disposed || recovering || !data) {
        onDrained?.()
        return
      }

      if (data.length > maxQueuedBytes || queuedBytes + data.length > maxQueuedBytes) {
        onDrained?.()
        requireRecovery('queue-overflow', activeChunk ?? undefined)
        return
      }

      for (let offset = 0; offset < data.length; offset += chunkSize) {
        const isLast = offset + chunkSize >= data.length
        queue.push({
          data: data.slice(offset, offset + chunkSize),
          onDrained: isLast ? onDrained : undefined,
        })
      }
      queuedBytes += data.length

      if (!writing && scheduledTurn === null) {
        turnStartedAt = now()
        writesThisTurn = 0
        drain()
      }
    },
    dispose() {
      disposed = true
      activeWriteToken += 1
      clearWatchdog()
      queue.length = 0
      queuedBytes = 0
      if (scheduledTurn !== null) cancelTurn(scheduledTurn)
      scheduledTurn = null
    },
  }
}
