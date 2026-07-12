import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadKnowledgeWorkbenchSnapshot } from '../../../src/renderer/src/services/knowledge'

describe('loadKnowledgeWorkbenchSnapshot', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not substitute demo records for an empty runtime store', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'knowledge:retention:stats') return null
      if (channel === 'knowledge:truth:list') return { facts: [], wikiPages: [], graphEdges: [] }
      return []
    })
    vi.stubGlobal('window', { electron: { invoke } })

    const snapshot = await loadKnowledgeWorkbenchSnapshot()

    expect(snapshot.usingDemoData).toBe(false)
    expect(snapshot.observations).toEqual([])
    expect(snapshot.factCandidates).toEqual([])
    expect(snapshot.libraryCards).toEqual([])
  })

  it('maps accepted truth records into Library cards', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'knowledge:retention:stats') return { noise: 0, operational: 0, evidence: 0, derived: 0, total: 0 }
      if (channel === 'knowledge:truth:list') {
        return {
          facts: [{
            id: 'fact-1', content: 'Accepted truth', concepts: ['truth'], files: [], tags: ['accepted'], confidence: 0.9, version: 1, status: 'active',
            provenance: { workspaceId: 'ws-1', workspaceName: 'Workspace', workspacePath: 'C:/work', source: 'manual', sourceObservationIds: ['obs-1'], fileRefs: ['src/a.ts'], actor: 'tester', createdAt: '2026-07-12T00:00:00.000Z' },
          }],
          wikiPages: [],
          graphEdges: [],
        }
      }
      return []
    })
    vi.stubGlobal('window', { electron: { invoke } })

    const snapshot = await loadKnowledgeWorkbenchSnapshot()

    expect(snapshot.libraryCards).toEqual([
      expect.objectContaining({ id: 'fact-1', kind: 'fact', status: 'active' }),
    ])
    expect(invoke).toHaveBeenCalledWith('knowledge:truth:list')
  })
})
