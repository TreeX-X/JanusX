import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { watch } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { UsageLedger } from '../../src/main/runtime-telemetry/usage-ledger'

let root: string
let file: string
let ledger: UsageLedger
const sample = (at: number, input: number) => ({ engine: 'codex' as const, namespace: '/native', sessionId: 's',
  mode: 'cumulative' as const, collectedAt: at, counters: { inputTokens: input, outputTokens: 0, totalTokens: input } })
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'janusx-ledger-pressure-'))
  file = join(root, 'usage.sqlite')
  ledger = new UsageLedger(() => file)
  ledger.record(sample(1000, 100))
})
afterEach(async () => { ledger.close(); await rm(root, { recursive: true, force: true }) })

describe('usage ledger pressure and connection recovery', () => {
  it('does not change the database or emit filesystem events during 1000 unchanged queries', async () => {
    await delay(30)
    const events: unknown[] = []
    const watcher = watch(root, (_kind, path) => events.push(path))
    try {
      const before = await Promise.all([file, file + '-wal'].map(path => stat(path, { bigint: true })))
      for (let i = 0; i < 1000; i++) {
        ledger.sessionState('codex', '/native', 's')
        ledger.sourceCheckpoint('codex', '/native', 's')
      }
      await delay(30)
      const after = await Promise.all([file, file + '-wal'].map(path => stat(path, { bigint: true })))
      expect(after.map(value => [value.size, value.mtimeNs])).toEqual(before.map(value => [value.size, value.mtimeNs]))
      expect(events).toEqual([])
    } finally { watcher.close() }
  })

  it('reads through a competing WAL writer, bounds failed writes and retries without losing the baseline', () => {
    const writer = new DatabaseSync(file)
    try {
      writer.exec('BEGIN IMMEDIATE')
      expect(ledger.sourceCheckpoint('codex', '/native', 's')?.updatedAt).toBe(1000)
      expect(ledger.list({ start: 0, end: 4000 }).records).toEqual([])
      const start = performance.now()
      expect(() => ledger.record(sample(2000, 120))).toThrow(/locked|busy/i)
      expect(performance.now() - start).toBeLessThan(1500)
      writer.exec('ROLLBACK')
      ledger.record(sample(3000, 125))
      expect(ledger.list({ start: 0, end: 4000 }).records.map(value => value.totalTokens)).toEqual([25])
    } finally { writer.close() }
  })

  it('rolls back failed queries before reusing the connection and supports explicit reopen', () => {
    expect(() => ledger.list({ start: 0, end: 4000, throughId: -1 })).toThrow('Invalid usage cursor')
    ledger.record(sample(2000, 110))
    ledger.close()
    ledger.close()
    expect(ledger.list({ start: 0, end: 4000 }).records.map(value => value.totalTokens)).toEqual([10])
  })
})
