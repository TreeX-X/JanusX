import type { HostSynthesis, HostSynthesisConflict, RoundtableFact, RoundtableState } from './events'

const NO_CONCLUSION = '主持人尚未形成最终结论。'

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'are', 'was', 'were',
  'will', 'would', 'should', 'could', 'into', 'about', 'their', 'there', 'which', 'when',
  'what', 'how', 'why', 'not', 'but', 'our', 'your', 'they', 'them', 'then', 'than', 'also',
  'such', 'only', 'over', 'under', 'more', 'most', 'some', 'any', 'each', 'other', 'new',
  'use', 'used', 'using', 'via', 'per', 'etc', 'without', 'between', 'through',
])

function extractKeywords(text: string): Set<string> {
  const keys = new Set<string>()
  for (const word of text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter(Boolean)) {
    if (/^[\u4e00-\u9fff]+$/.test(word)) {
      // CJK has no word boundaries: fall back to character bigrams.
      const chars = [...word]
      if (chars.length < 2) continue
      for (let i = 0; i < chars.length - 1; i += 1) {
        const pair = `${chars[i] ?? ''}${chars[i + 1] ?? ''}`
        if (pair.length === 2) keys.add(pair)
      }
    } else {
      if (word.length < 3 || STOPWORDS.has(word)) continue
      keys.add(word)
    }
  }
  return keys
}

function keywordOverlap(left: Set<string>, right: Set<string>): number {
  let count = 0
  for (const key of left) if (right.has(key)) count += 1
  return count
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

function dedup(items: string[], limit: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const key = normalize(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item.trim())
    if (result.length >= limit) break
  }
  return result
}

function firstSentence(text: string, limit = 200): string {
  const sentence = text.split(/[。\n.!?！？]/).map((part) => part.trim()).find(Boolean) ?? ''
  return sentence ? sentence.slice(0, limit) : ''
}

function isConcern(fact: RoundtableFact): boolean {
  return fact.status === 'concern' || fact.kind === 'risk' || fact.kind === 'question'
}

function isProposal(fact: RoundtableFact): boolean {
  return fact.status === 'proposal' || fact.status === 'pending-validation' || fact.status === 'confirmed'
}

/**
 * Keywords come from the fact body; titles are card metadata
 * ("refiner result") and would otherwise pair every card with every other.
 * Falls back to the title only when the body carries no keywords.
 */
function factKeywords(fact: RoundtableFact): Set<string> {
  const body = extractKeywords(fact.content)
  return body.size ? body : extractKeywords(fact.title)
}

function mergeConflicts(facts: RoundtableFact[], roundNumber: number, limit = 5): HostSynthesisConflict[] {
  const concerns = facts.filter((fact) => fact.status !== 'rejected' && fact.status !== 'resolved' && isConcern(fact))
  const proposals = facts.filter((fact) => fact.status !== 'rejected' && fact.status !== 'resolved' && !isConcern(fact) && isProposal(fact))
  const candidates: Array<{ overlap: number; conflict: HostSynthesisConflict }> = []
  concerns.forEach((concern, concernIndex) => {
    const concernKeys = factKeywords(concern)
    if (!concernKeys.size) return
    proposals.forEach((proposal) => {
      if (proposal.id === concern.id) return
      const overlap = keywordOverlap(concernKeys, factKeywords(proposal))
      if (overlap < 2) return
      candidates.push({
        overlap,
        conflict: {
          id: `conflict-${roundNumber}-${concernIndex}-${proposal.id}`,
          topic: concern.title || concern.content.slice(0, 40),
          factIds: [concern.id, proposal.id],
          status: 'open',
          sourceEventIds: [...new Set([...concern.sourceEventIds, ...proposal.sourceEventIds])],
        },
      })
    })
  })
  candidates.sort((left, right) => right.overlap - left.overlap)
  return candidates.slice(0, limit).map((item) => item.conflict)
}

/**
 * Deterministic host synthesis:归纳 shared facts into an independent
 * human-facing draft. Pure function, no model calls, fully testable.
 * Missing sources never block synthesis; facts without sourceEventIds are
 * still included and simply contribute no source links.
 */
export function synthesizeHostDraft(state: RoundtableState, options: { final?: boolean } = {}): HostSynthesis {
  const facts = state.facts.filter((fact) => fact.status !== 'rejected')
  const hostCards = state.cards.filter((card) => card.role === 'host')
  const latestHostSummary = hostCards.length ? (hostCards[hostCards.length - 1]?.summary ?? '') : ''
  const confirmedDecisions = facts.filter((fact) => fact.kind === 'decision' && fact.status === 'confirmed')
  const decisions = dedup(confirmedDecisions.map((fact) => fact.content), 5)
  const conclusion = firstSentence(latestHostSummary) || decisions[0] || NO_CONCLUSION
  const evidence = dedup(facts.filter((fact) => fact.kind === 'evidence').map((fact) => fact.content), 5)
  const pending = dedup(facts.filter((fact) => fact.status === 'proposal' || fact.status === 'pending-validation').map((fact) => fact.content), 5)
  const risks = dedup(facts.filter((fact) => fact.kind === 'risk' || fact.kind === 'question').map((fact) => fact.content), 5)
  const actions = dedup(facts.filter((fact) => fact.kind === 'action').map((fact) => fact.content), 5)
  const conflicts = mergeConflicts(facts, state.roundNumber)
  const sourceEventIds = [...new Set([
    ...facts.flatMap((fact) => fact.sourceEventIds),
    ...state.cards.flatMap((card) => card.sourceEventIds),
  ])]
  return {
    roundNumber: state.roundNumber,
    final: options.final ?? false,
    conclusion, decisions, evidence, pending, conflicts, risks, actions,
    sourceEventIds,
    createdAt: new Date().toISOString(),
  }
}
