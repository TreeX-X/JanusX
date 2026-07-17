import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyKnowledgeCandidate,
  getKnowledgeContext,
  getKnowledgeFeedbackSummary,
  listKnowledgeConflicts,
  loadKnowledgeWorkbenchSnapshot,
  recordKnowledgeFeedback,
  rejectKnowledgeCandidate,
  revokeKnowledgeTruth,
  searchKnowledge,
} from '../../../src/renderer/src/services/knowledge'

function makeKnowledgeApi() {
  return {
    listObservations: vi.fn().mockResolvedValue([{ id: 'observation-marker' }]),
    listCandidates: vi.fn().mockResolvedValue([]),
    listWikiPatchCandidates: vi.fn().mockResolvedValue([]),
    listGraphCandidates: vi.fn().mockResolvedValue([]),
    listAudit: vi.fn().mockResolvedValue([{ id: 'audit-marker' }]),
    retentionStats: vi.fn().mockResolvedValue({ noise: 0, operational: 0, evidence: 0, derived: 0, total: 0 }),
    listTruth: vi.fn().mockResolvedValue({
      facts: [{
        id: 'fact-marker', content: 'Accepted truth', concepts: [], files: [], tags: [], confidence: 1, version: 1, status: 'active',
        provenance: { workspaceId: 'ws', workspaceName: 'Workspace', workspacePath: 'C:/work', source: 'manual', sourceObservationIds: [], fileRefs: [], actor: 'tester', createdAt: '2026-07-12T00:00:00.000Z' },
      }],
      wikiPages: [],
      graphEdges: [],
    }),
    listConflicts: vi.fn().mockResolvedValue([]),
  }
}

