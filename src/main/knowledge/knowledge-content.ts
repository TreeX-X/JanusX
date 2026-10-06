// Note: execution envelopes and source listings remain evidence, not knowledge statements — see .agents/notes/2026-10-06-memory-noise-progress-audit--81b578b4.md
import type { Observation } from '../../shared/knowledge'
import { isUserStatement } from './memory-evidence'
import { isRuntimeNotification } from './personal-memory-content'

/** Includes truncated copies: a transport header is still not a self-contained fact. */
export function isRawKnowledgeContent(content: string): boolean {
  const text = content.trim()
  if (isRuntimeNotification(text)) return true
  if (/^Script (?:completed|running|failed)\b[^\n]*\r?\n(?:Wall time|Output:)/.test(text)) return true
  if (/^Chunk ID:\s*\S+\s+Wall time:/i.test(text)) return true
  if (/^[{[]/.test(text)) {
    const header = text.slice(0, 1500)
    if (/"chunk_id"\s*:/.test(header) && /"wall_time_seconds"\s*:/.test(header)
      && /"(?:output|exit_code|session_id|original_token_count)"\s*:/.test(header)) return true
  }
  // Tab-separated source rows and grep/sed line prefixes are quoted source, not prose.
  return /^\d+\t\s*\S/.test(text)
    || /^\d+[:-]\s*(?:---|schema:\s*harness-note\/1)(?:\r?\n|$)/.test(text)
    || /^\d+[:-]\s*(?:\/\*|\/\/|@media\b|(?:import|export|const|let|function|class|interface)\b)/.test(text)
}

/** Structured git/checkpoint/analysis records keep their rules; raw conversations need attribution. */
export function isRawConversationEvidence(observation: Observation): boolean {
  return observation.type === 'tool-result'
    || observation.type === 'tool-call'
    || observation.type === 'conversation-turn' && !isUserStatement(observation)
}
