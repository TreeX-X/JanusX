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
import { defaultKnowledgeAutomation } from '../../src/shared/knowledge-automation'
import { normalizeKnowledgeSettings } from '../../src/shared/knowledge-settings'
import * as localEnvironment from '../../src/main/knowledge/knowledge-local-environment'
import { configureKnowledgeLocalModel, disableKnowledgeLocalModel, startKnowledgeLocalResources, updateKnowledgeSettingsFromRenderer } from '../../src/main/knowledge/knowledge-local-settings'
import { knowledgeLocalResources } from '../../src/main/knowledge/knowledge-local-resources'
import { getJevKey } from '../../src/main/knowledge/knowledge-credentials'
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
  knowledgeEnabled: true,
  auditPage: vi.fn(),
}))

let knowledgeApi: KnowledgeAPI

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: { knowledge: KnowledgeAPI }) => {
      knowledgeApi = api.knowledge
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

vi.mock('../../src/main/knowledge/laya-runtime', () => ({ controlLaya: vi.fn(), syncLayaSettings: vi.fn(async () => {}) }))
vi.mock('../../src/main/knowledge/automation-service', () => ({ knowledgeAutomationService: { stop: vi.fn() } }))
vi.mock('../../src/main/knowledge/knowledge-models', () => ({ stopKnowledgeLocalModel: vi.fn() }))
vi.mock('../../src/main/knowledge/knowledge-credentials', () => ({ getJevKey: vi.fn(), setJevKey: vi.fn() }))
vi.mock('../../src/main/knowledge/contract-service', () => ({ knowledgeContractService: {} }))
vi.mock('../../src/main/knowledge/audit-service', () => ({ knowledgeAuditService: { page: mocks.auditPage } }))
vi.mock('../../src/main/knowledge/observation-service', () => ({ knowledgeObservationService: {} }))
vi.mock('../../src/main/knowledge/extract-service', () => ({ knowledgeExtractService: {} }))
vi.mock('../../src/main/knowledge/review-service', () => ({ knowledgeReviewService: {} }))
vi.mock('../../src/main/knowledge/search-service', () => ({ knowledgeSearchService: {} }))
vi.mock('../../src/main/knowledge/truth-service', () => ({ knowledgeTruthService: {} }))
vi.mock('../../src/main/knowledge/context-service', () => ({ knowledgeContextService: {} }))
vi.mock('../../src/main/knowledge/operations-service', () => ({ knowledgeOperationsService: {} }))
vi.mock('../../src/main/knowledge/diagnostics-service', () => ({ knowledgeDiagnosticsService: {} }))
vi.mock('../../src/main/knowledge/processing-queue', () => ({ knowledgeProcessingQueue: {} }))
vi.mock('../../src/main/config/service', () => ({
  configService: {
    getKnowledgeSettings: mocks.getKnowledgeSettings,
    getExperimentalFeatures: async () => ({ knowledge: mocks.knowledgeEnabled }),
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
  it('forwards the audit page query and preserves its event snapshots and cursor', async () => {
    const query = { domain: 'engineering', workspaceId: 'project', cursor: 'opaque', limit: 30 }
    const result = { items: [{ id: 'audit-event', before: { content: 'old' }, after: { content: 'new' } }], total: 35, nextCursor: 'next', byAction: {}, workspaces: [] }
    mocks.auditPage.mockResolvedValueOnce(result)
    const handler = mocks.handle.mock.calls.find(([channel]) => channel === KNOWLEDGE_CHANNELS.auditPage)![1]
    expect(await handler({}, query)).toBe(result)
    expect(mocks.auditPage).toHaveBeenCalledWith(query)
  })
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.invoke.mockResolvedValue(undefined)
    mocks.getKnowledgeSettings.mockReset()
    mocks.updateKnowledgeSettings.mockReset()
    mocks.knowledgeEnabled = true
  })

  it('defines and registers exactly the public channel set without maintenance exposure', () => {
    const channels = Object.values(KNOWLEDGE_CHANNELS)
    // Phase 5: `knowledge:extract` direct IPC removed (queue-owned LLM stage).
    // Post-Phase 5: +2 external-MCP registration channels (status/register).
    // User memory M4: +1 workspace-free glance channel (user-memory:overview).
    // R3 note wiki: +4 note-wiki channels (pages/prepare/propose/statuses).
    expect(channels).toHaveLength(63)
    expect(new Set(channels).size).toBe(channels.length)
    expect(mocks.handle.mock.calls.map(([channel]) => channel)).toEqual(expect.arrayContaining(channels))
    expect(channels).not.toEqual(expect.arrayContaining([
      'knowledge:observations:auto-prune',
      'knowledge:observations:archive',
      'knowledge:observations:compact',
    ]))
  })

  it('reveals credentials through an explicit gated call while status returns only configuration', async () => {
    await knowledgeApi.revealJevCredential()
    expect(mocks.invoke).toHaveBeenCalledWith(KNOWLEDGE_CHANNELS.jevCredentialReveal)
    const handler = (channel: string) => mocks.handle.mock.calls.find(([name]) => name === channel)![1]
    vi.mocked(getJevKey).mockReset().mockResolvedValue('test-secret')
    expect(await handler(KNOWLEDGE_CHANNELS.jevCredentialStatus)()).toEqual({ configured: true })
    expect(await handler(KNOWLEDGE_CHANNELS.jevCredentialReveal)()).toBe('test-secret')
    vi.mocked(getJevKey).mockClear()
    mocks.knowledgeEnabled = false
    await expect(handler(KNOWLEDGE_CHANNELS.jevCredentialReveal)()).rejects.toThrow('knowledge-disabled')
    expect(getJevKey).not.toHaveBeenCalled()
  })

  it('routes all typed operations with their existing argument order', async () => {
    const observation = { id: 'observation-1' } as Observation
    const captureInput = {
      workspacePath: 'C:\\work',
      source: 'manual' as const,
      type: 'user-note' as const,
      content: 'note',
    }
    const reviewInput = { type: 'fact' as const, id: 'candidate-1', candidateHash: 'a'.repeat(64) }
    const feedbackInput = {
      action: 'open' as const,
      resultKind: 'fact' as const,
      workspaceId: 'workspace-1',
      outcome: 'success' as const,
    }

    await knowledgeApi.noteWikiPages({ rootPath: 'C:\\work', uri: 'note://repo/a' })
    await knowledgeApi.prepareNoteWiki({ rootPath: 'C:\\work', uris: ['note://repo/a'], pageSlug: 'a', reviewMode: 'incremental', expectedVersion: 1 })
    await knowledgeApi.proposeNoteWiki({ draftId: 'draft-1', title: 't', markdown: 'm', rationale: 'r' })
    await knowledgeApi.noteWikiStatuses({ workspaceId: 'workspace-1' })
    await knowledgeApi.contracts()
    await knowledgeApi.bootstrap('C:\\work')
    await knowledgeApi.observe(captureInput)
    await knowledgeApi.listObservations({ scope: 'global', limit: 10 })
    await knowledgeApi.pruneObservations({ scope: 'workspace', confirm: true })
    await knowledgeApi.autoPruneObservations(123)
    await knowledgeApi.resolveObservationContent(observation)
    await knowledgeApi.retentionStats()
    await knowledgeApi.listAudit({ limit: 5 })
    await knowledgeApi.auditPage({ domain: 'engineering', limit: 30, cursor: 'cursor' })
    await knowledgeApi.auditStats()
    await knowledgeApi.auditStats({ domain: 'engineering', workspaceId: 'workspace-1' })
    await knowledgeApi.listCandidates()
    await knowledgeApi.listGraphCandidates()
    await knowledgeApi.listWikiPatchCandidates()
    await knowledgeApi.rejectCandidate(reviewInput)
    await knowledgeApi.applyCandidate(reviewInput)
    await knowledgeApi.factReviewContext(reviewInput)
    await knowledgeApi.search({ query: 'typed boundary' })
    await knowledgeApi.listTruth()
    await knowledgeApi.revokeTruth({ kind: 'fact', id: 'fact-1', workspaceId: 'workspace-1' })
    await knowledgeApi.listConflicts('workspace-1')
    await knowledgeApi.recordFeedback(feedbackInput)
    await knowledgeApi.feedbackSummary('workspace-1')
    await knowledgeApi.context({ query: 'context', workspaceId: 'workspace-1' })
    await knowledgeApi.diagnostics({ workspaceId: 'workspace-1', recentLimit: 5 })
    await knowledgeApi.processNow({ workspaceId: 'workspace-1' })
    await knowledgeApi.processingStats()
    await knowledgeApi.probeExternalMcp()
    await knowledgeApi.externalMcpStatus()
    await knowledgeApi.registerExternalMcp('claude-code')
    await knowledgeApi.userMemoryOverview()
    await knowledgeApi.personalProfileEditContext()
    await knowledgeApi.savePersonalProfile({ expectedHash: 'a'.repeat(64), overrides: { identity: 'Tree' } })
    await knowledgeApi.importLegacyPersonalMemory()
    await knowledgeApi.migrateLegacyEpisodes({ expectedHash: 'b'.repeat(64) })
    await knowledgeApi.layaControl('status')
    await knowledgeApi.candidateAction({candidateId: 'c', candidateHash: 'a'.repeat(64), action: 'score'})
    await knowledgeApi.forgetPersonalMemory({ targetId: 'old', targetHash: 'hash', kind: 'episode' })
    await knowledgeApi.proposePersonalMemoryCorrection({ targetId: 'old', targetHash: 'hash', content: 'new' })
    await knowledgeApi.getSettings()
    await knowledgeApi.updateSettings({ enabled: false })

    expect(mocks.invoke.mock.calls).toEqual([
      [KNOWLEDGE_CHANNELS.noteWikiPages, { rootPath: 'C:\\work', uri: 'note://repo/a' }],
      [KNOWLEDGE_CHANNELS.prepareNoteWiki, { rootPath: 'C:\\work', uris: ['note://repo/a'], pageSlug: 'a', reviewMode: 'incremental', expectedVersion: 1 }],
      [KNOWLEDGE_CHANNELS.proposeNoteWiki, { draftId: 'draft-1', title: 't', markdown: 'm', rationale: 'r' }],
      [KNOWLEDGE_CHANNELS.noteWikiStatuses, { workspaceId: 'workspace-1' }],
      [KNOWLEDGE_CHANNELS.contracts],
      [KNOWLEDGE_CHANNELS.bootstrap, 'C:\\work'],
      [KNOWLEDGE_CHANNELS.observe, captureInput],
      [KNOWLEDGE_CHANNELS.listObservations, { scope: 'global', limit: 10 }],
      [KNOWLEDGE_CHANNELS.pruneObservations, { scope: 'workspace', confirm: true }],
      [KNOWLEDGE_CHANNELS.autoPruneObservations, 123],
      [KNOWLEDGE_CHANNELS.resolveObservationContent, observation],
      [KNOWLEDGE_CHANNELS.retentionStats],
      [KNOWLEDGE_CHANNELS.listAudit, { limit: 5 }],
      [KNOWLEDGE_CHANNELS.auditPage, { domain: 'engineering', limit: 30, cursor: 'cursor' }],
      [KNOWLEDGE_CHANNELS.auditStats],
      [KNOWLEDGE_CHANNELS.auditStats, { domain: 'engineering', workspaceId: 'workspace-1' }],
      [KNOWLEDGE_CHANNELS.listCandidates],
      [KNOWLEDGE_CHANNELS.listGraphCandidates],
      [KNOWLEDGE_CHANNELS.listWikiPatchCandidates],
      [KNOWLEDGE_CHANNELS.rejectCandidate, reviewInput],
      [KNOWLEDGE_CHANNELS.applyCandidate, reviewInput],
      [KNOWLEDGE_CHANNELS.factReviewContext, reviewInput],
      [KNOWLEDGE_CHANNELS.search, { query: 'typed boundary' }],
      [KNOWLEDGE_CHANNELS.listTruth],
      [KNOWLEDGE_CHANNELS.revokeTruth, { kind: 'fact', id: 'fact-1', workspaceId: 'workspace-1' }],
      [KNOWLEDGE_CHANNELS.listConflicts, 'workspace-1'],
      [KNOWLEDGE_CHANNELS.recordFeedback, feedbackInput],
      [KNOWLEDGE_CHANNELS.feedbackSummary, 'workspace-1'],
      [KNOWLEDGE_CHANNELS.context, { query: 'context', workspaceId: 'workspace-1' }],
      [KNOWLEDGE_CHANNELS.diagnostics, { workspaceId: 'workspace-1', recentLimit: 5 }],
      [KNOWLEDGE_CHANNELS.processNow, { workspaceId: 'workspace-1' }],
      [KNOWLEDGE_CHANNELS.processingStats],
      [KNOWLEDGE_CHANNELS.probeExternalMcp],
      [KNOWLEDGE_CHANNELS.externalMcpStatus],
      [KNOWLEDGE_CHANNELS.registerExternalMcp, 'claude-code'],
      [KNOWLEDGE_CHANNELS.userMemoryOverview],
      [KNOWLEDGE_CHANNELS.personalProfileEditContext],
      [KNOWLEDGE_CHANNELS.savePersonalProfile, { expectedHash: 'a'.repeat(64), overrides: { identity: 'Tree' } }],
      [KNOWLEDGE_CHANNELS.importLegacyPersonalMemory],
      [KNOWLEDGE_CHANNELS.migrateLegacyEpisodes, { expectedHash: 'b'.repeat(64) }],
      [KNOWLEDGE_CHANNELS.layaControl, 'status'],
      [KNOWLEDGE_CHANNELS.candidateAction, {candidateId: 'c', candidateHash: 'a'.repeat(64), action: 'score'}],
      [KNOWLEDGE_CHANNELS.forgetPersonalMemory, { targetId: 'old', targetHash: 'hash', kind: 'episode' }],
      [KNOWLEDGE_CHANNELS.proposePersonalMemoryCorrection, { targetId: 'old', targetHash: 'hash', content: 'new' }],
      [KNOWLEDGE_CHANNELS.getSettings],
      [KNOWLEDGE_CHANNELS.updateSettings, { enabled: false }],
    ])
  })

  it('binds source withdrawal to the workspace and reviewed source snapshot', async () => {
    const target = { id: 'source', workspaceId: 'workspace' }
    await knowledgeApi.observationRevocationContext(target)
    await knowledgeApi.revokeObservation({ ...target, sourceHash: 'a'.repeat(64) })
    await knowledgeApi.observationRevocations({ offset: 20, limit: 20 })
    expect(mocks.invoke.mock.calls).toEqual([
      [KNOWLEDGE_CHANNELS.observationRevocationContext, target],
      [KNOWLEDGE_CHANNELS.revokeObservation, { ...target, sourceHash: 'a'.repeat(64) }],
      [KNOWLEDGE_CHANNELS.observationRevocations, { offset: 20, limit: 20 }],
    ])
  })

  it('does not expose a generic bridge', () => {
    expect(mocks.expose.mock.calls[0]?.[0]).not.toHaveProperty('invoke')
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
    expect(mocks.updateKnowledgeSettings).toHaveBeenLastCalledWith({ automation: undefined })
    await expect(updateHandler({}, { enabled: false })).resolves.toBe(raw)
    expect(mocks.updateKnowledgeSettings).toHaveBeenLastCalledWith({ enabled: false, automation: undefined })

    const failure = new Error('config unavailable')
    mocks.getKnowledgeSettings.mockRejectedValueOnce(failure)
    mocks.updateKnowledgeSettings.mockRejectedValueOnce(failure)
    await expect(getHandler({})).rejects.toBe(failure)
    await expect(updateHandler({}, { enabled: true })).rejects.toBe(failure)
  })

  it('persists opt-in only after host checks and prevents stale Save or detection from reversing disable', async () => {
    let stored = normalizeKnowledgeSettings({ automation: defaultKnowledgeAutomation() })
    mocks.getKnowledgeSettings.mockImplementation(async () => structuredClone(stored))
    mocks.updateKnowledgeSettings.mockImplementation(async partial => { stored = normalizeKnowledgeSettings({ ...stored, ...partial }); return structuredClone(stored) })
    const local = { ...defaultKnowledgeAutomation().local, enabled: true }
    const report = { ok: true, mode: 'gpu' as const, availableMemoryMiB: 16000, modelContextTokens: 262144,
      recommendedContextTokens: 65536, selectedContextTokens: 65536, supportedContextTokens: [32768, 65536] }
    const detect = vi.spyOn(localEnvironment, 'detectLocalEnvironment').mockResolvedValue({ ...report, ok: false, reason: 'local-memory-insufficient' })
    expect((await configureKnowledgeLocalModel(local)).report.ok).toBe(false)
    expect(stored.automation!.local.enabled).toBe(false)
    detect.mockResolvedValue(report)
    expect((await configureKnowledgeLocalModel(local)).settings.automation!.local.enabled).toBe(true)
    const stale = structuredClone(stored)
    stale.automation!.stages.entryReview.provider = 'local'
    await disableKnowledgeLocalModel()
    await updateKnowledgeSettingsFromRenderer(stale)
    expect(stored.automation!.local.enabled).toBe(false)
    expect(stored.automation!.stages.entryReview.provider).toBe('off')
    let finish!: (value: typeof report) => void
    detect.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = configureKnowledgeLocalModel(local)
    const rejected = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await disableKnowledgeLocalModel()
    finish(report)
    await rejected
    expect(stored.automation!.local.enabled).toBe(false)
    // Cancellation also wins if the host is still reading settings before detection begins.
    const beforeRead = configureKnowledgeLocalModel(local)
    const cancelled = expect(beforeRead).rejects.toThrow()
    await disableKnowledgeLocalModel()
    await cancelled
    expect(stored.automation!.local.enabled).toBe(false)
    detect.mockRestore()
  })

  it('routes resource operations and cancels pending setup before it can start a download', async () => {
    await knowledgeApi.installLocalResources()
    expect(mocks.invoke).toHaveBeenLastCalledWith(KNOWLEDGE_CHANNELS.localResourcesInstall)
    await knowledgeApi.localResourcesStatus()
    expect(mocks.invoke).toHaveBeenLastCalledWith(KNOWLEDGE_CHANNELS.localResourcesStatus)
    mocks.getKnowledgeSettings.mockResolvedValue(normalizeKnowledgeSettings({ automation: defaultKnowledgeAutomation() }))
    const start = vi.spyOn(knowledgeLocalResources, 'start')
    const cancel = vi.spyOn(knowledgeLocalResources, 'cancel')
    try {
      const pending = startKnowledgeLocalResources()
      const rejected = expect(pending).rejects.toThrow()
      await disableKnowledgeLocalModel()
      await rejected
      expect(start).not.toHaveBeenCalled()
      expect(cancel).toHaveBeenCalledOnce()
      mocks.getKnowledgeSettings.mockResolvedValue({ automation: { ...defaultKnowledgeAutomation(), local: { ...defaultKnowledgeAutomation().local, enabled: true } } })
      await expect(startKnowledgeLocalResources()).rejects.toThrow('local-model-already-enabled')
      expect(start).not.toHaveBeenCalled()
    } finally { start.mockRestore(); cancel.mockRestore() }
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
      retentionClass: 'evidence',
      contentHash: 'a'.repeat(64),
      dedupeKey: 'b'.repeat(64),
      contentLength: 7,
      compactionStatus: 'active',
    }
    const api = window.electron.knowledge
    const calls: Array<() => Promise<unknown>> = [
      () => api.automationStatus(),
      () => api.automationRun({ backfill: false }),
      () => api.automationRetry('task'),
      () => api.setJevCredential(''),
      () => api.jevCredentialStatus(),
      () => api.revealJevCredential(),
      () => api.stopLocalModel(),
      () => api.installLocalResources(),
      () => api.localResourcesStatus(),
      () => api.configureLocalModel({ enabled: true, endpoint: '', modelPath: '', serverPath: '', contextTokens: 0 }),
      () => api.wikiHistory({ workspaceId: 'w', slug: 'a' }),
      () => api.wikiRevision({ workspaceId: 'w', slug: 'a', version: 1 }),
      () => api.pinWikiRevision({ workspaceId: 'w', slug: 'a', version: 1, contentHash: 'a'.repeat(64), pinned: true }),
      () => api.noteWikiPages({ rootPath: 'C:\\work', uri: 'note://repo/a' }),
      () => api.prepareNoteWiki({ rootPath: 'C:\\work', uris: ['note://repo/a'], pageSlug: 'a', reviewMode: 'incremental', expectedVersion: 1 }),
      () => api.proposeNoteWiki({ draftId: 'draft-1', title: 't', markdown: 'm', rationale: 'r' }),
      () => api.noteWikiStatuses({ workspaceId: 'workspace' }),
      () => api.contracts(),
      () => api.bootstrap('C:\\work'),
      () => api.observe({ workspacePath: 'C:\\work', source: 'manual', type: 'user-note', content: 'content' }),
      () => api.listObservations({ scope: 'global' }),
      () => api.pruneObservations({ scope: 'workspace', confirm: true }),
      () => api.autoPruneObservations(),
      () => api.resolveObservationContent(observation),
      () => api.retentionStats(),
      () => api.listAudit({ limit: 1 }),
      () => api.auditPage({ domain: 'engineering' }),
      () => api.auditStats(),
      () => api.listCandidates(),
      () => api.listGraphCandidates(),
      () => api.listWikiPatchCandidates(),
      () => api.rejectCandidate({ type: 'fact', id: 'candidate', candidateHash: 'a'.repeat(64) }),
      () => api.applyCandidate({ type: 'fact', id: 'candidate', candidateHash: 'a'.repeat(64) }),
      () => api.factReviewContext({ type: 'fact', id: 'candidate', candidateHash: 'a'.repeat(64) }),
      () => api.search({ query: 'fallback' }),
      () => api.listTruth(),
      () => api.revokeTruth({ kind: 'fact', id: 'fact', workspaceId: 'workspace' }),
      () => api.listConflicts('workspace'),
      () => api.recordFeedback({ action: 'open', resultKind: 'fact', workspaceId: 'workspace', outcome: 'error' }),
      () => api.feedbackSummary('workspace'),
      () => api.context({ query: 'fallback', workspaceId: 'workspace' }),
      () => api.diagnostics(),
      () => api.processNow({ workspaceId: 'workspace' }),
      () => api.processingStats(),
      () => api.probeExternalMcp(),
      () => api.externalMcpStatus(),
      () => api.registerExternalMcp('claude-code'),
      () => api.userMemoryOverview(),
      () => api.importLegacyPersonalMemory(),
      () => api.layaControl('status'),
      () => api.candidateAction({candidateId: 'c', candidateHash: 'a'.repeat(64), action: 'score'}),
      () => api.forgetPersonalMemory({ targetId: 'old', targetHash: 'hash', kind: 'episode' }),
      () => api.proposePersonalMemoryCorrection({ targetId: 'old', targetHash: 'hash', content: 'new' }),
      () => api.getSettings(),
      () => api.updateSettings({ enabled: false }),
    ]

    calls.push(() => api.observationRevocationContext({ id: 'source', workspaceId: 'ws' }))
    calls.push(() => api.revokeObservation({ id: 'source', workspaceId: 'ws', sourceHash: 'a'.repeat(64) }))
    calls.push(() => api.observationRevocations({}))
    calls.push(() => api.personalProfileEditContext())
    calls.push(() => api.savePersonalProfile({ expectedHash: 'a'.repeat(64), overrides: {} }))
    calls.push(() => api.migrateLegacyEpisodes())
    calls.push(() => api.getPersonalSettings(), () => api.updatePersonalSettings({ useInChat: false }))
    expect(Object.keys(api)).toHaveLength(63)
    expect(calls).toHaveLength(63)
    for (const call of calls) {
      await expect(call()).rejects.toThrow('Electron knowledge API is unavailable')
    }
  })
})
