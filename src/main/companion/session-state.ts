import type { AgentHookPayload } from '../notifications/agent-hook-types'

export type CompanionEngine = 'claude' | 'codex' | 'opencode'

export interface CompanionTerminalMetadata {
  terminalId: string
  engine: CompanionEngine
  workspaceId: string
  cwd: string
}

export class CompanionSessionState {
  private readonly terminals = new Map<string, CompanionTerminalMetadata>()
  private readonly pendingApprovals = new Set<string>()

  registerTerminal(metadata: CompanionTerminalMetadata): void {
    this.terminals.set(metadata.terminalId, metadata)
  }

  unregisterTerminal(terminalId: string): void {
    this.terminals.delete(terminalId)
    this.pendingApprovals.delete(terminalId)
  }

  getTerminal(terminalId: string): CompanionTerminalMetadata | undefined {
    return this.terminals.get(terminalId)
  }

  setPendingApproval(terminalId: string): void {
    if (this.terminals.has(terminalId)) this.pendingApprovals.add(terminalId)
  }

  clearPendingApproval(terminalId: string): void {
    this.pendingApprovals.delete(terminalId)
  }

  hasPendingApproval(terminalId: string): boolean {
    return this.pendingApprovals.has(terminalId)
  }

  handleHookPayload(payload: AgentHookPayload): void {
    if (!payload.terminalId) return
    if (payload.event === 'PermissionRequest' || payload.event === 'permission.asked') {
      this.setPendingApproval(payload.terminalId)
      return
    }
    if (['Stop', 'SessionEnd', 'TaskCompleted', 'session.idle', 'session.error'].includes(payload.event)) {
      this.clearPendingApproval(payload.terminalId)
    }
  }

  clear(): void {
    this.terminals.clear()
    this.pendingApprovals.clear()
  }
}

export const companionSessionState = new CompanionSessionState()
