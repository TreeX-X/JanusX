// Note: bounded evidence windows preserve ranges without inventing aggregate confidence — see .agents/notes/knowledge/requirements/unified-memory-laya-primary.md
import type { MemoryDecisionInput } from './decision-scorer'

export const DECISION_CHUNK_CHARS = 800
export const DECISION_MAX_CHUNKS = 20
const OVERLAP = 128

export function decisionEvidenceChunks(input: MemoryDecisionInput): MemoryDecisionInput[] | null {
  if (input.evidence.reduce((sum, item) => sum + item.text.length, 0) <= DECISION_CHUNK_CHARS) return [input]
  const chunks: MemoryDecisionInput[] = []
  for (const evidence of input.evidence) {
    if (evidence.end - evidence.start !== evidence.text.length) return null
    let start = 0
    while (start < evidence.text.length) {
      let end = Math.min(start + DECISION_CHUNK_CHARS, evidence.text.length)
      if (end < evidence.text.length) {
        const body = evidence.text.slice(start, end)
        const boundary = Math.max(body.lastIndexOf('\n'), body.lastIndexOf('。'), body.lastIndexOf('. '))
        if (boundary > DECISION_CHUNK_CHARS / 2) end = start + boundary + 1
        if (/[\uD800-\uDBFF]/.test(evidence.text[end - 1]!)) end--
      }
      chunks.push({ ...input, evidence: [{ ...evidence, start: evidence.start + start, end: evidence.start + end, text: evidence.text.slice(start, end) }] })
      if (chunks.length > DECISION_MAX_CHUNKS) return null
      if (end === evidence.text.length) break
      start = end - OVERLAP
      if (/[\uDC00-\uDFFF]/.test(evidence.text[start]!)) start--
    }
  }
  return chunks.length ? chunks : null
}
