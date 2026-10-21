import { describe, expect, it } from 'vitest'
import { attachWheelScrollX, resolveWheelScrollXDelta, revealStripItem } from '../../src/renderer/src/lib/wheel-scroll-x'

// 轻量 DOM 仿体：单测跑 node 环境，只补被测函数读写的字段
function fakeStrip(overrides: Partial<Record<string, number>> = {}) {
  const listeners = new Map<string, (event: unknown) => void>()
  const strip = {
    scrollLeft: 0,
    scrollWidth: 400,
    clientWidth: 100,
    clientHeight: 30,
    ...overrides,
    addEventListener: (type: string, handler: (event: unknown) => void) => { listeners.set(type, handler) },
    removeEventListener: (type: string, handler: (event: unknown) => void) => {
      if (listeners.get(type) === handler) listeners.delete(type)
    },
    querySelectorAll: () => [],
  }
  return { strip: strip as unknown as HTMLElement, listeners }
}

function wheelEvent(partial: Partial<WheelEvent> & Pick<WheelEvent, 'deltaY'>): WheelEvent & { prevented: boolean } {
  const event = {
    deltaX: 0,
    deltaMode: 0,
    ...partial,
    prevented: false,
    preventDefault: () => { (event as { prevented: boolean }).prevented = true },
  }
  return event as WheelEvent & { prevented: boolean }
}

describe('resolveWheelScrollXDelta', () => {
  it('transposes vertical mouse wheel into horizontal delta', () => {
    expect(resolveWheelScrollXDelta(wheelEvent({ deltaY: 100 }), 100)).toBe(100)
    expect(resolveWheelScrollXDelta(wheelEvent({ deltaY: -100 }), 100)).toBe(-100)
  })

  it('leaves trackpad horizontal gestures and zero deltas native', () => {
    expect(resolveWheelScrollXDelta(wheelEvent({ deltaY: 0, deltaX: 40 }), 100)).toBeNull()
    expect(resolveWheelScrollXDelta(wheelEvent({ deltaY: 10, deltaX: 40 }), 100)).toBeNull()
  })

  it('scales line and page delta modes', () => {
    expect(resolveWheelScrollXDelta(wheelEvent({ deltaY: 3, deltaMode: 1 }), 100)).toBe(48)
    expect(resolveWheelScrollXDelta(wheelEvent({ deltaY: 1, deltaMode: 2 }), 120)).toBe(120)
  })
})

describe('attachWheelScrollX', () => {
  it('maps wheel onto scrollLeft and only consumes when it scrolls', () => {
    const { strip, listeners } = fakeStrip()
    const detach = attachWheelScrollX(strip)
    expect(listeners.has('wheel')).toBe(true)

    const mid = wheelEvent({ deltaY: 50 })
    listeners.get('wheel')!(mid)
    expect(strip.scrollLeft).toBe(50)
    expect(mid.prevented).toBe(true)

    // 到右边界后放行给父级链
    const pastEnd = wheelEvent({ deltaY: 500 })
    listeners.get('wheel')!(pastEnd)
    expect(strip.scrollLeft).toBe(300)
    expect(pastEnd.prevented).toBe(true)

    const atEnd = wheelEvent({ deltaY: 50 })
    listeners.get('wheel')!(atEnd)
    expect(atEnd.prevented).toBe(false)

    detach()
    expect(listeners.has('wheel')).toBe(false)
  })

  it('ignores idle strips that cannot scroll', () => {
    const { strip, listeners } = fakeStrip({ scrollWidth: 80, clientWidth: 100 })
    attachWheelScrollX(strip)
    const event = wheelEvent({ deltaY: 50 })
    listeners.get('wheel')!(event)
    expect(event.prevented).toBe(false)
    expect(strip.scrollLeft).toBe(0)
  })
})

describe('revealStripItem', () => {
  it('scrolls the active tab into view with minimal movement', () => {
    const { strip } = fakeStrip({ scrollWidth: 600 })
    const item = {
      offsetLeft: 350,
      offsetWidth: 80,
      getAttribute: (name: string) => (name === 'data-tab-id' ? 'tab-b' : null),
    }
    ;(strip as unknown as { querySelectorAll: () => unknown[] }).querySelectorAll = () => [item]

    revealStripItem(strip, 'data-tab-id', 'tab-b')
    expect(strip.scrollLeft).toBe(332) // 350+80+2 − 100，刚好露出右缘

    revealStripItem(strip, 'data-tab-id', 'missing')
    expect(strip.scrollLeft).toBe(332)
  })

  it('keeps left-side tabs reachable without touching ancestors', () => {
    const { strip } = fakeStrip({ scrollLeft: 200 })
    const item = {
      offsetLeft: 40,
      offsetWidth: 80,
      getAttribute: (name: string) => (name === 'data-tab-id' ? 'tab-a' : null),
    }
    ;(strip as unknown as { querySelectorAll: () => unknown[] }).querySelectorAll = () => [item]

    revealStripItem(strip, 'data-tab-id', 'tab-a')
    expect(strip.scrollLeft).toBe(38) // 40 − 2
  })
})
