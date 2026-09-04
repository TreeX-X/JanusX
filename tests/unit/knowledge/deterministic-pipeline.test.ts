import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))

import { knowledgeObservationService, resetObservationServiceEphemeralState } from '../../../src/main/knowledge/observation-service'
import { knowledgeExtractService } from '../../../src/main/knowledge/extract-service'
import { knowledgeReviewService } from '../../../src/main/knowledge/review-service'
import { knowledgeTruthService } from '../../../src/main/knowledge/truth-service'
import { knowledgeRecallService } from '../../../src/main/knowledge/recall-service'
import { KnowledgeProcessingQueue } from '../../../src/main/knowledge/processing-queue'
import { runDeterministicStage } from '../../../src/main/knowledge/deterministic-extractor'
import type { CaptureObservationInput } from '../../../src/shared/knowledge'

const WS = 'ws-pipe'

function capture(input: Omit<CaptureObservationInput, 'workspaceId' | 'workspacePath'>) {
  return knowledgeObservationService.capture({
    workspaceId: WS,
    workspaceName: 'Pipe Workspace',
    workspacePath: 'C:\\pipe',
    ...input,
  })
}

describe('deterministic pipeline (Phase 1-2, no LLM)', () => {
  let root: string
  const previousKnowledgeRoot = process.env.JANUSX_KNOWLEDGE_ROOT

  beforeEach(async () => {
    resetObservationServiceEphemeralState()
    root = await mkdtemp(join(tmpdir(), 'janusx-pipe-'))
    process.env.JANUSX_KNOWLEDGE_ROOT = join(root, 'knowledge')
  })

  afterEach(async () => {
    if (previousKnowledgeRoot === undefined) delete process.env.JANUSX_KNOWLEDGE_ROOT
    else process.env.JANUSX_KNOWLEDGE_ROOT = previousKnowledgeRoot
    await rm(root, { recursive: true, force: true })
  })

  it('observation → derived + proposal → apply → recall, with candidate-stage conflicts', async () => {
    await capture({ workspacePath: 'C:\\pipe', source: 'git-analyzer', type: 'git-event', content: 'commit abc: add user index', fileRefs: ['src/db.ts'], actor: 'user' })
    await capture({ workspacePath: 'C:\\pipe', source: 'git-analyzer', type: 'git-event', content: 'commit def: drop user index', fileRefs: ['src/db.ts'], actor: 'user' })
    await capture({ workspacePath: 'C:\\pipe', source: 'manual', type: 'user-note', content: '今天天气不错', actor: 'user' })
    await capture({ workspacePath: 'C:\\pipe', source: 'manual', type: 'user-note', content: '决定：采用软删除方案', actor: 'user' })
    const errorContent = '$ npm run build\nerror TS2304: Cannot find name \'foo\''
    // Same signal, distinct ledger rows: capture-time exact dedupe (§3.1) keys on
    // workspace + type + content, so identical repeats would collapse into one
    // row. The repeats ride different observation types (call vs result) and the
    // last one carries a trailing marker — same first line, still one near-dupe
    // group — while the procedure rule counts the shared first line.
    await capture({ workspacePath: 'C:\\pipe', source: 'tool', type: 'tool-call', content: errorContent, actor: 'engine' })
    await capture({ workspacePath: 'C:\\pipe', source: 'tool', type: 'tool-result', content: errorContent, actor: 'engine' })
    await capture({ workspacePath: 'C:\\pipe', source: 'tool', type: 'tool-result', content: `${errorContent} (retry 2)`, actor: 'engine' })

    const queue = new KnowledgeProcessingQueue()
    queue.configureDeterministicHandler((batch) => runDeterministicStage(batch, { getAutoAccept: async () => false }).then(() => undefined))
    try {
      const first = await queue.processNow()
      expect(first.handlerMissing).toBe(false)
      // 7 ledger rows → 1 near-dupe error group → 4 proposals (plain note is derived-only).
      expect(first.processed).toBe(7)
      expect(first.failed).toBe(0)

      const candidates = await knowledgeExtractService.listFactCandidates()
      const deterministic = candidates.filter((c) => c.derivation === 'deterministic')
      expect(deterministic).toHaveLength(4)
      expect(deterministic.map((c) => c.fact.kind).sort()).toEqual(['decision', 'fact', 'fact', 'procedure'])
      for (const candidate of deterministic) {
        expect(candidate.evidence.observationIds.length).toBeGreaterThan(0)
        expect(candidate.fact.status).toBe('proposed')
      }
      const procedure = deterministic.find((c) => c.fact.kind === 'procedure')!
      expect(procedure.evidence.observationIds).toHaveLength(3)
      expect(procedure.fact.confidence).toBeCloseTo(0.6, 5)

      // Apply the first git proposal → truth carries the deterministic kind.
      const gitCandidate = deterministic.find((c) => c.fact.content.includes('add user index'))!
      const applied = await knowledgeReviewService.applyCandidate({ type: 'fact', id: gitCandidate.id })
      expect(applied.applied?.fact?.kind).toBe('fact')
      const truthId = applied.applied!.fact!.id

      // A later same-file commit with different content conflicts with that truth.
      await capture({ workspacePath: 'C:\\pipe', source: 'git-analyzer', type: 'git-event', content: 'commit ghi: rename user index', fileRefs: ['src/db.ts'], actor: 'user' })
      const second = await queue.processNow()
      expect(second.processed).toBe(1)
      const after = await knowledgeExtractService.listFactCandidates()
      const rename = after.find((c) => c.fact.content.includes('rename user index'))!
      expect(rename.conflicts).toEqual([truthId])

      // Truth recall finds the applied fact; restart restores an empty backlog.
      const recall = await knowledgeRecallService.recall({ query: 'user index', layer: 'truth', workspaceId: WS })
      expect(recall.documents.map((d) => d.hit.id)).toContain(truthId)

      const restarted = new KnowledgeProcessingQueue()
      try {
        expect((await restarted.startupRestore()).pendingTotal).toBe(0)
      } finally {
        restarted.dispose()
      }
    } finally {
      queue.dispose()
    }

    const truth = await knowledgeTruthService.list()
    expect(truth.facts.map((f) => f.kind)).toEqual(['fact'])
  })

  it('auto-accepts deterministic tool facts end to end when enabled (§4.6)', async () => {
    await capture({ workspacePath: 'C:\\pipe', source: 'tool', type: 'git-event', content: 'commit auto: enable auto accept', fileRefs: ['src/auto.ts'], actor: 'user' })
    await capture({ workspacePath: 'C:\\pipe', source: 'manual', type: 'user-note', content: '今天天气不错', actor: 'user' })

    const queue = new KnowledgeProcessingQueue()
    queue.configureDeterministicHandler((batch) => runDeterministicStage(batch, { getAutoAccept: async () => true }).then(() => undefined))
    try {
      const result = await queue.processNow()
      expect(result.handlerMissing).toBe(false)
      expect(result.failed).toBe(0)

      const candidates = await knowledgeExtractService.listFactCandidates()
      expect(candidates).toHaveLength(1)
      expect(candidates[0]?.derivation).toBe('deterministic')
      expect(candidates[0]?.status).toBe('applied')

      const truth = await knowledgeTruthService.list()
      expect(truth.facts).toHaveLength(1)
      expect(truth.facts[0]?.kind).toBe('fact')
      expect(truth.facts[0]?.status).toBe('active')

      const { knowledgeAuditService } = await import('../../../src/main/knowledge/audit-service')
      const approvals = (await knowledgeAuditService.list({ limit: 200 })).filter((event) => event.action === 'candidate_approved')
      expect(approvals).toHaveLength(1)
      expect(approvals[0]?.provenance.actor).toBe('auto-policy')
    } finally {
      queue.dispose()
    }
  })
})
