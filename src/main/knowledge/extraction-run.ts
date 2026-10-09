// Note: coverage and recoverable curation precede candidate admission — see .agents/notes/knowledge/hook-evidence-extraction.md
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { MemoryFact } from '../../shared/knowledge'
import type { KnowledgeModelRequest } from './knowledge-models'
import { writeFileAtomic } from '../lib/atomic-file'
import { knowledgeRootPath } from './constants'
import { COVERAGE_SYSTEM, coverageOutput, CURATION_SYSTEM, curationOutput, EXTRACTION_SYSTEM, extractionOutput,
  relevantKnowledge, type ExtractionEvidence } from './extraction-context'

type Fact = z.infer<typeof extractionOutput>['facts'][number]
type Request = (system: string, input: unknown) => KnowledgeModelRequest
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const factId = (fact: Fact) => digest([fact.kind, fact.content.trim().replace(/\s+/g, ' ')])
const unique = (facts: Fact[]) => {
  const result = new Map<string, Fact>()
  for (const fact of facts) {
    const id = factId(fact), previous = result.get(id)
    if (!previous) result.set(id, structuredClone(fact))
    else previous.citations = [...new Map([...previous.citations, ...fact.citations].map(citation => [JSON.stringify(citation), citation])).values()]
  }
  return [...result.values()]
}
const journalSchema = z.object({ version: z.literal(1), steps: z.record(z.unknown()), records: z.array(z.unknown()) }).strict()
export class ExtractionReviewRequired extends Error {}

