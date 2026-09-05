import { ipcMain } from 'electron'
import { knowledgeContractService } from '../knowledge/contract-service'
import { knowledgeAuditService } from '../knowledge/audit-service'
import { knowledgeObservationService } from '../knowledge/observation-service'
import { knowledgeExtractService } from '../knowledge/extract-service'
import {
  knowledgeReviewService,
} from '../knowledge/review-service'
import { knowledgeSearchService } from '../knowledge/search-service'
import { knowledgeTruthService } from '../knowledge/truth-service'
import { knowledgeContextService } from '../knowledge/context-service'
import { knowledgeOperationsService } from '../knowledge/operations-service'
import { knowledgeDiagnosticsService } from '../knowledge/diagnostics-service'
import { getExternalMcpStatus, registerExternalMcpClient } from '../knowledge/external-mcp'
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
    return knowledgeTruthService.list()
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

  ipcMain.handle(KNOWLEDGE_CHANNELS.externalMcpStatus, async () => {
    return getExternalMcpStatus()
  })

  ipcMain.handle(KNOWLEDGE_CHANNELS.registerExternalMcp, async (_event, client: ExternalMcpClientId) => {
    return registerExternalMcpClient(client)
  })
}
