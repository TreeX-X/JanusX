import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeRecallTrace } from '../../../src/shared/knowledge'
import {
  dismissKnowledgePeek,
  EMPTY_ISLAND_KNOWLEDGE_PEEK,
  formatKnowledgeMatch,
  invalidateKnowledgePeek,
  receiveKnowledgeTrace,
  replayKnowledgePeek,
} from '../../../src/renderer/src/components/janus/islandKnowledgePeek'
import {
  getDoubleActivationAction,
  getSingleActivationAction,
  isDoubleTap,
  isDoubleTapWithinTolerance,
} from '../../../src/renderer/src/components/janus/islandInteraction'
import {
  INITIAL_ISLAND_CONTROLLER_STATE,
  reduceIslandController,
} from '../../../src/renderer/src/components/janus/islandController'

function recalledTrace(requestId: string, score = 0.8): KnowledgeRecallTrace {
  return {
    requestId,
    status: 'recalled',
    query: 'island knowledge',
    recalledCount: 2,
    eligibleCount: 3,
    truncated: false,
    maxItems: 5,
    maxChars: 3000,
    topHit: {
      id: `fact-${requestId}`,
      kind: 'fact',
      title: `Top hit ${requestId}`,
      score,
      provenance: { observationIds: [], factIds: [], fileRefs: [] },
    },
  }
}

