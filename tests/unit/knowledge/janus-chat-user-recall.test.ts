import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeContextResult } from '../../../src/shared/knowledge'
import type { UserRecallResult } from '../../../src/main/knowledge/user-recall-service'

const { handle, on, search, capture, streamText, getSession, executeFunctionCall, scheduleImmediate } = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
  search: vi.fn(),
  capture: vi.fn(),
  streamText: vi.fn(),
  getSession: vi.fn(),
  executeFunctionCall: vi.fn(),
  scheduleImmediate: vi.fn(),
}))

vi.mock('electron', () => ({ ipcMain: { handle, on }, app: { getPath: () => '/tmp/janusx-test' } }))
vi.mock('../../../src/main/knowledge/context-service', () => ({
  knowledgeContextService: { search },
}))
vi.mock('../../../src/main/knowledge/observation-service', () => ({
  knowledgeObservationService: { capture },
}))
vi.mock('../../../src/main/knowledge/processing-queue', () => ({
  knowledgeProcessingQueue: { scheduleImmediate },
}))
vi.mock('../../../src/main/llm/ModelCatalogService', () => ({
  getModelCatalogService: () => ({ getCatalog: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('../../../src/main/llm/LlmService', () => ({
  llmService: {
    getProviderSettings: vi.fn(async () => ({ modelId: 'test-model' })),
    getLanguageModel: vi.fn(async () => ({})),
  },
}))
vi.mock('../../../src/main/llm/ai-runtime', () => ({
  generateText: vi.fn(),
  streamText,
}))
vi.mock('../../../src/main/agent/runtime/shell-runtime', () => ({
  workspaceAgentRuntime: {
    getSession,
    executeFunctionCall,
    registry: { list: () => [] },
  },
}))

import { prepareJanusChatRecall } from '../../../src/main/llm/chat-orchestrator'

const messages = [
  { role: 'system' as const, content: 'Janus persona' },
  { role: 'user' as const, content: '我习惯用什么包管理器？' },
]

function projectResult(): KnowledgeContextResult {
  return {
    items: [{
      id: 'fact-p1',
      kind: 'fact',
      title: 'Build',
      content: '项目构建使用 pnpm workspace',
      score: 4.2,
      workspaceId: 'ws-a',
      provenance: { observationIds: ['obs-1'], factIds: ['fact-p1'], fileRefs: [], createdAt: '2026-09-10T00:00:00.000Z' },
    }],
    compactContext: '[fact] 项目构建使用 pnpm workspace',
    truncated: false,
    eligibleCount: 1,
    maxItems: 5,
    maxChars: 3_000,
  }
}

function userResult(): UserRecallResult {
  return {
    items: [{
      id: 'fact-u1',
      kind: 'habit',
      title: '我习惯用 pnpm 而不用 npm',
      content: '我习惯用 pnpm 而不用 npm',
      score: 2.1,
      bm25Score: 1.6,
      factIds: ['fact-u1'],
      observationIds: ['obs-u1'],
      episodeIds: [],
      habitStrength: 0.7,
      lastSeenAt: '2026-09-14T00:00:00.000Z',
    }],
    compactContext: '<janus-user-memory trust="untrusted" usage="reference-only">\n[habit] 我习惯用 pnpm 而不用 npm (fact:fact-u1)\n</janus-user-memory>',
    truncated: false,
    eligibleCount: 1,
    maxItems: 5,
    maxChars: 2_000,
  }
}

describe('Janus chat user recall fusion', () => {
  beforeEach(() => {
    search.mockReset()
  })

  it('appends the user section after project knowledge', async () => {
    const projectSearch = vi.fn(async () => projectResult())
    const userSearch = vi.fn(async () => userResult())
    const result = await prepareJanusChatRecall('r-1', messages, 'ws-a', 'C:/ws-a', projectSearch, userSearch)

    expect(userSearch).toHaveBeenCalledWith('我习惯用什么包管理器？')
    const bodies = result.messages.map((message) => message.content)
    const projectIndex = bodies.findIndex((body) => body.includes('janus-knowledge-context'))
    const userIndex = bodies.findIndex((body) => body.includes('janus-user-memory'))
    expect(projectIndex).toBeGreaterThanOrEqual(0)
    expect(userIndex).toBe(projectIndex + 1)
    expect(result.trace.status).toBe('recalled')
  })

  it('keeps personal recall with no workspace mounted', async () => {
    const degradedProject = vi.fn(async () => ({
      items: [],
      compactContext: '',
      truncated: false,
      eligibleCount: 0,
      maxItems: 5,
      maxChars: 3_000,
      degraded: { reason: 'missing-workspace' as const },
    }))
    const userSearch = vi.fn(async () => userResult())
    const result = await prepareJanusChatRecall('r-2', messages, undefined, undefined, degradedProject, userSearch)

    expect(result.messages.some((message) => message.content.includes('janus-user-memory'))).toBe(true)
    expect(result.trace.status).toBe('degraded')
  })

  it('fails open when user recall throws', async () => {
    const projectSearch = vi.fn(async () => projectResult())
    const explodingUser = vi.fn(async () => { throw new Error('user store unavailable') })
    const result = await prepareJanusChatRecall('r-3', messages, 'ws-a', 'C:/ws-a', projectSearch, explodingUser)

    expect(result.messages.some((message) => message.content.includes('janus-user-memory'))).toBe(false)
    expect(result.messages.some((message) => message.content.includes('janus-knowledge-context'))).toBe(true)
  })
})