describe('loadKnowledgeWorkbenchSnapshot', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not substitute demo records for an empty runtime store', async () => {
    const knowledge = {
      listObservations: vi.fn().mockResolvedValue([]),
      listCandidates: vi.fn().mockResolvedValue([]),
      listWikiPatchCandidates: vi.fn().mockResolvedValue([]),
      listGraphCandidates: vi.fn().mockResolvedValue([]),
      listAudit: vi.fn().mockResolvedValue([]),
      retentionStats: vi.fn().mockResolvedValue(null),
      listTruth: vi.fn().mockResolvedValue({ facts: [], wikiPages: [], graphEdges: [] }),
      listConflicts: vi.fn().mockResolvedValue([]),
    }
    vi.stubGlobal('window', { electron: { knowledge } })

    const snapshot = await loadKnowledgeWorkbenchSnapshot()

    expect(snapshot.usingDemoData).toBe(false)
    expect(snapshot.observations).toEqual([])
    expect(snapshot.factCandidates).toEqual([])
    expect(snapshot.libraryCards).toEqual([])
  })

  it('maps accepted truth records into Library cards', async () => {
    const knowledge = {
      listObservations: vi.fn().mockResolvedValue([]),
      listCandidates: vi.fn().mockResolvedValue([]),
      listWikiPatchCandidates: vi.fn().mockResolvedValue([]),
      listGraphCandidates: vi.fn().mockResolvedValue([]),
      listAudit: vi.fn().mockResolvedValue([]),
      retentionStats: vi.fn().mockResolvedValue({ noise: 0, operational: 0, evidence: 0, derived: 0, total: 0 }),
      listTruth: vi.fn().mockResolvedValue({
          facts: [{
            id: 'fact-1', content: 'Accepted truth', concepts: ['truth'], files: [], tags: ['accepted'], confidence: 0.9, version: 1, status: 'active',
            provenance: { workspaceId: 'ws-1', workspaceName: 'Workspace', workspacePath: 'C:/work', source: 'manual', sourceObservationIds: ['obs-1'], fileRefs: ['src/a.ts'], actor: 'tester', createdAt: '2026-07-12T00:00:00.000Z' },
          }],
          wikiPages: [],
          graphEdges: [],
      }),
      listConflicts: vi.fn().mockResolvedValue([]),
    }
    vi.stubGlobal('window', { electron: { knowledge } })

    const snapshot = await loadKnowledgeWorkbenchSnapshot()

    expect(snapshot.libraryCards).toEqual([
      expect.objectContaining({ id: 'fact-1', kind: 'fact', status: 'active' }),
    ])
    expect(knowledge.listTruth).toHaveBeenCalledWith()
  })

  it('isolates every parallel workbench read failure', async () => {
    const cases = [
      { method: 'listObservations', field: 'observations', fallback: [] },
      { method: 'listCandidates', field: 'factCandidates', fallback: [] },
      { method: 'listWikiPatchCandidates', field: 'wikiPatches', fallback: [] },
      { method: 'listGraphCandidates', field: 'graphCandidates', fallback: [] },
      { method: 'listAudit', field: 'auditEvents', fallback: [] },
      { method: 'retentionStats', field: 'retentionStats', fallback: null },
      { method: 'listTruth', field: 'libraryCards', fallback: [] },
    ] as const

    for (const { method, field, fallback } of cases) {
      const knowledge = makeKnowledgeApi()
      knowledge[method].mockRejectedValueOnce(new Error(`${method} unavailable`))
      vi.stubGlobal('window', { electron: { knowledge } })

      const snapshot = await loadKnowledgeWorkbenchSnapshot()

      expect(snapshot[field]).toEqual(fallback)
      if (method === 'listObservations') {
        expect(snapshot.auditEvents).toEqual([{ id: 'audit-marker' }])
      } else {
        expect(snapshot.observations).toEqual([{ id: 'observation-marker' }])
      }
    }
  })

  it('isolates conflict failures by workspace', async () => {
    const knowledge = makeKnowledgeApi()
    knowledge.listCandidates.mockResolvedValue([
      { fact: { provenance: { workspaceId: 'workspace-a' } } },
      { fact: { provenance: { workspaceId: 'workspace-b' } } },
    ])
    knowledge.listConflicts.mockImplementation(async (workspaceId: string) => {
      if (workspaceId === 'workspace-a') throw new Error('workspace-a unavailable')
      return [{ id: 'conflict-b', workspaceId }]
    })
    vi.stubGlobal('window', { electron: { knowledge } })

    const snapshot = await loadKnowledgeWorkbenchSnapshot()

    expect(knowledge.listConflicts).toHaveBeenCalledWith('workspace-a')
    expect(knowledge.listConflicts).toHaveBeenCalledWith('workspace-b')
    expect(snapshot.conflicts).toEqual([{ id: 'conflict-b', workspaceId: 'workspace-b' }])
  })

  it('propagates direct wrapper rejections unchanged', async () => {
    const failure = new Error('knowledge operation failed')
    const cases = [
      ['search', () => searchKnowledge({ query: 'query' })],
      ['context', () => getKnowledgeContext({ query: 'query' })],
      ['rejectCandidate', () => rejectKnowledgeCandidate({ type: 'fact', id: 'candidate' })],
      ['applyCandidate', () => applyKnowledgeCandidate({ type: 'fact', id: 'candidate' })],
      ['revokeTruth', () => revokeKnowledgeTruth({ kind: 'fact', id: 'fact', workspaceId: 'workspace' })],
      ['listConflicts', () => listKnowledgeConflicts('workspace')],
      ['recordFeedback', () => recordKnowledgeFeedback({ action: 'open', resultKind: 'fact', workspaceId: 'workspace', outcome: 'error' })],
      ['feedbackSummary', () => getKnowledgeFeedbackSummary('workspace')],
    ] as const

    for (const [method, invoke] of cases) {
      vi.stubGlobal('window', {
        electron: { knowledge: { [method]: vi.fn().mockRejectedValue(failure) } },
      })
      await expect(invoke()).rejects.toBe(failure)
    }
  })
})
