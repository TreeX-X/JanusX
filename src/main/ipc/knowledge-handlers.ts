import { controlLaya } from '../knowledge/laya-runtime'
import { listWikiHistory, readWikiRevision, pinWikiRevision } from '../knowledge/wiki-history'
import { knowledgeAutomationService } from '../knowledge/automation-service'
import { getJevKey, setJevKey } from '../knowledge/knowledge-credentials'
import { configureKnowledgeLocalModel, disableKnowledgeLocalModel, startKnowledgeLocalResources } from '../knowledge/knowledge-local-settings'
import { knowledgeLocalResources } from '../knowledge/knowledge-local-resources'
import { ipcMain } from 'electron'
import { configService } from '../config/service'
import { noteWikiPages, prepareNoteWiki, wikiSourceStatuses } from '../knowledge/note-sources'
import type { PrepareNoteWikiInput } from '../../shared/ipc/knowledge'
import { knowledgeContractService } from '../knowledge/contract-service'
import { knowledgeAuditService } from '../knowledge/audit-service'
import { knowledgeObservationService } from '../knowledge/observation-service'
import { observationRevocationContext, revokeObservation, listObservationRevocations } from '../knowledge/observation-revocation'
import { knowledgeExtractService } from '../knowledge/extract-service'
import {
  knowledgeReviewService,
} from '../knowledge/review-service'
import { knowledgeSearchService } from '../knowledge/search-service'
import { knowledgeTruthService } from '../knowledge/truth-service'
import { knowledgeContextService } from '../knowledge/context-service'
import { knowledgeOperationsService } from '../knowledge/operations-service'
import { getUserMemoryOverview } from '../knowledge/user-overview-service'
import { userProfileService } from '../knowledge/user-profile-service'
import { importLegacyPersonalMemory } from '../knowledge/legacy-memory-migration'
import { migrateLegacyEpisodes } from '../knowledge/legacy-episode-migration'
import { forgetPersonalMemory } from '../knowledge/personal-memory-forgetting'
import { proposePersonalMemoryCorrection } from '../knowledge/personal-memory-correction'
import { knowledgeDiagnosticsService } from '../knowledge/diagnostics-service'
import { getExternalMcpStatus, registerExternalMcpClient, probeExternalMcp } from '../knowledge/external-mcp'
import { knowledgeProcessingQueue } from '../knowledge/processing-queue'
import {
  KNOWLEDGE_CHANNELS,
  type AuditQuery,
  type ExternalMcpClientId,
  type KnowledgeDiagnosticsQuery,
  type ReviewCandidateInput,
  type RevokeTruthInput,
  type KnowledgeProcessNowInput,
} from '../../shared/ipc/knowledge'
import type {
  CaptureObservationInput,
  KnowledgeContextRequest,
  KnowledgeSearchQuery,
  KnowledgeFeedbackInput,
  Observation,
  ObservationPruneQuery,
  ObservationQuery,
} from '../../shared/knowledge'

