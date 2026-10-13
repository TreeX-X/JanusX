import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadUsageLedger } from '../../src/renderer/src/services/usage'
afterEach(() => vi.unstubAllGlobals())
describe('usage ledger client pagination', () => {
  it('uses the first page boundary for subsequent pages and returns one complete result', async () => {
    const listUsageLedger = vi.fn()
      .mockResolvedValueOnce({ records: [{ id: '1' }], sessions: [], nextOffset: 2000, throughId: 3000 })
      .mockResolvedValueOnce({ records: [{ id: '2' }], sessions: [], throughId: 3000 })
    vi.stubGlobal('window', { electron: { system: { listUsageLedger } } })
    expect((await loadUsageLedger({ start: 1000, end: 2000 })).records).toEqual([{ id: '1' }, { id: '2' }])
    expect(listUsageLedger.mock.calls[1][0]).toMatchObject({ offset: 2000, throughId: 3000 })
  })
  it('does not publish a partial total if a later page fails', async () => {
    const listUsageLedger = vi.fn().mockResolvedValueOnce({ records: [{ id: '1' }], sessions: [], nextOffset: 2000, throughId: 3000 }).mockResolvedValueOnce({ records: [], sessions: [], error: 'Disk unavailable' })
    vi.stubGlobal('window', { electron: { system: { listUsageLedger } } })
    await expect(loadUsageLedger({ start: 1000, end: 2000 })).rejects.toThrow('Disk unavailable')
  })
  it('rejects a repeating cursor rather than looping indefinitely', async () => {
    vi.stubGlobal('window', { electron: { system: { listUsageLedger: vi.fn().mockResolvedValue({ records: [], sessions: [], nextOffset: 0 }) } } })
    await expect(loadUsageLedger({ start: 1000, end: 2000 })).rejects.toThrow('Invalid usage cursor')
  })
  it('preserves confirmed records when collection has a warning', async () => {
    vi.stubGlobal('window', { electron: { system: { listUsageLedger: vi.fn().mockResolvedValue({ records: [{ id: '1' }], sessions: [], warning: 'Could not collect latest usage' }) } } })
    expect(await loadUsageLedger({ start: 1000, end: 2000 })).toMatchObject({ records: [{ id: '1' }], warning: 'Could not collect latest usage' })
  })
})
