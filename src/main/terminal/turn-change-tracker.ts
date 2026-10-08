import { randomUUID } from 'node:crypto'
import type { TerminalTurnChangesEvent, TurnChangeKind } from '../../shared/ipc/terminal'
import { captureTurnFiles, compareTurnFiles, type TurnFileSnapshot } from './turn-file-snapshot'

interface TerminalTracking {
  cwd: string
  baseline?: TurnFileSnapshot
  activeTurn?: string
  sequence: number
  queue: Promise<void>
}

// Note: adjacent completed turns own independent file baselines — see .agents/notes/terminal/terminal-right-island-turn-history.md
export class TerminalTurnChangeTracker {
  private terminals = new Map<string, TerminalTracking>()

  constructor(
    private readonly publish: (event: TerminalTurnChangesEvent) => void,
    private readonly capture = captureTurnFiles,
    private readonly reportError: (error: unknown) => void = error => console.error('[terminal] turn snapshot failed:', error),
  ) {}

  register(id: string, cwd: string): Promise<void> {
    const state: TerminalTracking = { cwd, sequence: 0, queue: Promise.resolve() }
    this.terminals.set(id, state)
    state.queue = this.capture(cwd).then(snapshot => { state.baseline = snapshot }).catch(this.reportError)
    return state.queue
  }

  start(id: string): void {
    const state = this.terminals.get(id)
    if (state && !state.activeTurn) state.activeTurn = randomUUID()
  }

  finish(id: string, kind: TurnChangeKind, checkpointId: string | null): Promise<void> {
    const state = this.terminals.get(id)
    if (!state?.activeTurn) return Promise.resolve()
    const turnId = state.activeTurn
    state.activeTurn = undefined
    const sequence = ++state.sequence
    const endedAt = new Date().toISOString()
    state.queue = state.queue.then(async () => {
      if (this.terminals.get(id) !== state) return
      const current = await this.capture(state.cwd)
      if (this.terminals.get(id) !== state) return
      const files = state.baseline ? compareTurnFiles(state.baseline, current) : []
      const available = state.baseline !== undefined
      state.baseline = current
      this.publish({
        id, turnId, sequence, kind, checkpointId, endedAt, available,
        files: files.slice(0, 100), fileCount: files.length,
        additions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
        deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
      })
    }).catch(error => {
      if (this.terminals.get(id) !== state) return
      // A failed boundary cannot become a cumulative diff on the next turn.
      state.baseline = undefined
      this.reportError(error)
      this.publish({ id, turnId, sequence, kind, checkpointId, endedAt, available: false, files: [], fileCount: 0, additions: 0, deletions: 0 })
    })
    return state.queue
  }

  unregister(id: string): void {
    this.terminals.delete(id)
  }
}
