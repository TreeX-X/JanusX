import { afterEach, beforeAll, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  KNOWLEDGE_CHANNELS,
  type KnowledgeAPI,
} from '../../src/shared/ipc/knowledge'
import type {
  AuditEvent,
  CaptureObservationInput,
  Observation,
  StructuredCloneValue,
} from '../../src/shared/knowledge'
import { installElectronApiFallback } from '../../src/renderer/src/lib/electron-api-fallback'
import {
  getKnowledgeSettings,
  updateKnowledgeSettings,
} from '../../src/renderer/src/services/knowledge-settings'

const mocks = vi.hoisted(() => ({
  expose: vi.fn(),
  handle: vi.fn(),
  invoke: vi.fn(),
  getKnowledgeSettings: vi.fn(),
  updateKnowledgeSettings: vi.fn(),
}))

let knowledgeApi: KnowledgeAPI
let genericInvoke: (channel: string, ...args: unknown[]) => Promise<unknown>

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: { knowledge: KnowledgeAPI; invoke: typeof genericInvoke }) => {
      knowledgeApi = api.knowledge
      genericInvoke = api.invoke
      mocks.expose(api)
    },
  },
  ipcMain: { handle: mocks.handle },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
}))

vi.mock('../../src/main/knowledge/contract-service', () => ({ knowledgeContractService: {} }))
vi.mock('../../src/main/knowledge/audit-service', () => ({ knowledgeAuditService: {} }))
vi.mock('../../src/main/knowledge/observation-service', () => ({ knowledgeObservationService: {} }))
vi.mock('../../src/main/knowledge/extract-service', () => ({ knowledgeExtractService: {} }))
vi.mock('../../src/main/knowledge/review-service', () => ({ knowledgeReviewService: {} }))
vi.mock('../../src/main/knowledge/search-service', () => ({ knowledgeSearchService: {} }))
vi.mock('../../src/main/knowledge/truth-service', () => ({ knowledgeTruthService: {} }))
vi.mock('../../src/main/knowledge/context-service', () => ({ knowledgeContextService: {} }))
vi.mock('../../src/main/knowledge/operations-service', () => ({ knowledgeOperationsService: {} }))
vi.mock('../../src/main/config/service', () => ({
  configService: {
    getKnowledgeSettings: mocks.getKnowledgeSettings,
    updateKnowledgeSettings: mocks.updateKnowledgeSettings,
  },
}))
vi.mock('../../src/main/remote-notifications/dispatcher', () => ({ remoteNotificationDispatcher: {} }))

