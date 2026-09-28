// Note: natural-language user memory tools behind the policy gate — see .agents/notes/2026-09-15-user-memory-tools-m3--939f0bcf.md
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
import { redactHighConfidenceSecrets, type RegisteredTool, type ToolRegistry } from '@janus-agent/agent-core'
import { knowledgeObservationService } from '../../../knowledge/observation-service'
import { knowledgeProcessingQueue } from '../../../knowledge/processing-queue'
import { searchUserMemoryDefault } from '../../../knowledge/user-recall-service'
import { forgetPersonalMemoryQuery } from '../../../knowledge/personal-memory-forgetting'

const registeredRegistries = new WeakSet<ToolRegistry>()
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
  description: 'Queue a durable user memory for Inbox review. Returns queued with a source observation citation; a human approves the resulting candidate in the Inbox. Secrets are redacted before storage.',
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
    const observation = await knowledgeObservationService.capture({
      workspaceId: 'user', workspaceName: 'user', workspacePath: 'user',
      source: 'tool', type: 'user-note', actor: 'user-memory-save', content,
      tags: [...new Set(['user-memory', ...tags])], visibility: 'restricted',
    }, { speaker: 'assistant', memoryIntent: 'remember' })
    knowledgeProcessingQueue.scheduleImmediate('user')
    return {
      observationId: observation.id,
      status: 'queued' as const,
      redacted,
      citations: { observationIds: [observation.id] },
    }
  },
}

export const userMemoryForgetTool: RegisteredTool = {
  name: 'user-memory.forget',
  description: 'Forget matching durable user memory: records durable logical forgetting for matched facts, events and their personal derivatives. Original files remain; exact content and source replay stay blocked. Person scope only; project knowledge is never touched. Requires confirm:true.',
  actionRisk: 'delete',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' }, confirm: { type: 'boolean' } },
    required: ['query', 'confirm'],
    additionalProperties: false,
  },
  execute: async (input) => {
    return forgetPersonalMemoryQuery(input)
  },
}

export function registerUserMemoryTools(registry: ToolRegistry): void {
  if (registeredRegistries.has(registry)) return
  registry.register(userMemorySearchTool)
  registry.register(userMemorySaveTool)
  registry.register(userMemoryForgetTool)
  registeredRegistries.add(registry)
}
