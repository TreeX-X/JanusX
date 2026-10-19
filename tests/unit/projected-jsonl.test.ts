import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, truncate } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readProjectedJsonl, isCodexAccountingRecord } from '../../src/main/runtime-telemetry/projected-jsonl'
import { readJsonlLinesWithCursor, parseJsonObject } from '../../src/main/runtime-telemetry/history'
import { collectCodexEvents } from '../../src/main/runtime-telemetry/history-usage'

let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'janusx-projected-jsonl-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

async function compare(source: string) {
  const path = join(root, 'session.jsonl')
  await writeFile(path, source)
  const baseline = await readJsonlLinesWithCursor(path, true)
  const candidate = await readProjectedJsonl(path, isCodexAccountingRecord)
  const original = baseline.lines.map(parseJsonObject).filter((v): v is Record<string, unknown> => v !== null)
  expect(candidate.completeBytes).toBe(baseline.completeBytes)
  expect(candidate.size).toBe(baseline.size)
  expect(candidate.values).toEqual(original.filter(isCodexAccountingRecord))
  expect(collectCodexEvents('root', 'id', candidate.values, 1)).toEqual(collectCodexEvents('root', 'id', original, 1))
}

describe('projected history reader compatibility', () => {
  it('handles multibyte/chunk boundaries, CRLF, long rows and model/fork accounting', async () => {
    const count = (ordinal: number, input: number) => ({ type: 'event_msg', ordinal,
      timestamp: '2026-10-14T06:00:00Z', payload: { type: 'token_count', info: {
        total_token_usage: { input_tokens: input, cached_input_tokens: 0, output_tokens: 0, total_tokens: input },
      } } })
    await compare([
      { type: 'session_meta', payload: { id: 'id', subagent_history_start_ordinal: 2 } },
      { type: 'turn_context', payload: { model: '模型一' } }, count(1, 10),
      { type: 'response_item', payload: { text: '中文🙂'.repeat(100_000) } }, count(2, 30),
      { type: 'turn_context', payload: { model: '模型二' } }, count(3, 40),
    ].map(v => JSON.stringify(v)).join('\r\n'))
  })

  it.each(['', '\n', '\r\n  \n', '{"type":"session_meta","payload":{"id":"id"}}',
    '{"type":"turn_context"}\n{"partial":', '{"type":"turn_context"}\ninvalid\n',
    '{"type":"turn_context"}\n[]', '{"type":"turn_context"}\nnull\n',
    '{"type":"turn_context"}\n  ', '\uFEFF{"type":"session_meta"}\n'])('matches legacy rejection and cursor behavior for %j', compare)

  it('yields during a large file and propagates cancellation without a partial result', async () => {
    const path = join(root, 'large.jsonl')
    await writeFile(path, (JSON.stringify({ type: 'response_item', text: 'x'.repeat(2048) }) + '\n').repeat(2000))
    const controller = new AbortController()
    let visited = 0
    await expect(readProjectedJsonl(path, () => {
      if (++visited === 1) setImmediate(() => controller.abort())
      return false
    }, controller.signal)).rejects.toThrow()
    expect(visited).toBeLessThan(2000)
  })

  it('rejects oversized sources before parsing and does not accept corruption in discarded rows', async () => {
    const path = join(root, 'oversized.jsonl')
    await writeFile(path, '')
    await truncate(path, 64 * 1024 * 1024 + 1)
    expect(await readProjectedJsonl(path, isCodexAccountingRecord)).toEqual({
      values: [], completeBytes: 0, size: 64 * 1024 * 1024 + 1,
    })
    await compare('{"type":"session_meta","payload":{"id":"id"}}\n{"type":"response_item","invalid":}\n')
  })
})
