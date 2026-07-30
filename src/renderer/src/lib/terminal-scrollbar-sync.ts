export interface TerminalScrollbarSyncTarget {
  buffer: { active: { viewportY: number; baseY: number } }
  scrollLines: (amount: number) => void
}

/** Refresh xterm 6's DOM thumb when its viewport offset did not change. */
export function syncTerminalScrollbar(target: TerminalScrollbarSyncTarget): void {
  const { viewportY, baseY } = target.buffer.active
  if (viewportY >= baseY) return

  if (viewportY > 0) {
    safeScroll(() => target.scrollLines(-1))
    safeScroll(() => target.scrollLines(1))
  } else {
    safeScroll(() => target.scrollLines(1))
    safeScroll(() => target.scrollLines(-1))
  }
}

function safeScroll(scroll: () => void): void {
  try {
    scroll()
  } catch (error) {
    if (!(error instanceof TypeError) || !/dimensions/i.test(error.message)) throw error
  }
}
