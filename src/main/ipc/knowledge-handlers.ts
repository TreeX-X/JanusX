import { ipcMain } from 'electron'
import { knowledgeContractService } from '../knowledge/contract-service'
import { knowledgeAuditService, type AuditQuery } from '../knowledge/audit-service'
import { knowledgeObservationService } from '../knowledge/observation-service'
import { knowledgeExtractService, type ExtractInput } from '../knowledge/extract-service'
import {
  knowledgeReviewService,
  type ReviewCandidateInput,
} from '../knowledge/review-service'
import { knowledgeSearchService } from '../knowledge/search-service'
import type {
  CaptureObservationInput,
  KnowledgeSearchQuery,
  Observation,
  ObservationPruneQuery,
  ObservationQuery,
} from '../../shared/knowledge'

export function registerKnowledgeHandlers(): void {
  ipcMain.handle('knowledge:contracts:get', async () => {
    return knowledgeContractService.getContracts()
  })

  ipcMain.handle('knowledge:bootstrap', async (_event, workspacePath?: string) => {
    return knowledgeContractService.bootstrapWorkspace(workspacePath)
  })

  ipcMain.handle('knowledge:observe', async (_event, input: CaptureObservationInput) => {
    return knowledgeObservationService.capture(input)
  })

  ipcMain.handle('knowledge:observations:list', async (_event, query: ObservationQuery) => {
    return knowledgeObservationService.list(query)
  })

  ipcMain.handle('knowledge:observations:prune', async (_event, query: ObservationPruneQuery) => {
    return knowledgeObservationService.prune(query)
  })

  ipcMain.handle('knowledge:observations:resolve-content', async (_event, observation: Observation) => {
    return knowledgeObservationService.resolveContent(observation)
  })

  ipcMain.handle('knowledge:observations:auto-prune', async (_event, nowMs?: number) => {
    return knowledgeObservationService.autoPrune(nowMs)
  })

  ipcMain.handle('knowledge:retention:stats', async () => {
    return knowledgeObservationService.stats()
  })

  // Phase 5: audit + archive + compact handlers (additive only).
  ipcMain.handle('knowledge:audit:list', async (_event, query?: AuditQuery) => {
    return knowledgeAuditService.list(query ?? {})
  })

  ipcMain.handle('knowledge:audit:stats', async () => {
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

  // Phase 6: candidate extraction via LLM structured output (no-default-LLM degrades safely).
  ipcMain.handle('knowledge:extract', async (_event, input?: ExtractInput) => {
    return knowledgeExtractService.extract(input ?? {})
  })

  ipcMain.handle('knowledge:candidates:list', async () => {
    return knowledgeExtractService.listFactCandidates()
  })

  ipcMain.handle('knowledge:candidates:list-graph', async () => {
    return knowledgeExtractService.listGraphCandidates()
  })

  ipcMain.handle('knowledge:candidates:list-wiki-patches', async () => {
    return knowledgeExtractService.listWikiPatchCandidates()
  })

  // MVP review loop: reject / apply (approve+apply combined)
  ipcMain.handle(
    'knowledge:candidates:reject',
    async (_event, input: ReviewCandidateInput) => {
      return knowledgeReviewService.rejectCandidate(input)
    },
  )

  ipcMain.handle(
    'knowledge:candidates:apply',
    async (_event, input: ReviewCandidateInput) => {
      return knowledgeReviewService.applyCandidate(input)
    },
  )

  ipcMain.handle('knowledge:search', async (_event, query: KnowledgeSearchQuery) => {
    return knowledgeSearchService.search(query)
  })
}
