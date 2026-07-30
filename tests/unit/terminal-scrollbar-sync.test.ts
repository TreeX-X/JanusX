import { describe, expect, it, vi } from 'vitest'
import { syncTerminalScrollbar } from '../../src/renderer/src/lib/terminal-scrollbar-sync'

describe('terminal scrollbar sync', () => {
  it('jiggles a pinned viewport without changing its final line', () => {
    const scrollLines = vi.fn()
    syncTerminalScrollbar({ buffer: { active: { viewportY: 42, baseY: 100 } }, scrollLines })
    expect(scrollLines.mock.calls).toEqual([[-1], [1]])
  })

  it('jiggles forward from the top and does nothing at the bottom', () => {
    const topScroll = vi.fn()
    syncTerminalScrollbar({ buffer: { active: { viewportY: 0, baseY: 100 } }, scrollLines: topScroll })
    expect(topScroll.mock.calls).toEqual([[1], [-1]])

    const bottomScroll = vi.fn()
    syncTerminalScrollbar({ buffer: { active: { viewportY: 100, baseY: 100 } }, scrollLines: bottomScroll })
    expect(bottomScroll).not.toHaveBeenCalled()
  })

  it('ignores xterm teardown dimension errors only', () => {
    expect(() => syncTerminalScrollbar({
      buffer: { active: { viewportY: 1, baseY: 2 } },
      scrollLines: () => { throw new TypeError('Cannot read dimensions') },
    })).not.toThrow()
    expect(() => syncTerminalScrollbar({
      buffer: { active: { viewportY: 1, baseY: 2 } },
      scrollLines: () => { throw new Error('unexpected') },
    })).toThrow('unexpected')
  })
})
