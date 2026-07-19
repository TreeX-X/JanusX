export interface TerminalGeometrySize {
  cols: number
  rows: number
}

interface TerminalBufferState {
  type: 'normal' | 'alternate'
  viewportY: number
  baseY: number
}

export interface TerminalViewportController {
  buffer: { active: TerminalBufferState }
  cols: number
  rows: number
  scrollToBottom: () => void
  scrollToLine: (line: number) => void
}

export interface TerminalViewportSnapshot {
  bufferType: 'normal' | 'alternate'
  wasAtBottom: boolean
  topLine: number
}

export function captureTerminalViewport(
  terminal: TerminalViewportController,
): TerminalViewportSnapshot {
  const active = terminal.buffer.active
  return {
    bufferType: active.type,
    wasAtBottom: active.viewportY >= active.baseY,
    topLine: active.viewportY,
  }
}

export function restoreTerminalViewport(
  terminal: TerminalViewportController,
  snapshot: TerminalViewportSnapshot,
): void {
  const active = terminal.buffer.active
  if (snapshot.bufferType !== 'normal' || active.type !== 'normal') return

  if (snapshot.wasAtBottom) {
    terminal.scrollToBottom()
    return
  }

  terminal.scrollToLine(Math.max(0, Math.min(snapshot.topLine, active.baseY)))
}

export function hasTerminalGeometryChanged(
  previous: TerminalGeometrySize | null,
  next: TerminalGeometrySize,
): boolean {
  return previous === null || previous.cols !== next.cols || previous.rows !== next.rows
}

export interface FitTerminalViewportOptions {
  terminal: TerminalViewportController
  fit: () => void
  previousGeometry: TerminalGeometrySize | null
  reportGeometry: (cols: number, rows: number) => void
  resizePty: (cols: number, rows: number) => void
}

export interface FitTerminalViewportResult {
  geometry: TerminalGeometrySize | null
  sizeChanged: boolean
}

export function fitTerminalViewportAndSync({
  terminal,
  fit,
  previousGeometry,
  reportGeometry,
  resizePty,
}: FitTerminalViewportOptions): FitTerminalViewportResult {
  const viewport = captureTerminalViewport(terminal)
  fit()
  restoreTerminalViewport(terminal, viewport)

  const geometry = { cols: terminal.cols, rows: terminal.rows }
  if (geometry.cols < 2 || geometry.rows < 1) {
    return { geometry: null, sizeChanged: false }
  }

  reportGeometry(geometry.cols, geometry.rows)
  const sizeChanged = hasTerminalGeometryChanged(previousGeometry, geometry)
  if (sizeChanged) resizePty(geometry.cols, geometry.rows)

  return { geometry, sizeChanged }
}

export interface LatestTimeoutScheduler {
  schedule: (key: string, delayMs: number, callback: () => void) => void
  clear: () => void
}

export function createLatestTimeoutScheduler(): LatestTimeoutScheduler {
  const timers = new Map<string, ReturnType<typeof globalThis.setTimeout>>()

  return {
    schedule(key, delayMs, callback) {
      const pending = timers.get(key)
      if (pending !== undefined) globalThis.clearTimeout(pending)

      const timer = globalThis.setTimeout(() => {
        timers.delete(key)
        callback()
      }, delayMs)
      timers.set(key, timer)
    },
    clear() {
      for (const timer of timers.values()) globalThis.clearTimeout(timer)
      timers.clear()
    },
  }
}
