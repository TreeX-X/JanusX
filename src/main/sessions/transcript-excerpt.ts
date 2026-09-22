// Note: orca-style transcript tail read for turn answer prose — see
// .agents/notes/implemented/feature/2026-09-22-session-conversation-content.md
import { open } from 'node:fs/promises'

// Orca parity: backward chunk reads with a hard cap; full history never loads.
const TRANSCRIPT_TAIL_BYTES = 64 * 1024
const EXCERPT_MAX_CHARS = 500

interface ClaudeContentBlock {
  type?: string
  text?: string
}

function claudeTextOf(record: unknown): string | undefined {
  if (!record || typeof record !== 'object') return undefined
  const message = (record as { message?: unknown }).message
  if (!message || typeof message !== 'object') return undefined
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  const texts = content
    .filter(
      (block): block is ClaudeContentBlock =>
        !!block && typeof block === 'object' && (block as ClaudeContentBlock).type === 'text',
    )
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('')
    .trim()
  return texts || undefined
}

function lastClaudeAssistantText(tail: string): string | undefined {
  const lines = tail.split('\n')
  // First line may be a partial record cut by the tail window; skip it when
  // more than one line exists.
  const start = lines.length > 1 ? 1 : 0
  for (let i = lines.length - 1; i >= start; i -= 1) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      const record = JSON.parse(line) as { type?: string }
      if (record.type !== 'assistant') continue
      const text = claudeTextOf(record)
      if (text) return text
    } catch {
      // Mixed or corrupt lines never block the scan.
    }
  }
  return undefined
}

async function readTail(path: string, maxBytes: number): Promise<string | undefined> {
  let handle
  try {
    handle = await open(path, 'r')
  } catch {
    return undefined
  }
  try {
    const size = (await handle.stat()).size
    if (size <= 0) return undefined
    const length = Math.min(maxBytes, size)
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, size - length)
    if (bytesRead <= 0) return undefined
    return buffer.subarray(0, bytesRead).toString('utf-8')
  } catch {
    return undefined
  } finally {
    await handle.close().catch(() => undefined)
  }
}

/**
 * Best-effort answer excerpt for a finished turn. Reads only the transcript
 * tail with hard caps and never throws: every failure yields undefined so a
 * missing or unreadable transcript cannot block turn recording. Phase 1
 * covers claude JSONL writers; every other engine skips.
 */
export async function readAssistantExcerpt(
  transcriptPath: string | undefined,
  engine: string,
): Promise<string | undefined> {
  try {
    if (engine !== 'claude') return undefined
    const path = transcriptPath?.trim()
    if (!path) return undefined
    const tail = await readTail(path, TRANSCRIPT_TAIL_BYTES)
    if (!tail) return undefined
    const text = lastClaudeAssistantText(tail)
    if (!text) return undefined
    return text.length > EXCERPT_MAX_CHARS ? text.slice(0, EXCERPT_MAX_CHARS) : text
  } catch {
    return undefined
  }
}
