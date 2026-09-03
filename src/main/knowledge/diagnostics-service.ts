/**
 * @file Knowledge diagnostics (Phase 0).
 * @description Read-only pipeline health snapshot: recent observations,
 *              per-workspace counts and unprocessed estimate, candidate and
 *              truth totals, capture failure counter. No cursor exists until
 *              Phase 1, so every evidence observation counts as unprocessed.
 */

import { knowledgeRootPath } from './constants'
import { knowledgeObservationService } from './observation-service'
import { knowledgeExtractService } from './extract-service'
import { knowledgeTruthService } from './truth-service'
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

function summarizeWorkspaces(observations: Observation[]): KnowledgeWorkspaceDiagnostics[] {
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
      entry.unprocessedEstimate += 1
    }
    if (isFallbackWorkspaceId(observation)) entry.fallbackWorkspaceIds += 1
    if (!entry.lastObservationAt || observation.createdAt > entry.lastObservationAt) {
      entry.lastObservationAt = observation.createdAt
    }
  }
  return [...byWorkspace.values()].sort((a, b) =>
    (b.lastObservationAt ?? '').localeCompare(a.lastObservationAt ?? ''),
  )
}

export class KnowledgeDiagnosticsService {
  async snapshot(query: KnowledgeDiagnosticsQuery = {}): Promise<KnowledgeDiagnostics> {
    const recentLimit = Math.min(Math.max(query.recentLimit ?? DEFAULT_RECENT_LIMIT, 1), MAX_RECENT_LIMIT)

    const [all, factCandidates, wikiPatches, graphCandidates, truth] = await Promise.all([
      knowledgeObservationService.listAll(),
      knowledgeExtractService.listFactCandidates(),
      knowledgeExtractService.listWikiPatchCandidates(),
      knowledgeExtractService.listGraphCandidates(),
      knowledgeTruthService.list(),
    ])

    const scoped = query.workspaceId
      ? all.filter((observation) => observation.workspaceId === query.workspaceId)
      : all
    const recentObservations = [...scoped]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, recentLimit)

    return {
      generatedAt: new Date().toISOString(),
      knowledgeRoot: knowledgeRootPath(),
      recentObservations,
      workspaces: summarizeWorkspaces(scoped),
      candidates: {
        facts: factCandidates.length,
        wikiPatches: wikiPatches.length,
        graphEdges: graphCandidates.length,
      },
      truth: {
        facts: truth.facts.length,
        wikiPages: truth.wikiPages.length,
        graphEdges: truth.graphEdges.length,
      },
      captureFailures: knowledgeCaptureFailureCount(),
    }
  }
}

export const knowledgeDiagnosticsService = new KnowledgeDiagnosticsService()
