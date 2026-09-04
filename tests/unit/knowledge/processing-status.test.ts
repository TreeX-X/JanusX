import { describe, expect, it } from 'vitest'
import { processingTone } from '../../../src/renderer/src/components/knowledge/processingStatus'
import type { KnowledgeProcessingStats } from '../../../src/shared/ipc/knowledge'

function stats(overrides: Partial<KnowledgeProcessingStats> = {}): KnowledgeProcessingStats {
  return {
    generatedAt: '2026-09-04T00:00:00.000Z',
    pendingTotal: 0,
    workspaces: [],
    failures: 0,
    lastRunAt: null,
    handlerConfigured: true,
    ...overrides,
  }
}

describe('processingTone (§6 status bar)', () => {
  it('is offline without stats', () => {
    expect(processingTone(null)).toBe('offline')
  })

  it('is idle when the pipeline is drained', () => {
    expect(processingTone(stats({ lastRunAt: '2026-09-04T00:00:00.000Z' }))).toBe('idle')
  })

  it('is working while observations are pending', () => {
    expect(processingTone(stats({ pendingTotal: 3 }))).toBe('working')
  })

  it('is attention on failures, missing handler, even when idle otherwise', () => {
    expect(processingTone(stats({ failures: 2 }))).toBe('attention')
    expect(processingTone(stats({ handlerConfigured: false }))).toBe('attention')
    expect(processingTone(stats({ pendingTotal: 5, failures: 1 }))).toBe('attention')
  })
})