describe('Island knowledge peek state', () => {
  afterEach(() => vi.useRealTimers())

  it('auto-presents only a new successful trace while collapsed', () => {
    const first = receiveKnowledgeTrace(EMPTY_ISLAND_KNOWLEDGE_PEEK, recalledTrace('a'), 'collapsed')
    expect(first.presentation).toBe('knowledge')
    expect(first.trace?.requestId).toBe('a')
    expect(receiveKnowledgeTrace(first, recalledTrace('a'), 'collapsed')).toBe(first)

    const empty = { ...recalledTrace('empty'), status: 'empty' as const, recalledCount: 0, topHit: undefined }
    expect(receiveKnowledgeTrace(first, empty, 'collapsed')).toBe(first)
  })

  it('stores replacement content without stealing an expanded Island', () => {
    const first = receiveKnowledgeTrace(EMPTY_ISLAND_KNOWLEDGE_PEEK, recalledTrace('a'), 'collapsed')
    const replacement = receiveKnowledgeTrace(first, recalledTrace('b'), 'expanded')
    expect(replacement.trace?.requestId).toBe('b')
    expect(replacement.presentation).toBe('hidden')
    expect(replacement.version).toBe(first.version + 1)
  })

  it('keeps a visible knowledge peek active when a new trace replaces it', () => {
    const first = receiveKnowledgeTrace(EMPTY_ISLAND_KNOWLEDGE_PEEK, recalledTrace('a'), 'collapsed')
    const replacement = receiveKnowledgeTrace(first, recalledTrace('b'), 'peek')

    expect(replacement.trace?.requestId).toBe('b')
    expect(replacement.presentation).toBe('knowledge')
    expect(replacement.version).toBe(first.version + 1)
  })

  it('guards stale timeout versions and expanded state', () => {
    vi.useFakeTimers()
    const first = receiveKnowledgeTrace(EMPTY_ISLAND_KNOWLEDGE_PEEK, recalledTrace('a'), 'collapsed')
    const replacement = receiveKnowledgeTrace(first, recalledTrace('b'), 'collapsed')
    let current = replacement

    setTimeout(() => { current = dismissKnowledgePeek(current, first.version, 'peek') }, 100)
    vi.advanceTimersByTime(100)
    expect(current.presentation).toBe('knowledge')

    expect(dismissKnowledgePeek(current, replacement.version, 'expanded')).toBe(current)
    expect(dismissKnowledgePeek(current, replacement.version, 'peek').presentation).toBe('hidden')
  })

  it('replays the latest trace and shows an honest empty state without one', () => {
    const received = receiveKnowledgeTrace(EMPTY_ISLAND_KNOWLEDGE_PEEK, recalledTrace('a'), 'expanded')
    const replayed = replayKnowledgePeek(received, 'collapsed')
    expect(replayed.presentation).toBe('knowledge')
    expect(replayKnowledgePeek(received, 'expanded')).toBe(received)

    const empty = replayKnowledgePeek(EMPTY_ISLAND_KNOWLEDGE_PEEK, 'collapsed')
    expect(empty.presentation).toBe('empty')
    expect(empty.trace).toBeNull()

    const invalidated = invalidateKnowledgePeek(replayed)
    expect(invalidated.trace).toBeNull()
    expect(invalidated.version).toBeGreaterThan(replayed.version)
    expect(replayKnowledgePeek(invalidated, 'collapsed').presentation).toBe('empty')
  })

  it('replaces a visible empty state with a new eligible trace', () => {
    const empty = replayKnowledgePeek(EMPTY_ISLAND_KNOWLEDGE_PEEK, 'collapsed')
    const received = receiveKnowledgeTrace(empty, recalledTrace('a'), 'peek')
    expect(received.presentation).toBe('knowledge')
    expect(received.trace?.requestId).toBe('a')
  })

  it('uses bounded qualitative match labels instead of percentages', () => {
    expect(formatKnowledgeMatch(0.9)).toBe('STRONG MATCH')
    expect(formatKnowledgeMatch(0.5)).toBe('GOOD MATCH')
    expect(formatKnowledgeMatch(0.1)).toBe('RELATED')
  })

  it('routes single activation only through Knowledge replay or collapse', () => {
    expect(getSingleActivationAction('collapsed')).toBe('replay-knowledge')
    expect(getSingleActivationAction('peek')).toBe('collapse')
    expect(getSingleActivationAction('expanded')).toBe('none')
  })

  it('routes double activation directly between default and expanded states', () => {
    expect(getDoubleActivationAction('collapsed')).toBe('expand')
    expect(getDoubleActivationAction('peek')).toBe('expand')
    expect(getDoubleActivationAction('expanded')).toBe('collapse')
  })

  it('accepts only taps strictly inside the double activation window', () => {
    const firstTap = 1000
    expect(isDoubleTap(0, firstTap, 260)).toBe(false)

    const secondTap = 1200
    expect(isDoubleTap(firstTap, secondTap, 260)).toBe(true)
    expect(isDoubleTap(firstTap, 1260, 260)).toBe(false)
  })

  it('accepts a forgiving double activation with small pointer jitter', () => {
    const firstPoint = { x: 100, y: 40 }
    expect(isDoubleTapWithinTolerance(1000, 1380, 420, firstPoint, { x: 112, y: 48 }, 18)).toBe(true)
    expect(isDoubleTapWithinTolerance(1000, 1420, 420, firstPoint, { x: 112, y: 48 }, 18)).toBe(false)
    expect(isDoubleTapWithinTolerance(1000, 1380, 420, firstPoint, { x: 120, y: 40 }, 18)).toBe(false)
    expect(isDoubleTapWithinTolerance(0, 1100, 420, null, firstPoint, 18)).toBe(false)
  })

  it('recognizes the second pointer-down as soon as it matches the completed first tap', () => {
    expect(isDoubleTapWithinTolerance(
      1000,
      1280,
      420,
      { x: 100, y: 40 },
      { x: 108, y: 45 },
      18,
    )).toBe(true)
  })

  it('atomically routes trace, single, double, dismiss, and timeout transitions', () => {
    const traced = reduceIslandController(INITIAL_ISLAND_CONTROLLER_STATE, {
      type: 'trace',
      trace: recalledTrace('atomic'),
    })
    expect(traced.stage).toBe('peek')
    expect(traced.knowledge.presentation).toBe('knowledge')

    const expanded = reduceIslandController(traced, { type: 'double-activate' })
    expect(expanded.stage).toBe('expanded')
    expect(expanded.knowledge.presentation).toBe('hidden')
    expect(reduceIslandController(expanded, { type: 'timeout', version: traced.knowledge.version })).toBe(expanded)

    const collapsed = reduceIslandController(expanded, { type: 'double-activate' })
    const replayed = reduceIslandController(collapsed, { type: 'single-activate' })
    expect(replayed.stage).toBe('peek')
    expect(reduceIslandController(replayed, { type: 'dismiss' }).stage).toBe('collapsed')
  })

  it('invalidates replay atomically without collapsing an expanded Island', () => {
    const traced = reduceIslandController(INITIAL_ISLAND_CONTROLLER_STATE, {
      type: 'trace',
      trace: recalledTrace('invalidate'),
    })
    const expanded = reduceIslandController(traced, { type: 'double-activate' })
    const invalidated = reduceIslandController(expanded, { type: 'invalidate' })
    expect(invalidated.stage).toBe('expanded')
    expect(invalidated.knowledge.trace).toBeNull()
    expect(reduceIslandController(invalidated, { type: 'terminal-changed' }).stage).toBe('collapsed')
  })
})
