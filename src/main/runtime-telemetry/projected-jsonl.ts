import { open } from 'node:fs/promises'
import { setImmediate as yieldToEventLoop } from 'node:timers/promises'

type JsonRecord = Record<string, unknown>
const MAX_SOURCE_BYTES = 64 * 1024 * 1024
const CHUNK_BYTES = 256 * 1024

/** Validate every row, retain only the accounting projection. Do not publish
 * partial observations if a completed row is corrupt or the source truncates.
 * Memory grows with the chunk, longest row and selected accounting rows, not
 * the full source text and all parsed message bodies simultaneously.
 * Like the existing reader, accept a valid last row without a newline and
 * retry an incomplete last row on the next scan. */
export async function readProjectedJsonl(
  path: string,
  keep: (value: JsonRecord) => boolean,
  signal?: AbortSignal,
): Promise<{ values: JsonRecord[]; completeBytes: number; size: number }> {
  signal?.throwIfAborted()
  let handle: Awaited<ReturnType<typeof open>> | undefined
  let size = 0
  try {
    handle = await open(path, 'r')
    size = (await handle.stat()).size
    if (size > MAX_SOURCE_BYTES) return { values: [], completeBytes: 0, size }
    const values: JsonRecord[] = []
    const chunk = Buffer.allocUnsafe(Math.min(CHUNK_BYTES, size))
    let pending: Buffer[] = []
    let pendingBytes = 0
    let position = 0
    let completeBytes = 0
    const accept = (bytes: Buffer): boolean => {
      const line = bytes.toString('utf8')
      if (!line.trim()) return true
      try {
        const value: unknown = JSON.parse(line)
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false
        if (keep(value as JsonRecord)) values.push(value as JsonRecord)
        return true
      } catch { return false }
    }
    while (position < size) {
      signal?.throwIfAborted()
      const { bytesRead } = await handle.read(chunk, 0, Math.min(chunk.length, size - position), position)
      if (!bytesRead) return { values: [], completeBytes: 0, size }
      let start = 0
      for (let end = chunk.indexOf(10, start); end >= 0 && end < bytesRead; end = chunk.indexOf(10, start)) {
        const part = chunk.subarray(start, end)
        const row = pendingBytes ? Buffer.concat([...pending, part], pendingBytes + part.length) : part
        if (!accept(row)) return { values: [], completeBytes: 0, size }
        pending = []
        pendingBytes = 0
        completeBytes = position + end + 1
        start = end + 1
      }
      if (start < bytesRead) {
        const tail = Buffer.from(chunk.subarray(start, bytesRead))
        pending.push(tail)
        pendingBytes += tail.length
      }
      position += bytesRead
      // Async I/O alone is not a CPU budget; explicitly yield between batches.
      await yieldToEventLoop()
    }
    signal?.throwIfAborted()
    if (!pendingBytes || accept(Buffer.concat(pending, pendingBytes))) completeBytes = size
    return { values, completeBytes, size }
  } catch {
    signal?.throwIfAborted()
    return { values: [], completeBytes: 0, size }
  } finally {
    await handle?.close()
  }
}

export function isCodexAccountingRecord(value: JsonRecord): boolean {
  if (value.type === 'session_meta' || value.type === 'turn_context') return true
  const payload = value.payload as JsonRecord | null | undefined
  return value.type === 'event_msg' && payload?.type === 'token_count'
}
