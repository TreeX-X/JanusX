import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { scoreMemoryDecision, type MemoryDecisionInput } from '../../../src/main/knowledge/decision-scorer'

// Recorded real model outputs check that Python's diagnostic routing matches the host.
const dataset: Array<{ id: string; content: string; evidence: string[]; related: string[]; candidateKind: MemoryDecisionInput['kind'] }> =
  JSON.parse(readFileSync(resolve('tests/fixtures/laya-memory-diagnostics.json'), 'utf8'))
const report: {
  ready: { revision: string }
  results: Array<{ id: string; split: string; language: string; result: unknown }>
  routing: { groups: Record<string, { attempted: number; scored: number; refine: number; skipRefinement: number }> }
} = JSON.parse(readFileSync(resolve('tests/fixtures/laya-diagnostics-windows.json'), 'utf8'))

it.each(['en', 'zh'])('matches the host refinement decision for recorded %s holdout predictions', async language => {
  const selected = report.results.filter(row => row.split === 'holdout' && row.language === language)
  let scored = 0
  let refine = 0
  for (const row of selected) {
    const sample = dataset.find(item => item.id === row.id)!
    expect(sample).toBeDefined()
    expect(sample.evidence.reduce((size, text) => size + text.length, 0)).toBeLessThanOrEqual(800)
    const annotation = await scoreMemoryDecision({
      candidateId: row.id, candidateHash: row.id, scope: 'project', workspaceId: 'synthetic',
      content: sample.content, kind: sample.candidateKind, truncated: false,
      evidence: sample.evidence.map((text, index) => ({ observationId: String(index), start: 0, end: text.length, text,
        source: { observationId: String(index), workspaceId: 'synthetic', scope: 'project', source: 'manual',
          speaker: 'user', authority: 'user-stated', createdAt: '2026-09-30T00:00:00Z', excerpt: text } })),
      relatedFacts: sample.related.map((content, index) => ({ id: String(index), version: 1, content })),
    }, { identity: { provider: 'laya', modelRevision: report.ready.revision, templateVersion: 'memory-decision/1', calibrationId: null },
      score: async () => row.result })
    if (annotation.status === 'ready') {
      scored++
      if (annotation.route === 'refine') refine++
    }
  }
  expect(report.routing.groups[`holdout/${language}`]).toMatchObject({
    attempted: selected.length, scored, refine, skipRefinement: scored - refine,
  })
})