export function registerKnowledgeHandlers(): void {
  const assertEnabled = async () => { if (!(await configService.getExperimentalFeatures()).knowledge) throw new Error('knowledge-disabled') }
  ipcMain.handle(KNOWLEDGE_CHANNELS.automationStatus, () => knowledgeAutomationService.status())
  ipcMain.handle(KNOWLEDGE_CHANNELS.automationRun, async (_event, input?: { backfill?: boolean }) => {
    await assertEnabled()
    if (input?.backfill === true) await knowledgeAutomationService.backfill()
    else await knowledgeAutomationService.run()
    return knowledgeAutomationService.status()
  })
  ipcMain.handle(KNOWLEDGE_CHANNELS.automationRetry, async (_event, id: string) => { await assertEnabled(); await knowledgeAutomationService.retry(id) })
  ipcMain.handle(KNOWLEDGE_CHANNELS.jevCredential, async (_event, input: unknown) => { await assertEnabled(); knowledgeAutomationService.stop(); return setJevKey(input) })
  ipcMain.handle(KNOWLEDGE_CHANNELS.jevCredentialStatus, async () => ({ configured: Boolean(await getJevKey()) }))
  ipcMain.handle(KNOWLEDGE_CHANNELS.localModelConfigure, (_event, input: unknown) => configureKnowledgeLocalModel(input))
  ipcMain.handle(KNOWLEDGE_CHANNELS.localResourcesInstall, () => startKnowledgeLocalResources())
  ipcMain.handle(KNOWLEDGE_CHANNELS.localResourcesStatus, () => knowledgeLocalResources.status())
  ipcMain.handle(KNOWLEDGE_CHANNELS.localModelStop, () => { knowledgeAutomationService.stop(); return disableKnowledgeLocalModel() })
  ipcMain.handle(KNOWLEDGE_CHANNELS.wikiHistory, (_event, input: unknown) => listWikiHistory(input))
  ipcMain.handle(KNOWLEDGE_CHANNELS.wikiRevision, (_event, input: unknown) => readWikiRevision(input))
  ipcMain.handle(KNOWLEDGE_CHANNELS.pinWikiRevision, async (_event, input: unknown) => { await assertEnabled(); return pinWikiRevision(input) })
  ipcMain.handle(KNOWLEDGE_CHANNELS.candidateAction, (_event, input: unknown) => knowledgeProcessingQueue.processCandidateAction(input))
  ipcMain.handle(KNOWLEDGE_CHANNELS.layaControl, (_event, action) => controlLaya(action))
  ipcMain.handle(KNOWLEDGE_CHANNELS.importLegacyPersonalMemory, () => importLegacyPersonalMemory())
  ipcMain.handle(KNOWLEDGE_CHANNELS.forgetPersonalMemory, (_event, input: unknown) => forgetPersonalMemory(input))
  ipcMain.handle(KNOWLEDGE_CHANNELS.proposePersonalMemoryCorrection, (_event, input: unknown) => proposePersonalMemoryCorrection(input))
  ipcMain.handle(KNOWLEDGE_CHANNELS.noteWikiPages, async (_event, input: { rootPath: string; uri: string }) => noteWikiPages(input.rootPath, input.uri))
  ipcMain.handle(KNOWLEDGE_CHANNELS.prepareNoteWiki, async (_event, input: PrepareNoteWikiInput) => prepareNoteWiki(input))
  ipcMain.handle(KNOWLEDGE_CHANNELS.proposeNoteWiki, async (_event, input: { draftId: string; title: string; markdown: string; rationale: string }) => knowledgeReviewService.proposeNoteWiki(input))
  ipcMain.handle(KNOWLEDGE_CHANNELS.noteWikiStatuses, async (_event, input: { candidateId?: string; workspaceId?: string; slug?: string }) => {
    if (input.candidateId) {
      const candidate = (await knowledgeExtractService.listWikiPatchCandidates()).find(c => c.id === input.candidateId)
      if (!candidate) throw new Error('Wiki candidate not found')
      return wikiSourceStatuses(candidate.provenance.workspacePath, candidate.sourceNoteRefs)
    }
    const page = (await knowledgeTruthService.list({ includeStaleWiki: true })).wikiPages.find(p => p.workspaceId === input.workspaceId && p.slug === input.slug)
    if (!page) throw new Error('Wiki page not found')
    return wikiSourceStatuses(page.workspacePath ?? '', page.sourceNoteRefs)
  })
  ipcMain.handle(KNOWLEDGE_CHANNELS.contracts, async () => {
    return knowledgeContractService.getContracts()
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.bootstrap, async (_event, workspacePath?: string) => {
    return knowledgeContractService.bootstrapWorkspace(workspacePath)
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.observe, async (_event, input: CaptureObservationInput) => {
    return knowledgeObservationService.capture(input)
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.listObservations, async (_event, query: ObservationQuery) => {
    return knowledgeObservationService.list(query)
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.pruneObservations, async (_event, query: ObservationPruneQuery) => {
    return knowledgeObservationService.prune(query)
  })
  ipcMain.handle(KNOWLEDGE_CHANNELS.observationRevocationContext, (_event, input: unknown) => observationRevocationContext(input))
  ipcMain.handle(KNOWLEDGE_CHANNELS.revokeObservation, (_event, input: unknown) => revokeObservation(input))
  ipcMain.handle(KNOWLEDGE_CHANNELS.observationRevocations, (_event, input: unknown) => listObservationRevocations(input))

  ipcMain.handle(KNOWLEDGE_CHANNELS.resolveObservationContent, async (_event, observation: Observation) => {
    return knowledgeObservationService.resolveContent(observation)
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.autoPruneObservations, async (_event, nowMs?: number) => {
    return knowledgeObservationService.autoPrune(nowMs)
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.retentionStats, async () => {
    return knowledgeObservationService.stats()
  })

  // Phase 5: audit + archive + compact handlers (additive only).
  ipcMain.handle(KNOWLEDGE_CHANNELS.listAudit, async (_event, query?: AuditQuery) => {
    return knowledgeAuditService.list(query ?? {})
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.auditStats, async () => {
    return knowledgeAuditService.stats()
  })

  ipcMain.handle(
    'knowledge:observations:archive',
    async (
      _event,
      options?: { olderThanMonths?: number; confirm?: boolean; nowMs?: number },
    ) => {
      return knowledgeObservationService.archiveOldShards(options ?? {})
    },
  )

  ipcMain.handle(
    'knowledge:observations:compact',
    async (
      _event,
      options?: { olderThanMonths?: number; confirm?: boolean; nowMs?: number },
    ) => {
      return knowledgeObservationService.compactEvidence(options ?? {})
    },
  )

  // Phase 5: `knowledge:extract` direct IPC removed — LLM enhancement runs only
  // via the processing queue (`runLlmStage` → `knowledgeExtractService.extract`).

  ipcMain.handle(KNOWLEDGE_CHANNELS.listCandidates, async () => {
    return knowledgeExtractService.listFactCandidates()
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.listGraphCandidates, async () => {
    return knowledgeExtractService.listGraphCandidates()
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.listWikiPatchCandidates, async () => {
    return knowledgeExtractService.listWikiPatchCandidates()
  })

  // MVP review loop: reject / apply (approve+apply combined)
  ipcMain.handle(KNOWLEDGE_CHANNELS.factReviewContext, async (_event, input: ReviewCandidateInput) => knowledgeReviewService.factReviewContext(input))
  ipcMain.handle(
    KNOWLEDGE_CHANNELS.rejectCandidate,
    async (_event, input: ReviewCandidateInput) => {
      return knowledgeReviewService.rejectCandidate(input)
    },
  )

  ipcMain.handle(
    KNOWLEDGE_CHANNELS.applyCandidate,
    async (_event, input: ReviewCandidateInput) => {
      return knowledgeReviewService.applyCandidate(input)
    },
  )

  ipcMain.handle(KNOWLEDGE_CHANNELS.search, async (_event, query: KnowledgeSearchQuery) => {
    return knowledgeSearchService.search(query)
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.listTruth, async () => {
    return knowledgeTruthService.list({ includeStaleWiki: true })
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.revokeTruth, async (_event, input: RevokeTruthInput) => {
    return knowledgeOperationsService.revoke(input)
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.listConflicts, async (_event, workspaceId: string) => {
    return knowledgeOperationsService.listConflicts(workspaceId)
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.recordFeedback, async (_event, input: KnowledgeFeedbackInput) => {
    return knowledgeOperationsService.recordFeedback(input)
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.feedbackSummary, async (_event, workspaceId?: string) => {
    return knowledgeOperationsService.feedbackSummary(workspaceId)
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.context, async (_event, request: KnowledgeContextRequest) => {
    return knowledgeContextService.search(request)
  })

  // User memory M4: workspace-free glance payload for persona cards plus badge.
  ipcMain.handle(KNOWLEDGE_CHANNELS.userMemoryOverview, async () => {
    return getUserMemoryOverview()
  })
  ipcMain.handle(KNOWLEDGE_CHANNELS.personalProfileEditContext, () => userProfileService.editContext())
  ipcMain.handle(KNOWLEDGE_CHANNELS.migrateLegacyEpisodes, (_event, input: unknown) => migrateLegacyEpisodes(input))
  ipcMain.handle(KNOWLEDGE_CHANNELS.savePersonalProfile, (_event, input: unknown) => userProfileService.replace(input))

  // Phase 0: read-only pipeline diagnostics for the Workbench status bar.
  ipcMain.handle(KNOWLEDGE_CHANNELS.diagnostics, async (_event, query?: KnowledgeDiagnosticsQuery) => {
    return knowledgeDiagnosticsService.snapshot(query ?? {})
  })

  // Phase 1: processing queue manual trigger + metrics (deterministic handler is wired in register.ts).
  ipcMain.handle(KNOWLEDGE_CHANNELS.processNow, async (_event, input?: KnowledgeProcessNowInput) => {
    return knowledgeProcessingQueue.processNow(input?.workspaceId)
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.processingStats, async () => {
    // Phase 5: return the full queue snapshot (§6 metrics). Previous
    // shaping dropped llmConfigured/llmSucceeded/llmFailed/llmSkipped and
    // lastRun, hiding LLM degradation from the status bar.
    return knowledgeProcessingQueue.processingStats()
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.probeExternalMcp, () => probeExternalMcp())

  ipcMain.handle(KNOWLEDGE_CHANNELS.externalMcpStatus, async () => {
    return getExternalMcpStatus()
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.registerExternalMcp, async (_event, client: ExternalMcpClientId) => {
    return registerExternalMcpClient(client)
  })
}
