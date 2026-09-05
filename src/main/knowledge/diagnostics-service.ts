/**
 * @file Knowledge diagnostics (Phase 0, cursor-aware since Phase 1 convergence).
 * @description Read-only pipeline health snapshot: recent observations,
 *              per-workspace counts and unprocessed estimate, candidate and
 *              truth totals, capture failure counter. The unprocessed estimate
 *              comes from the processing queue cursor; when the cursor is
 *              unavailable it falls back to counting all evidence.
 */

import { knowledgeRootPath } from './constants'
import { knowledgeObservationService } from './observation-service'
import { knowledgeExtractService } from './extract-service'
import { knowledgeTruthService } from './truth-service'
import { countProposalsByDerivation, knowledgeProcessingQueue } from './processing-queue'
import { knowledgeCaptureFailureCount } from './workspace-identity'
import type {
  KnowledgeDiagnostics,
  KnowledgeDiagnosticsQuery,
  KnowledgeWorkspaceDiagnostics,
} from '../../shared/ipc/knowledge'
import type { Observation } from '../../shared/knowledge'

const DEFAULT_RECENT_LIMIT = 20
const MAX_RECENT_LIMIT = 100

function isFallbackWorkspaceId(observation: Observation): boolean {
  return observation.metadata?.workspaceIdFallback === true
}

function summarizeWorkspaces(
  observations: Observation[],
  pendingByWorkspace?: Map<string, number>,
): KnowledgeWorkspaceDiagnostics[] {
  const byWorkspace = new Map<string, KnowledgeWorkspaceDiagnostics>()
  for (const observation of observations) {
    let entry = byWorkspace.get(observation.workspaceId)
    if (!entry) {
      entry = {
        workspaceId: observation.workspaceId,
        workspaceName: observation.workspaceName,
        observations: 0,
        evidence: 0,
        fallbackWorkspaceIds: 0,
        unprocessedEstimate: 0,
      }
      byWorkspace.set(observation.workspaceId, entry)
    }
    entry.observations += 1
    const isEvidence = (observation.retentionClass ?? 'evidence') === 'evidence'
    if (isEvidence) {
      entry.evidence += 1
    }
    if (isFallbackWorkspaceId(observation)) entry.fallbackWorkspaceIds += 1
    if (!entry.lastObservationAt || observation.createdAt > entry.lastObservationAt) {
      entry.lastObservationAt = observation.createdAt
    }
  }
  for (const entry of byWorkspace.values()) {
    // Cursor-aware pending count; unknown workspaces (no cursor yet) keep the
    // conservative estimate of all evidence being unprocessed.
    entry.unprocessedEstimate = pendingByWorkspace?.get(entry.workspaceId) ?? entry.evidence
  }
  return [...byWorkspace.values()].sort((a, b) =>
    (b.lastObservationAt ?? '').localeCompare(a.lastObservationAt ?? ''),
  )
}

export class KnowledgeDiagnosticsService {
  async snapshot(query: KnowledgeDiagnosticsQuery = {}): Promise<KnowledgeDiagnostics> {
    const recentLimit = Math.min(Math.max(query.recentLimit ?? DEFAULT_RECENT_LIMIT, 1), MAX_RECENT_LIMIT)

    const [all, factCandidates, wikiPatches, graphCandidates, truth, pendingByWorkspace] = await Promise.all([
      knowledgeObservationService.listAll(),
      knowledgeExtractService.listFactCandidates(),
      knowledgeExtractService.listWikiPatchCandidates(),
      knowledgeExtractService.listGraphCandidates(),
      knowledgeTruthService.list(),
      // Best effort: queue stats failure must not fail diagnostics.
      knowledgeProcessingQueue.processingStats()
        .then((stats) => new Map(stats.workspaces.map((entry) => [entry.workspaceId, entry.pending])))
        .catch((error: unknown) => {
          console.error(`[knowledge] diagnostics pending stats failed: ${error instanceof Error ? error.message : String(error)}`)
          return undefined
        }),
    ])

    const scoped = query.workspaceId
      ? all.filter((observation) => observation.workspaceId === query.workspaceId)
      : all
    const recentObservations = [...scoped]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, recentLimit)

    // Phase 5 (§6): recall 索引新鲜度 best-effort。动态 import 避免在诊断
    // 模块图里静态拉入 recall 重依赖（部分单测只 mock 了 electron.ipcMain）。
    let indexUpdatedAt: string | null = null
    try {
      const { knowledgeRecallService } = await import('./recall-service')
      indexUpdatedAt = knowledgeRecallService.getLastIndexBuildAt()
    } catch (error) {
      console.error(`[knowledge] diagnostics index-updated-at snapshot failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    return {
      generatedAt: new Date().toISOString(),
      knowledgeRoot: knowledgeRootPath(),
      recentObservations,
      workspaces: summarizeWorkspaces(scoped, pendingByWorkspace),
      candidates: {
        facts: factCandidates.length,
        wikiPatches: wikiPatches.length,
        graphEdges: graphCandidates.length,
        // Phase 5 (§6): 与 processingStats 同口径，仅计 proposed。
        byDerivation: countProposalsByDerivation(factCandidates, wikiPatches, graphCandidates),
      },
      truth: {
        facts: truth.facts.length,
        wikiPages: truth.wikiPages.length,
        graphEdges: truth.graphEdges.length,
      },
      indexUpdatedAt,
      captureFailures: knowledgeCaptureFailureCount(),
    }
  }
}

export const knowledgeDiagnosticsService = new KnowledgeDiagnosticsService()
