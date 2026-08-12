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
  shouldPresentOfficeNotice,
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
    expect(formatKnowledgeMatch(0.9)).toBe('janus:island.knowledge.matchStrong')
    expect(formatKnowledgeMatch(0.5)).toBe('janus:island.knowledge.matchGood')
    expect(formatKnowledgeMatch(0.1)).toBe('janus:island.knowledge.matchRelated')
  })

  it.each([
    ['single', getSingleActivationAction, 'collapsed', 'replay-knowledge'],
    ['single', getSingleActivationAction, 'peek', 'collapse'],
    ['single', getSingleActivationAction, 'expanded', 'none'],
    ['double', getDoubleActivationAction, 'collapsed', 'expand'],
    ['double', getDoubleActivationAction, 'peek', 'expand'],
    ['double', getDoubleActivationAction, 'expanded', 'collapse'],
  ] as const)('routes %s activation for state %s', (_label, fn, state, expected) => {
    expect(fn(state)).toBe(expected)
  })

  it.each([
    [0, 1000, 260, false],
    [1000, 1200, 260, true],
    [1000, 1260, 260, false],
  ] as const)('isDoubleTap(%i, %i, %i) -> %s', (firstTap, secondTap, window, expected) => {
    expect(isDoubleTap(firstTap, secondTap, window)).toBe(expected)
  })

  it.each([
    [1000, 1380, 420, { x: 100, y: 40 }, { x: 112, y: 48 }, 18, true],
    [1000, 1420, 420, { x: 100, y: 40 }, { x: 112, y: 48 }, 18, false],
    [1000, 1380, 420, { x: 100, y: 40 }, { x: 120, y: 40 }, 18, false],
    [0, 1100, 420, null, { x: 100, y: 40 }, 18, false],
    [1000, 1280, 420, { x: 100, y: 40 }, { x: 108, y: 45 }, 18, true],
  ] as const)('isDoubleTapWithinTolerance accepts forgiving and jitter cases', (firstTap, secondTap, window, firstPoint, secondPoint, tolerance, expected) => {
    expect(isDoubleTapWithinTolerance(firstTap, secondTap, window, firstPoint, secondPoint, tolerance)).toBe(expected)
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

  it('presents and consumes Office notices without stealing an expanded Island', () => {
    const peek = reduceIslandController(INITIAL_ISLAND_CONTROLLER_STATE, { type: 'office-notice' })
    expect(peek.stage).toBe('peek')
    expect(reduceIslandController(peek, { type: 'office-consume' }).stage).toBe('collapsed')

    const expanded = reduceIslandController(INITIAL_ISLAND_CONTROLLER_STATE, { type: 'double-activate' })
    expect(reduceIslandController(expanded, { type: 'office-notice' })).toBe(expanded)
  })

  it('re-presents a pending Office notice after expanded state collapses', () => {
    const expanded = reduceIslandController(INITIAL_ISLAND_CONTROLLER_STATE, { type: 'double-activate' })
    const pending = reduceIslandController(expanded, { type: 'office-notice' })
    const collapsed = reduceIslandController(pending, { type: 'terminal-changed' })
    expect(collapsed.stage).toBe('collapsed')
    expect(reduceIslandController(collapsed, { type: 'office-notice' }).stage).toBe('peek')

    const consumed = reduceIslandController(
      reduceIslandController(INITIAL_ISLAND_CONTROLLER_STATE, { type: 'office-notice' }),
      { type: 'office-consume' },
    )
    expect(consumed.stage).toBe('collapsed')
    expect(shouldPresentOfficeNotice('collapsed', 'workspace', 'workspace')).toBe(true)
    expect(shouldPresentOfficeNotice('expanded', 'workspace', 'workspace')).toBe(false)
    expect(shouldPresentOfficeNotice('collapsed', null, 'workspace')).toBe(false)
  })
})
