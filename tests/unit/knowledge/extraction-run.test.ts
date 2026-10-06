import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resetExtractionCheckpoint, runExtraction } from '../../../src/main/knowledge/extraction-run'
import { COVERAGE_SYSTEM, CURATION_SYSTEM, type ExtractionEvidence } from '../../../src/main/knowledge/extraction-context'
import { defaultKnowledgeAutomation } from '../../../src/shared/knowledge-automation'
import type { KnowledgeModelRequest } from '../../../src/main/knowledge/knowledge-models'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'extraction-resume-')); vi.stubEnv('JANUSX_KNOWLEDGE_ROOT', root) })
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }) })
const evidence = (id: string, content: string): ExtractionEvidence => ({ id, content, offset: 0, createdAt: '2026-10-06T00:00:00Z', speaker: 'user', authority: 'user-stated' })
const fact = (part: ExtractionEvidence) => ({ content: part.content, kind: 'decision', concepts: ['backup'], citations: [{ observationId: part.id, quote: part.content }] })
const request = (system: string, input: unknown): KnowledgeModelRequest => ({ stage: 'extraction', system, input, signal: new AbortController().signal, settings: defaultKnowledgeAutomation() })
function output(call: KnowledgeModelRequest) {
  const input = call.input as { evidence: Array<ExtractionEvidence & { key: string }>; candidates: unknown[] }
  if (call.system === COVERAGE_SYSTEM) return { complete: true, coveredEvidenceIds: input.evidence.map(part => part.key), missing: [], invalidCandidateIds: [], reason: 'All evidence accounted for.' }
  if (call.system === CURATION_SYSTEM) return { complete: true, selections: input.candidates.map((_item, index) => ({ index, action: 'keep', equivalentTo: null, duplicateOf: null, reason: 'Durable backed rule.' })) }
  return { complete: true, facts: input.evidence.map(fact) }
}
describe('extraction recovery and coverage repair', () => {
  it('resumes completed evidence chunks after a model outage without repeating their inference', async () => {
    const first = evidence('first', 'Keep production backups for seven days.'), second = evidence('second', 'Verify checksums before restoring a backup.')
    let failed = false
    const json = vi.fn(async call => {
      if (call.system !== COVERAGE_SYSTEM && call.system !== CURATION_SYSTEM && call.input.evidence[0].id === 'second' && !failed) { failed = true; throw new Error('model-timeout') }
      return output(call)
    })
    const options = { taskId: 'resume', chunks: [[first], [second]], known: [], json, request, signal: new AbortController().signal }
    await expect(runExtraction(options)).rejects.toThrow('model-timeout')
    const result = await runExtraction(options)
    expect(result.facts.map(item => item.content)).toEqual([first.content, second.content])
    expect(json.mock.calls.filter(([call]) => call.system !== CURATION_SYSTEM && call.system !== COVERAGE_SYSTEM && call.input.evidence[0].id === 'first')).toHaveLength(1)
  })
  it('reconsiders an obsolete decision when independent coverage supplies its correction', async () => {
    const first = evidence('first', 'Use Redis for caching.'), second = evidence('second', 'Correction: use an in-process cache only in development.')
    const json = vi.fn(async call => {
      if (call.system === COVERAGE_SYSTEM) {
        const old = call.input.candidates.find(item => item.content === first.content)
        return { ...output(call), missing: old ? [fact(second)] : [], invalidCandidateIds: old ? [old.id] : [] }
      }
      if (call.system !== CURATION_SYSTEM) return { complete: true, facts: [fact(first)] }
      return output(call)
    })
    const result = await runExtraction({ taskId: 'correction', chunks: [[first, second]], known: [], json, request, signal: new AbortController().signal })
    expect(result.facts.map(item => item.content)).toEqual([second.content])
  })
  it('allows an explicit retry to replace a previously rejected cached curation', async () => {
    const part = evidence('source', 'Keep production backups for seven days.')
    let invalid = true
    const json = vi.fn(async call => call.system === CURATION_SYSTEM && invalid ? {
      complete: true, selections: [{ index: 0, action: 'duplicate', equivalentTo: null, duplicateOf: 0, reason: 'Invalid self duplicate.' }],
    } : output(call))
    const options = { taskId: 'retry', chunks: [[part]], known: [], json, request, signal: new AbortController().signal }
    await expect(runExtraction(options)).rejects.toThrow('extraction-invalid-duplicate')
    invalid = false
    await resetExtractionCheckpoint('retry')
    expect((await runExtraction(options)).facts.map(item => item.content)).toEqual([part.content])
  })
  it('reuses a retained statement across curation pages and preserves both citations', async () => {
    const parts = Array.from({ length: 12 }, (_, index) => evidence(`source-${index}`, `Backup procedure ${index} requires verification.`))
    const json = vi.fn(async call => {
      const result = output(call)
      if (call.system === CURATION_SYSTEM && call.input.candidates.some(item => item.content === parts[11].content)) {
        const target = call.input.existingKnowledge.find(item => item.content === parts[0].content)
        expect(target.id).toMatch(/^draft:/)
        result.selections[1].equivalentTo = target.id
      }
      return result
    })
    const result = await runExtraction({ taskId: 'pages', chunks: [parts], known: [], json, request, signal: new AbortController().signal })
    expect(result.facts).toHaveLength(11)
    expect(result.facts.find(item => item.content === parts[0].content)?.citations.map(citation => citation.observationId)).toEqual(['source-0', 'source-11'])
  })
})
