// Note: personal habits require attributable evidence, including engineering conversations — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import type { MemoryFact, MemoryScope, MemorySourceEvidence, Observation } from '../../shared/knowledge'
import { redactHighConfidenceSecrets } from '@janus-agent/agent-core'

export function observationScope(observation: Pick<Observation, 'scope' | 'workspaceId'>): MemoryScope {
  return observation.workspaceId === 'user' ? 'user' : observation.scope ?? 'project'
}

export function factScope(fact: Pick<MemoryFact, 'scope' | 'provenance'>): MemoryScope {
  return fact.provenance.workspaceId === 'user' ? 'user' : fact.scope ?? 'project'
}

/** Legacy actor/source labels are not proof of who actually spoke. */
export function sourceEvidence(observation: Observation): MemorySourceEvidence {
  const evidence = observation.sourceEvidence ?? {
    observationId: observation.id,
    workspaceId: observation.workspaceId,
    scope: observationScope(observation),
    source: observation.source,
    createdAt: observation.createdAt,
    sessionId: observation.sessionId,
    speaker: 'unknown' as const,
    authority: 'unverified' as const,
    excerpt: observation.content.slice(0, 280),
  }
  return { ...evidence, excerpt: redactHighConfidenceSecrets(evidence.excerpt).text }
}

export function observationEventKey(observation: Observation): string {
  const evidence = sourceEvidence(observation)
  return evidence.sourceEventId
    ? JSON.stringify([observationScope(observation), observation.workspaceId, observation.source,
      observation.type, evidence.sessionId ?? '', evidence.speaker, evidence.sourceEventId])
    : observation.id
}

export function isUserStatement(observation: Observation): boolean {
  if (!isActiveObservation(observation)) return false
  const evidence = observation.sourceEvidence
  if (!isSourceEvidence(evidence) || evidence.observationId !== observation.id
    || evidence.workspaceId !== observation.workspaceId || evidence.scope !== observationScope(observation)
    || evidence.source !== observation.source || evidence.sessionId !== observation.sessionId) return false
  return (observation.type === 'conversation-turn' || observation.type === 'user-note')
    && (observation.source === 'janus-chat' || observation.source === 'manual')
    && evidence.speaker === 'user' && evidence.authority === 'user-stated'
}

export function isActiveObservation(observation: Pick<Observation, 'episodeStatus' | 'expiresAt' | 'revokedAt'>, nowMs = Date.now()): boolean {
  return !observation.revokedAt && observation.episodeStatus !== 'expired'
    && (!observation.expiresAt || Date.parse(observation.expiresAt) > nowMs)
}

export function isMemoryScope(value: unknown): value is MemoryScope {
  return value === 'project' || value === 'user' || value === 'global'
}

export function isSourceEvidence(value: unknown): value is MemorySourceEvidence {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.observationId === 'string' && record.observationId.length > 0
    && typeof record.workspaceId === 'string' && record.workspaceId.length > 0
    && isMemoryScope(record.scope)
    && ['agent-stream', 'blueprint-maintenance', 'checkpoint', 'git-analyzer', 'janus-chat', 'manual', 'tool', 'system'].includes(String(record.source))
    && typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt))
    && ['user', 'assistant', 'tool', 'system', 'unknown'].includes(String(record.speaker))
    && ['user-stated', 'model-generated', 'tool-observed', 'unverified'].includes(String(record.authority))
    && (record.authority !== 'user-stated' || record.speaker === 'user')
    && (record.authority !== 'model-generated' || record.speaker === 'assistant')
    && (record.authority !== 'tool-observed' || record.speaker === 'tool')
    && typeof record.excerpt === 'string'
    && (record.sourceEventId === undefined || (typeof record.sourceEventId === 'string' && record.sourceEventId.length > 0))
    && (record.sessionId === undefined || typeof record.sessionId === 'string')
}
