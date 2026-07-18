import { terminalManager } from '../terminal/manager'
import { companionSessionState, type CompanionSessionState, type CompanionTerminalMetadata } from './session-state'

export interface CompanionTerminalControl {
  getTerminal(terminalId: string): CompanionTerminalMetadata | undefined
  submitLine(terminalId: string, text: string): Promise<void> | void
  interrupt(terminalId: string): Promise<void> | void
  hasPendingApproval(terminalId: string): boolean
  respondToApproval(terminalId: string, approved: boolean): Promise<void> | void
  clearPendingApproval(terminalId: string): void
}

export class MainProcessTerminalControl implements CompanionTerminalControl {
  constructor(
    private readonly submitLineTransaction: (terminalId: string, text: string) => void,
    private readonly sessions: CompanionSessionState = companionSessionState,
  ) {}

  getTerminal(terminalId: string): CompanionTerminalMetadata | undefined {
    if (!terminalManager.getInstance(terminalId)) return undefined
    return this.sessions.getTerminal(terminalId)
  }

  submitLine(terminalId: string, text: string): void {
    this.submitLineTransaction(terminalId, text)
  }

  interrupt(terminalId: string): void {
    terminalManager.write(terminalId, '\x03')
  }

  hasPendingApproval(terminalId: string): boolean {
    return this.sessions.hasPendingApproval(terminalId)
  }

  respondToApproval(terminalId: string, approved: boolean): void {
    terminalManager.write(terminalId, approved ? 'y\r' : 'n\r')
    this.sessions.clearPendingApproval(terminalId)
  }

  clearPendingApproval(terminalId: string): void {
    this.sessions.clearPendingApproval(terminalId)
  }
}