export async function resetExtractionCheckpoint(taskId: string): Promise<void> {
  const path = join(knowledgeRootPath(), 'processing', 'extraction', `${taskId}.json`)
  try {
    const journal = journalSchema.parse(JSON.parse(await readFile(path, 'utf8')))
    journal.steps = {}
    await writeFileAtomic(path, JSON.stringify(journal) + '\n')
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}

/** Completed calls survive interruption. Rejected selections remain evidence, never accepted facts. */
export async function runExtraction(options: {
  taskId: string; chunks: ExtractionEvidence[][]; known: MemoryFact[]; request: Request;
  json(request: KnowledgeModelRequest): Promise<unknown>; signal: AbortSignal
}): Promise<{ facts: Fact[]; records: unknown[] }> {
  const { chunks, known, request, json, signal } = options
  const path = join(knowledgeRootPath(), 'processing', 'extraction', `${options.taskId}.json`)
  let journal: z.infer<typeof journalSchema> = { version: 1, steps: {}, records: [] }
  try { journal = journalSchema.parse(JSON.parse(await readFile(path, 'utf8'))) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new ExtractionReviewRequired('extraction-journal-invalid') }
  const save = () => writeFileAtomic(path, JSON.stringify(journal) + '\n')
  let calls = 0
  const invoke = async (system: string, input: unknown): Promise<unknown> => {
    signal.throwIfAborted()
    if (++calls > 512) throw new ExtractionReviewRequired('extraction-call-budget-exceeded')
    return json(request(system, input))
  }
  const cached = async <T>(system: string, input: unknown, validate: (raw: unknown) => T): Promise<T> => {
    const key = digest([system, input])
    if (key in journal.steps) return validate(journal.steps[key])
    const result = validate(await invoke(system, input))
    journal.steps[key] = result
    await save()
    return result
  }
  const allEvidence = chunks.flat(), finalEvidence = chunks[chunks.length - 1] ?? []
  const quotesValid = (facts: Fact[], evidence = allEvidence) => facts.every(fact => fact.citations.every(citation =>
    citation.quote.trim() && evidence.some(part => part.id === citation.observationId && part.content.includes(citation.quote))))
  const existing = (query: string, prior: Fact[] = []) => {
    let size = 0
    const corpus = [...known.map(({ id, content, kind, concepts, files }) => ({ id, content, kind, concepts, files })),
      ...prior.map(fact => ({ id: `draft:${factId(fact)}`, content: fact.content, kind: fact.kind, concepts: fact.concepts, files: [] }))]
    return relevantKnowledge(corpus, query).filter(fact => {
      if (size + fact.content.length > 6000) return false
      size += fact.content.length; return true
    }).map(fact => ({ id: fact.id, content: fact.content, kind: fact.kind }))
  }
  const split = (evidence: ExtractionEvidence[]): ExtractionEvidence[][] => {
    if (evidence.length > 1) { const middle = Math.ceil(evidence.length / 2); return [evidence.slice(0, middle), evidence.slice(middle)] }
    const part = evidence[0]
    if (!part || part.content.length < 128) throw new ExtractionReviewRequired('extraction-incomplete-coverage')
    const middle = Math.ceil(part.content.length / 2)
    const overlap = Math.min(100, Math.floor(part.content.length / 8))
    return [[{ ...part, content: part.content.slice(0, middle + overlap) }],
      [{ ...part, offset: part.offset + middle - overlap, content: part.content.slice(middle - overlap) }]]
  }
  const extract = async (evidence: ExtractionEvidence[], depth = 0): Promise<Fact[]> => {
    const input = { evidence, existingKnowledge: existing(evidence.map(part => part.content).join('\n')),
      finalEvidence: finalEvidence.filter(part => !evidence.some(current => current.id === part.id && current.offset === part.offset && current.content === part.content)) }
    try {
      const result = await cached(EXTRACTION_SYSTEM, input, raw => {
        const output = extractionOutput.parse(raw)
        if (!output.complete || output.facts.length === 20) throw new ExtractionReviewRequired('extraction-incomplete-coverage')
        return output
      })
      if (quotesValid(result.facts, [...evidence, ...finalEvidence])) return result.facts
      const repaired = extractionOutput.parse(await invoke(EXTRACTION_SYSTEM + '\nCorrect all citations: copy one contiguous exact source substring. Return the entire corrected batch.', { ...input, previousOutput: result }))
      if (!quotesValid(repaired.facts, [...evidence, ...finalEvidence])) throw new ExtractionReviewRequired('extraction-invalid-citation')
      if (!repaired.complete || repaired.facts.length === 20) throw new ExtractionReviewRequired('extraction-incomplete-coverage')
      return repaired.facts
    } catch (error) {
      if (depth >= 8 || !(error instanceof Error) || !['extraction-incomplete-coverage', 'incomplete-model-output', 'model-input-exceeds-context'].includes(error.message)) throw error
      const results: Fact[] = []
      for (const part of split(evidence)) results.push(...await extract(part, depth + 1))
      return results
    }
  }
  let drafts: Fact[] = []
  for (const evidence of chunks) drafts.push(...await extract(evidence))
  drafts = unique(drafts)
  const curate = async (inputFacts: Fact[], coverageRepair?: unknown, prior: Fact[] = []): Promise<Fact[]> => {
    const kept: Fact[] = []
    for (let offset = 0; offset < inputFacts.length; offset += 10) {
      const candidates = structuredClone(inputFacts.slice(offset, offset + 10))
      const existingKnowledge = existing(candidates.map(fact => fact.content).join('\n'), [...prior, ...kept])
      const evidence = allEvidence.flatMap(part => candidates.flatMap(fact => fact.citations.filter(citation => citation.observationId === part.id && part.content.includes(citation.quote)).map(citation => {
        const start = Math.max(0, part.content.indexOf(citation.quote) - 500)
        return { ...part, offset: part.offset + start, content: part.content.slice(start, start + citation.quote.length + 1000) }
      })))
      const context = [...new Map(evidence.map(part => [digest(part), part])).values()]
      let selected: z.infer<typeof curationOutput>
      try {
        selected = await cached(CURATION_SYSTEM, { candidates, existingKnowledge, evidence: context, finalEvidence, coverageRepair }, raw => {
          const output = curationOutput.parse(raw)
          if (!output.complete || output.selections.length !== candidates.length || new Set(output.selections.map(item => item.index)).size !== candidates.length
            || output.selections.some(item => item.index >= candidates.length)) throw new ExtractionReviewRequired('extraction-incomplete-selection')
          return output
        })
      } catch (error) {
        if (candidates.length < 2 || !(error instanceof Error) || !['model-input-exceeds-context', 'incomplete-model-output'].includes(error.message)) throw error
        const middle = Math.ceil(candidates.length / 2)
        kept.push(...await curate(candidates.slice(0, middle), coverageRepair, [...prior, ...kept]))
        kept.push(...await curate(candidates.slice(middle), coverageRepair, [...prior, ...kept]))
        continue
      }
      const selections = selected.selections
      journal.records.push({ phase: 'curation', candidates: structuredClone(candidates), selections }); await save()
      for (const item of selections) {
        const fact = candidates[item.index]!
        if (item.content != null) {
          if (item.action !== 'keep' || item.equivalentTo) throw new ExtractionReviewRequired('extraction-invalid-curation')
          fact.content = item.content
        }
        if (item.equivalentTo) {
          const knownFact = existingKnowledge.find(row => row.id === item.equivalentTo)
          if (item.action !== 'keep' || !knownFact || knownFact.kind !== fact.kind) throw new ExtractionReviewRequired('extraction-invalid-equivalence')
          fact.content = knownFact.content
        }
        if (item.action === 'duplicate') {
          const target = selections.find(other => other.index === item.duplicateOf && other.action === 'keep')
          if (!target || target.index === item.index) throw new ExtractionReviewRequired('extraction-invalid-duplicate')
          candidates[target.index]!.citations = unique([{ ...fact, content: candidates[target.index]!.content, kind: candidates[target.index]!.kind }, candidates[target.index]!])[0]!.citations
        } else if (item.duplicateOf !== null) throw new ExtractionReviewRequired('extraction-invalid-duplicate')
      }
      kept.push(...candidates.filter((_fact, index) => selections.some(item => item.index === index && item.action === 'keep')))
    }
    return unique(kept)
  }
  let facts = await curate(drafts)
  for (let round = 0; round < 3; round++) {
    const missing: Fact[] = [], invalid = new Set<string>()
    for (const evidence of chunks) {
      const ids = new Set(evidence.map(part => part.id))
      const retained = facts.map(fact => ({ ...fact, id: factId(fact) }))
      // Every claim is checked against every evidence chunk; paging never truncates the claim set.
      const pages = Math.max(1, Math.ceil(retained.length / 10))
      for (let page = 0; page < pages; page++) {
        const candidates = retained.slice(page * 10, page * 10 + 10)
        const parts = evidence.map(part => ({ ...part, key: `${part.id}:${part.offset}` }))
        const result = coverageOutput.parse(await invoke(COVERAGE_SYSTEM, { evidence: parts, finalEvidence, candidates,
          otherRetained: retained.filter(fact => !candidates.includes(fact) && fact.citations.some(citation => ids.has(citation.observationId))).map(fact => ({ id: fact.id, content: fact.content })),
          discarded: drafts.filter(fact => !facts.some(kept => factId(kept) === factId(fact)) && fact.citations.some(citation => ids.has(citation.observationId))),
        }))
        journal.records.push({ phase: 'coverage', round, evidence: parts.map(part => part.key), result }); await save()
        if (!result.complete || !parts.every(part => result.coveredEvidenceIds.includes(part.key))) throw new ExtractionReviewRequired('extraction-incomplete-coverage')
        if (result.invalidCandidateIds.some(id => !retained.some(fact => fact.id === id))) throw new ExtractionReviewRequired('extraction-invalid-coverage')
        if (!quotesValid(result.missing, [...evidence, ...finalEvidence])) throw new ExtractionReviewRequired('extraction-invalid-citation')
        missing.push(...result.missing)
        result.invalidCandidateIds.forEach(id => invalid.add(id))
      }
    }
    if (!missing.length && !invalid.size) {
      if (!quotesValid(facts)) throw new ExtractionReviewRequired('extraction-invalid-citation')
      return { facts, records: journal.records }
    }
    if (round === 2) throw new ExtractionReviewRequired('extraction-coverage-unresolved')
    drafts = unique([...facts.filter(fact => !invalid.has(factId(fact))), ...missing])
    facts = await curate(drafts, { round, missing, invalidCandidateIds: [...invalid], instruction: 'Independent coverage found these omissions or invalid claims. Preserve all supported durable conditions when reconsidering curation.' })
  }
  throw new ExtractionReviewRequired('extraction-incomplete-coverage')
}
