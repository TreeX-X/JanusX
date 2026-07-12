import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { handle, search } = vi.hoisted(() => ({
  handle: vi.fn(),
  search: vi.fn(),
}))

vi.mock('electron', () => ({ ipcMain: { handle } }))
vi.mock('../../../src/main/knowledge/context-service', () => ({
  knowledgeContextService: { search },
}))
vi.mock('../../../src/main/knowledge/contract-service', () => ({ knowledgeContractService: {} }))
vi.mock('../../../src/main/knowledge/audit-service', () => ({ knowledgeAuditService: {} }))
vi.mock('../../../src/main/knowledge/observation-service', () => ({ knowledgeObservationService: {} }))
vi.mock('../../../src/main/knowledge/extract-service', () => ({ knowledgeExtractService: {} }))
vi.mock('../../../src/main/knowledge/review-service', () => ({ knowledgeReviewService: {} }))
vi.mock('../../../src/main/knowledge/search-service', () => ({ knowledgeSearchService: {} }))
vi.mock('../../../src/main/knowledge/truth-service', () => ({ knowledgeTruthService: {} }))

import { registerKnowledgeHandlers } from '../../../src/main/ipc/knowledge-handlers'
import { getKnowledgeContext } from '../../../src/renderer/src/services/knowledge'

describe('knowledge context IPC adapter', () => {
  beforeEach(() => {
    handle.mockReset()
    search.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the Context Service result unchanged', async () => {
    const expected = { items: [], compactContext: '', truncated: false, eligibleCount: 0, maxItems: 8, maxChars: 4000 }
    search.mockResolvedValue(expected)
    registerKnowledgeHandlers()
    const registration = handle.mock.calls.find(([channel]) => channel === 'knowledge:context')
    const request = { query: 'context', workspaceId: 'workspace-a' }

    await expect(registration?.[1]({}, request)).resolves.toBe(expected)
    expect(search).toHaveBeenCalledWith(request)
  })

  it('exposes one typed renderer invocation without transforming the request', async () => {
    const expected = { items: [], compactContext: '', truncated: false, eligibleCount: 0, maxItems: 8, maxChars: 4000 }
    const invoke = vi.fn(async () => expected)
    vi.stubGlobal('window', { electron: { invoke } })
    const request = { query: 'context', workspaceId: 'workspace-a', maxItems: 2 }

    await expect(getKnowledgeContext(request)).resolves.toBe(expected)
    expect(invoke).toHaveBeenCalledWith('knowledge:context', request)
  })
})
