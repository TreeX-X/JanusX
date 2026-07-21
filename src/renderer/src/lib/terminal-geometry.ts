export interface TerminalGeometry {
  cols: number
  rows: number
}

export interface WaitForTerminalGeometryOptions {
  timeoutMs?: number
  minCols?: number
  minRows?: number
}

const geometryById = new Map<string, TerminalGeometry>()
const waitersById = new Map<string, Set<(geometry: TerminalGeometry) => void>>()
const forceFitHandlers = new Map<string, () => void>()
/** Last acceptable geometry from any terminal — better create fallback than fixed 120x40. */
let lastGoodGeometry: TerminalGeometry | null = null

const DEFAULT_GEOMETRY_TIMEOUT_MS = 300
const DEFAULT_MIN_COLS = 40
const DEFAULT_MIN_ROWS = 10

function normalizeGeometry(cols: number, rows: number): TerminalGeometry | null {
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return null
  const next = { cols: Math.floor(cols), rows: Math.floor(rows) }
  if (next.cols < 1 || next.rows < 1) return null
  return next
}

function isAcceptable(
  geometry: TerminalGeometry,
  minCols: number,
  minRows: number,
): boolean {
  return geometry.cols >= minCols && geometry.rows >= minRows
}

/** Publish the latest measured terminal size from CLITerminal.fitAndSync. */
export function reportTerminalGeometry(id: string, cols: number, rows: number): void {
  const next = normalizeGeometry(cols, rows)
  if (!next) return

  geometryById.set(id, next)
  if (isAcceptable(next, DEFAULT_MIN_COLS, DEFAULT_MIN_ROWS)) {
    lastGoodGeometry = next
  }
  const waiters = waitersById.get(id)
  if (!waiters) return
  for (const resolve of waiters) resolve(next)
}

export function getTerminalGeometry(id: string): TerminalGeometry | null {
  return geometryById.get(id) ?? null
}

export function getLastGoodTerminalGeometry(): TerminalGeometry | null {
  return lastGoodGeometry
}

export function clearTerminalGeometry(id: string): void {
  geometryById.delete(id)
  waitersById.delete(id)
  forceFitHandlers.delete(id)
}

/**
 * Wait until CLITerminal reports a usable FitAddon geometry.
 * On timeout, returns latest for this id, else last good geometry from any prior terminal, else null.
 */
export function waitForTerminalGeometry(
  id: string,
  options: WaitForTerminalGeometryOptions = {},
): Promise<TerminalGeometry | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_GEOMETRY_TIMEOUT_MS
  const minCols = options.minCols ?? DEFAULT_MIN_COLS
  const minRows = options.minRows ?? DEFAULT_MIN_ROWS

  const existing = geometryById.get(id)
  if (existing && isAcceptable(existing, minCols, minRows)) {
    return Promise.resolve(existing)
  }

  return new Promise((resolve) => {
    let settled = false

    const finish = (value: TerminalGeometry | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const waiters = waitersById.get(id)
      if (waiters) {
        waiters.delete(onGeometry)
        if (waiters.size === 0) waitersById.delete(id)
      }
      resolve(value)
    }

    const onGeometry = (geometry: TerminalGeometry) => {
      if (isAcceptable(geometry, minCols, minRows)) finish(geometry)
    }

    let waiters = waitersById.get(id)
    if (!waiters) {
      waiters = new Set()
      waitersById.set(id, waiters)
    }
    waiters.add(onGeometry)

    const timer = setTimeout(() => {
      finish(geometryById.get(id) ?? lastGoodGeometry)
    }, timeoutMs)
  })
}

export function registerTerminalForceFit(id: string, handler: () => void): void {
  forceFitHandlers.set(id, handler)
}

export function unregisterTerminalForceFit(id: string): void {
  forceFitHandlers.delete(id)
}

export function requestTerminalForceFit(id: string): void {
  forceFitHandlers.get(id)?.()
}

/** Test helper — not used by production call sites. */
export function __resetTerminalGeometryForTests(): void {
  geometryById.clear()
  waitersById.clear()
  forceFitHandlers.clear()
  lastGoodGeometry = null
}
