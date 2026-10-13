import type { UsageLedgerPage, UsageLedgerQuery } from '../../../shared/usage'

/** A fixed row-id boundary makes pagination safe while historical events are imported. */
export async function loadUsageLedger(query: UsageLedgerQuery): Promise<UsageLedgerPage> {
  const records: UsageLedgerPage['records'] = []
  let offset = 0
  let throughId: number | undefined
  for (let page = 0; page < 100; page++) {
    const result = await window.electron.system.listUsageLedger({ ...query, offset, throughId, limit: 2000 })
    if (result.error) throw new Error(result.error)
    records.push(...result.records)
    throughId = result.throughId
    if (result.nextOffset === undefined) return { ...result, records, nextOffset: undefined }
    if (result.nextOffset <= offset) throw new Error('Invalid usage cursor')
    offset = result.nextOffset
  }
  throw new Error('Usage range exceeds the record limit')
}
