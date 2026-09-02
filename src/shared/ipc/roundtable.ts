import type { RoundtableEventEnvelope, RoundtableState } from '../roundtable/events'

export const ROUNDTABLE_CHANNELS = {
  start: 'roundtable:start', advance: 'roundtable:advance', end: 'roundtable:end', state: 'roundtable:state', restore: 'roundtable:restore', export: 'roundtable:export', event: 'roundtable:event',
} as const

export interface RoundtableAPI {
  start(input: string): Promise<RoundtableState>
  advance(sessionId: string, input?: string): Promise<RoundtableState>
  end(sessionId: string): Promise<RoundtableState>
  getState(sessionId: string): Promise<RoundtableState | null>
  restore(sessionId: string): Promise<RoundtableState | null>
  export(sessionId: string): Promise<string>
  onEvent(callback: (event: RoundtableEventEnvelope) => void): () => void
}
