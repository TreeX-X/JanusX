// Note: natural-language user memory tools behind the policy gate — see .agents/notes/implemented/feature/2026-09-15-user-memory-tools-m3.md
/**
 * @file User memory agent tools (M3).
 * @description Exactly three tools over the existing shell `ToolRegistry`:
 * search (read, no approval), candidate-only save (write, approval-gated,
 * never touches truth directly), and forget (delete, approval-gated plus an
 * explicit `confirm:true`). All three stay person-scoped: project knowledge is
 * never read for output nor mutated. Every result cites its fact, candidate,
 * observation, or episode source, secrets are redacted before storage, and
 * every mutation audits.
 */
import { randomUUID } from 'crypto'
import { appendFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import { redactHighConfidenceSecrets, type RegisteredTool, type ToolRegistry } from '@janus-agent/agent-core'
import type { CandidateFact, MemoryFact } from '../../../../shared/knowledge'
import { knowledgeRootPath } from '../../../knowledge/constants'
import { knowledgeAuditService } from '../../../knowledge/audit-service'
import { knowledgeOperationsService } from '../../../knowledge/operations-service'
import { knowledgeTruthService } from '../../../knowledge/truth-service'
import { userEpisodeService } from '../../../knowledge/user-episode-service'
import { searchUserMemoryDefault } from '../../../knowledge/user-recall-service'
import { Bm25Index } from '../../../knowledge/search/bm25'
import { isForgettableQuery, matchesForgettingQuery } from '../../../knowledge/search/tokenizer'

const registeredRegistries = new WeakSet<ToolRegistry>()
const FACT_CANDIDATES_FILE = join('facts', 'candidates.jsonl')
const MAX_QUERY_CHARS = 500
const MAX_SAVE_CHARS = 2000
const MAX_TAGS = 20
const MAX_TAG_CHARS = 60

function boundedText(value: unknown, field: string, maxChars: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string`)
  const trimmed = value.trim()
  if (trimmed.length > maxChars) throw new Error(`${field} must be at most ${maxChars} characters`)
  return trimmed
}

function boundedTags(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('tags must be an array of strings')
  const tags = value
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .map((tag) => tag.trim().slice(0, MAX_TAG_CHARS))
  if (tags.length > MAX_TAGS) throw new Error(`tags must contain at most ${MAX_TAGS} entries`)
  return [...new Set(tags)]
}

export const userMemorySearchTool: RegisteredTool = {
  name: 'user-memory.search',
  description: 'Search durable user memory (habits, preferences, recent events). Person scope only; works with no workspace attached. Every match cites its fact, observation, or episode source.',
  actionRisk: 'read',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false,
  },
  execute: async (input) => {
    const query = boundedText(input.query, 'user-memory.search query', MAX_QUERY_CHARS)
    const result = await searchUserMemoryDefault(query)
    return {
      matches: result.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        content: item.content.slice(0, 500),
        score: item.score,
        citations: { factIds: item.factIds, observationIds: item.observationIds, episodeIds: item.episodeIds },
        ...(item.succession ? { succession: item.succession } : {}),
      })),
      truncated: result.truncated,
      eligibleCount: result.eligibleCount,
    }
  },
}

export const userMemorySaveTool: RegisteredTool = {
  name: 'user-memory.save',
  description: 'Propose a durable user memory (preference or habit) for Inbox review. Candidate-only: never writes truth directly; a human approves it in the Inbox. Secrets are redacted before storage.',
  actionRisk: 'write',
  inputSchema: {
    type: 'object',
    properties: { content: { type: 'string' }, tags: { type: 'array' } },
    required: ['content'],
    additionalProperties: false,
  },
  execute: async (input) => {
    const raw = boundedText(input.content, 'user-memory.save content', MAX_SAVE_CHARS)
    const tags = boundedTags(input.tags)
    const { text, redacted } = redactHighConfidenceSecrets(raw)
    const content = text.trim().slice(0, MAX_SAVE_CHARS)
    if (!content) throw new Error('user-memory.save content is empty after normalization')
    const nowIso = new Date().toISOString()
    const fact: MemoryFact = {
      id: randomUUID(),
      content,
      concepts: [],
      files: [],
      tags: [...new Set(['user-memory', ...tags])],
      confidence: 0.6,
      version: 1,
      status: 'proposed',
      kind: 'preference',
      scope: 'user',
      provenance: {
        workspaceId: 'user',
        workspaceName: 'user',
        workspacePath: '',
        source: 'manual',
        sourceObservationIds: [],
        fileRefs: [],
        actor: 'user-memory-save',
        createdAt: nowIso,
      },
    }
    const candidate: CandidateFact = {
      id: randomUUID(),
      type: 'fact',
      status: 'proposed',
      fact,
      derivation: 'deterministic',
      evidence: { observationIds: [], snippets: [content.slice(0, 280)] },
    }
    const file = join(knowledgeRootPath(), FACT_CANDIDATES_FILE)
    await mkdir(dirname(file), { recursive: true })
    await appendFile(file, `${JSON.stringify(candidate)}\n`, 'utf8')
    await knowledgeAuditService.record({
      action: 'candidate_proposed',
      targetType: 'fact',
      targetId: candidate.id,
      before: null,
      after: { factId: fact.id, scope: 'user', derivation: 'deterministic' },
      provenance: { ...fact.provenance, actor: 'user-memory-save' },
    })
    return {
      candidateId: candidate.id,
      factId: fact.id,
      status: 'proposed' as const,
      redacted,
      citations: { candidateId: candidate.id, factId: fact.id },
    }
  },
}

export const userMemoryForgetTool: RegisteredTool = {
  name: 'user-memory.forget',
  description: 'Forget matching durable user memory: archives user facts, expires user events, and writes audit so recall stays silent afterwards. Person scope only; project knowledge is never touched. Requires confirm:true.',
  actionRisk: 'delete',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' }, confirm: { type: 'boolean' } },
    required: ['query', 'confirm'],
    additionalProperties: false,
  },
  execute: async (input) => {
    if (input.confirm !== true) throw new Error('user-memory.forget requires confirm:true')
    const query = boundedText(input.query, 'user-memory.forget query', MAX_QUERY_CHARS)
    if (!isForgettableQuery(query)) throw new Error('user-memory.forget query is too broad to forget safely')
    const snapshot = await knowledgeTruthService.list()
    const userFacts = snapshot.facts.filter(
      (fact) => fact.scope === 'user' || fact.provenance.workspaceId === 'user',
    )
    const index = new Bm25Index(userFacts.map((fact) => ({ id: fact.id, text: `${fact.content}\n${fact.concepts.join(' ')}` })))
    const matchedIds = new Set(index.search(query).map((hit) => hit.id))
    // Destructive ops need substantive overlap: one shared multi-character
    // term or at least two shared CJK characters, never a lone particle.
    const matched = userFacts.filter((fact) => matchedIds.has(fact.id)
      && matchesForgettingQuery(query, `${fact.content}\n${fact.concepts.join(' ')}`))
    const archivedFactIds: string[] = []
    for (const fact of matched) {
      await knowledgeOperationsService.revoke({ kind: 'fact', id: fact.id, workspaceId: fact.provenance.workspaceId })
      archivedFactIds.push(fact.id)
    }
    const { expiredIds } = await userEpisodeService.expireMatching(query, Date.now())
    if (archivedFactIds.length === 0 && expiredIds.length === 0) {
      throw new Error('user-memory.forget matched no user memory')
    }
    return { archivedFactIds, expiredEpisodeIds: expiredIds, silent: true as const }
  },
}

export function registerUserMemoryTools(registry: ToolRegistry): void {
  if (registeredRegistries.has(registry)) return
  registry.register(userMemorySearchTool)
  registry.register(userMemorySaveTool)
  registry.register(userMemoryForgetTool)
  registeredRegistries.add(registry)
}
