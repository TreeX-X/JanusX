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

export interface RecoverTerminalViewportOptions extends FitTerminalViewportOptions {
  visible: boolean
  hostWidth: number
  hostHeight: number
  refresh: (start: number, end: number) => void
}

/** Recover a mounted terminal after it becomes visible or its host is resized. */
export function recoverTerminalViewportAndSync({
  visible,
  hostWidth,
  hostHeight,
  refresh,
  ...options
}: RecoverTerminalViewportOptions): FitTerminalViewportResult {
  if (!visible || hostWidth < 80 || hostHeight < 60) {
    return { geometry: null, sizeChanged: false }
  }

  const result = fitTerminalViewportAndSync(options)
  if (result.geometry) refresh(0, Math.max(0, result.geometry.rows - 1))
  return result
}

export interface TerminalRecoveryScheduler {
  schedule: (callback: () => void) => void
  cancel: () => void
}

/** Coalesce bursts into one latest recovery after two committed animation frames. */
export function createTerminalRecoveryScheduler(
  requestFrame: (callback: FrameRequestCallback) => number = globalThis.requestAnimationFrame,
  cancelFrame: (handle: number) => void = globalThis.cancelAnimationFrame,
): TerminalRecoveryScheduler {
  let firstFrame: number | null = null
  let secondFrame: number | null = null
  let pending: (() => void) | null = null

  const cancel = () => {
    if (firstFrame !== null) cancelFrame(firstFrame)
    if (secondFrame !== null) cancelFrame(secondFrame)
    firstFrame = null
    secondFrame = null
    pending = null
  }

  return {
    schedule(callback) {
      pending = callback
      if (firstFrame !== null || secondFrame !== null) return
      firstFrame = requestFrame(() => {
        firstFrame = null
        secondFrame = requestFrame(() => {
          secondFrame = null
          const latest = pending
          pending = null
          latest?.()
        })
      })
    },
    cancel,
  }
}

export function finalizeTerminalReplay(options: {
  releaseInput: () => void
  markReady: () => void
  flushLiveOutput: () => void
  scheduleRecovery: () => void
}): void {
  options.releaseInput()
  options.markReady()
  options.flushLiveOutput()
  options.scheduleRecovery()
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