beforeAll(async () => {
  await import('../../src/preload/index')
  const { registerKnowledgeHandlers } = await import('../../src/main/ipc/knowledge-handlers')
  const { registerSettingsHandlers } = await import('../../src/main/ipc/settings-handlers')
  registerKnowledgeHandlers()
  registerSettingsHandlers()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Knowledge IPC contract', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.invoke.mockResolvedValue(undefined)
    mocks.getKnowledgeSettings.mockReset()
    mocks.updateKnowledgeSettings.mockReset()
  })

  it('defines and registers exactly the public channel set without maintenance exposure', () => {
    const channels = Object.values(KNOWLEDGE_CHANNELS)
    expect(channels).toHaveLength(24)
    expect(new Set(channels).size).toBe(channels.length)
    expect(mocks.handle.mock.calls.map(([channel]) => channel)).toEqual(expect.arrayContaining(channels))
    expect(channels).not.toEqual(expect.arrayContaining([
      'knowledge:observations:auto-prune',
      'knowledge:observations:archive',
      'knowledge:observations:compact',
    ]))
  })

  it('routes all typed operations with their existing argument order', async () => {
    const observation = { id: 'observation-1' } as Observation
    const captureInput = {
      workspacePath: 'C:\\work',
      source: 'manual' as const,
      type: 'user-note' as const,
      content: 'note',
    }
    const reviewInput = { type: 'fact' as const, id: 'candidate-1' }
    const feedbackInput = {
      action: 'open' as const,
      resultKind: 'fact' as const,
      workspaceId: 'workspace-1',
      outcome: 'success' as const,
    }

    await knowledgeApi.contracts()
    await knowledgeApi.bootstrap('C:\\work')
    await knowledgeApi.observe(captureInput)
    await knowledgeApi.listObservations({ scope: 'global', limit: 10 })
    await knowledgeApi.pruneObservations({ scope: 'workspace', confirm: true })
    await knowledgeApi.resolveObservationContent(observation)
    await knowledgeApi.retentionStats()
    await knowledgeApi.listAudit({ limit: 5 })
    await knowledgeApi.auditStats()
    await knowledgeApi.extract({ workspacePath: 'C:\\work' })
    await knowledgeApi.listCandidates()
    await knowledgeApi.listGraphCandidates()
    await knowledgeApi.listWikiPatchCandidates()
    await knowledgeApi.rejectCandidate(reviewInput)
    await knowledgeApi.applyCandidate(reviewInput)
    await knowledgeApi.search({ query: 'typed boundary' })
    await knowledgeApi.listTruth()
    await knowledgeApi.revokeTruth({ kind: 'fact', id: 'fact-1', workspaceId: 'workspace-1' })
    await knowledgeApi.listConflicts('workspace-1')
    await knowledgeApi.recordFeedback(feedbackInput)
    await knowledgeApi.feedbackSummary('workspace-1')
    await knowledgeApi.context({ query: 'context', workspaceId: 'workspace-1' })
    await knowledgeApi.getSettings()
    await knowledgeApi.updateSettings({ enabled: false })

    expect(mocks.invoke.mock.calls).toEqual([
      [KNOWLEDGE_CHANNELS.contracts],
      [KNOWLEDGE_CHANNELS.bootstrap, 'C:\\work'],
      [KNOWLEDGE_CHANNELS.observe, captureInput],
      [KNOWLEDGE_CHANNELS.listObservations, { scope: 'global', limit: 10 }],
      [KNOWLEDGE_CHANNELS.pruneObservations, { scope: 'workspace', confirm: true }],
      [KNOWLEDGE_CHANNELS.resolveObservationContent, observation],
      [KNOWLEDGE_CHANNELS.retentionStats],
      [KNOWLEDGE_CHANNELS.listAudit, { limit: 5 }],
      [KNOWLEDGE_CHANNELS.auditStats],
      [KNOWLEDGE_CHANNELS.extract, { workspacePath: 'C:\\work' }],
      [KNOWLEDGE_CHANNELS.listCandidates],
      [KNOWLEDGE_CHANNELS.listGraphCandidates],
      [KNOWLEDGE_CHANNELS.listWikiPatchCandidates],
      [KNOWLEDGE_CHANNELS.rejectCandidate, reviewInput],
      [KNOWLEDGE_CHANNELS.applyCandidate, reviewInput],
      [KNOWLEDGE_CHANNELS.search, { query: 'typed boundary' }],
      [KNOWLEDGE_CHANNELS.listTruth],
      [KNOWLEDGE_CHANNELS.revokeTruth, { kind: 'fact', id: 'fact-1', workspaceId: 'workspace-1' }],
      [KNOWLEDGE_CHANNELS.listConflicts, 'workspace-1'],
      [KNOWLEDGE_CHANNELS.recordFeedback, feedbackInput],
      [KNOWLEDGE_CHANNELS.feedbackSummary, 'workspace-1'],
      [KNOWLEDGE_CHANNELS.context, { query: 'context', workspaceId: 'workspace-1' }],
      [KNOWLEDGE_CHANNELS.getSettings],
      [KNOWLEDGE_CHANNELS.updateSettings, { enabled: false }],
    ])
  })

  it('rejects every migrated channel through the generic bridge', async () => {
    for (const channel of Object.values(KNOWLEDGE_CHANNELS)) {
      await expect(genericInvoke(channel)).rejects.toThrow('is not allowed')
    }
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('preserves Knowledge Settings service values, arguments, and failures', async () => {
    const expected = { enabled: false }
    const getSettings = vi.fn().mockResolvedValue(expected)
    const updateSettings = vi.fn().mockResolvedValue(expected)
    vi.stubGlobal('window', { electron: { knowledge: { getSettings, updateSettings } } })

    await expect(getKnowledgeSettings()).resolves.toBe(expected)
    await expect(updateKnowledgeSettings({ enabled: false })).resolves.toBe(expected)
    expect(updateSettings).toHaveBeenCalledWith({ enabled: false })

    const failure = new Error('settings unavailable')
    getSettings.mockRejectedValueOnce(failure)
    await expect(getKnowledgeSettings()).rejects.toBe(failure)
  })

  it('delegates Settings handler defaults, partial updates, raw returns, and failures', async () => {
    const getHandler = mocks.handle.mock.calls.find(([channel]) => channel === KNOWLEDGE_CHANNELS.getSettings)?.[1]
    const updateHandler = mocks.handle.mock.calls.find(([channel]) => channel === KNOWLEDGE_CHANNELS.updateSettings)?.[1]
    const raw = { enabled: false }
    mocks.getKnowledgeSettings.mockResolvedValue(raw)
    mocks.updateKnowledgeSettings.mockResolvedValue(raw)

    await expect(getHandler({})).resolves.toBe(raw)
    await expect(updateHandler({}, undefined)).resolves.toBe(raw)
    expect(mocks.updateKnowledgeSettings).toHaveBeenLastCalledWith({})
    await expect(updateHandler({}, { enabled: false })).resolves.toBe(raw)
    expect(mocks.updateKnowledgeSettings).toHaveBeenLastCalledWith({ enabled: false })

    const failure = new Error('config unavailable')
    mocks.getKnowledgeSettings.mockRejectedValueOnce(failure)
    mocks.updateKnowledgeSettings.mockRejectedValueOnce(failure)
    await expect(getHandler({})).rejects.toBe(failure)
    await expect(updateHandler({}, { enabled: true })).rejects.toBe(failure)
  })

  it('constrains public extensible values to structured-clone-safe data', () => {
    const metadata: StructuredCloneValue = {
      nested: ['text', 1, true, null, { optional: undefined }],
    }
    const observation: CaptureObservationInput = {
      workspacePath: 'C:\\work',
      source: 'manual',
      type: 'user-note',
      content: 'clone-safe',
      metadata: { value: metadata },
    }
    const audit: AuditEvent = {
      id: 'audit',
      action: 'capture',
      targetType: 'observation',
      targetId: 'observation',
      before: { value: metadata },
      after: { saved: true },
      provenance: {
        workspaceId: 'workspace',
        workspaceName: 'Workspace',
        workspacePath: 'C:\\work',
        source: 'manual',
        sourceObservationIds: [],
        fileRefs: [],
        actor: 'tester',
        createdAt: '2026-07-17T00:00:00.000Z',
      },
    }
    type MetadataValue = NonNullable<CaptureObservationInput['metadata']>[string]

    expect(structuredClone({ observation, audit })).toEqual({ observation, audit })
    expectTypeOf<() => void>().not.toMatchTypeOf<MetadataValue>()
    expectTypeOf<symbol>().not.toMatchTypeOf<MetadataValue>()
    expectTypeOf<Date>().not.toMatchTypeOf<MetadataValue>()
  })

  it('installs all Knowledge methods in browser fallback and rejects every call', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { platform: 'Win32' })

    installElectronApiFallback()

    const observation: Observation = {
      id: 'observation',
      workspaceId: 'workspace',
      workspaceName: 'Workspace',
      workspacePath: 'C:\\work',
      source: 'manual',
      type: 'user-note',
      content: 'content',
      fileRefs: [],
      tags: [],
      visibility: 'workspace',
      actor: 'tester',
      createdAt: '2026-07-17T00:00:00.000Z',
    }
    const api = window.electron.knowledge
    const calls: Array<() => Promise<unknown>> = [
      () => api.contracts(),
      () => api.bootstrap('C:\\work'),
      () => api.observe({ workspacePath: 'C:\\work', source: 'manual', type: 'user-note', content: 'content' }),
      () => api.listObservations({ scope: 'global' }),
      () => api.pruneObservations({ scope: 'workspace', confirm: true }),
      () => api.resolveObservationContent(observation),
      () => api.retentionStats(),
      () => api.listAudit({ limit: 1 }),
      () => api.auditStats(),
      () => api.extract({ workspacePath: 'C:\\work' }),
      () => api.listCandidates(),
      () => api.listGraphCandidates(),
      () => api.listWikiPatchCandidates(),
      () => api.rejectCandidate({ type: 'fact', id: 'candidate' }),
      () => api.applyCandidate({ type: 'fact', id: 'candidate' }),
      () => api.search({ query: 'fallback' }),
      () => api.listTruth(),
      () => api.revokeTruth({ kind: 'fact', id: 'fact', workspaceId: 'workspace' }),
      () => api.listConflicts('workspace'),
      () => api.recordFeedback({ action: 'open', resultKind: 'fact', workspaceId: 'workspace', outcome: 'error' }),
      () => api.feedbackSummary('workspace'),
      () => api.context({ query: 'fallback', workspaceId: 'workspace' }),
      () => api.getSettings(),
      () => api.updateSettings({ enabled: false }),
    ]

    expect(Object.keys(api)).toHaveLength(24)
    expect(calls).toHaveLength(24)
    for (const call of calls) {
      await expect(call()).rejects.toThrow('Electron knowledge API is unavailable')
    }
  })
})
