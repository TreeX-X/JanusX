import type { BrowserWindow } from 'electron'
import type {
  SubAgentRun,
  SubAgentRunCreateInput,
  SubAgentRunRemovedEvent,
  SubAgentRunUpdateInput,
  SubAgentRunUpdatedEvent,
} from '../../shared/subAgentRun'

function nowIso(): string {
  return new Date().toISOString()
}

function sendToRenderer(mainWindow: BrowserWindow | null, channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

export class SubAgentRunRegistry {
  private runs = new Map<string, SubAgentRun>()
  private mainWindow: BrowserWindow | null = null

  setMainWindow(mainWindow: BrowserWindow | null): void {
    this.mainWindow = mainWindow
  }

  private normalizeRun(input: SubAgentRunCreateInput): SubAgentRunCreateInput {
    const parent = input.parentRunId ? this.runs.get(input.parentRunId) : undefined
    const rootTerminalId = input.rootTerminalId ?? parent?.rootTerminalId ?? input.terminalId
    const rootRunId = input.rootRunId ?? parent?.rootRunId ?? input.parentRunId ?? input.id
    const missionId = input.missionId ?? parent?.missionId ?? rootTerminalId ?? rootRunId

    return {
      ...input,
      rootRunId,
      rootTerminalId,
      missionId,
      workspaceId: input.workspaceId ?? parent?.workspaceId,
      workspacePath: input.workspacePath ?? parent?.workspacePath,
    }
  }

  createRun(input: SubAgentRunCreateInput): SubAgentRun {
    const timestamp = nowIso()
    const normalized = this.normalizeRun(input)
    const run: SubAgentRun = {
      ...normalized,
      startedAt: normalized.startedAt ?? timestamp,
      updatedAt: normalized.updatedAt ?? timestamp,
    }
    this.runs.set(run.id, run)
    this.emitUpdated(run)
    return run
  }

  upsertRun(input: SubAgentRunCreateInput): SubAgentRun {
    const existing = this.runs.get(input.id)
    if (!existing) return this.createRun(input)
    return this.updateRun(input.id, input) ?? existing
  }

  updateRun(id: string, patch: SubAgentRunUpdateInput): SubAgentRun | null {
    const existing = this.runs.get(id)
    if (!existing) return null
    const normalized = this.normalizeRun({
      ...existing,
      ...patch,
      id,
      meta: patch.meta ? { ...existing.meta, ...patch.meta } : existing.meta,
    })
    const run: SubAgentRun = {
      ...normalized,
      startedAt: normalized.startedAt ?? existing.startedAt,
      updatedAt: nowIso(),
    }
    this.runs.set(id, run)
    this.emitUpdated(run)
    return run
  }

  finishRun(id: string, status: SubAgentRun['status'], lastEvent?: string): SubAgentRun | null {
    return this.updateRun(id, { status, lastEvent })
  }

  getRun(id: string): SubAgentRun | undefined {
    return this.runs.get(id)
  }

  getRunByTerminalId(terminalId: string): SubAgentRun | undefined {
    return Array.from(this.runs.values()).find((run) => run.terminalId === terminalId)
  }

  listRuns(): SubAgentRun[] {
    return Array.from(this.runs.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  removeRun(id: string): void {
    if (!this.runs.delete(id)) return
    const payload: SubAgentRunRemovedEvent = { id }
    sendToRenderer(this.mainWindow, 'subagent-run:removed', payload)
  }

  clear(): void {
    for (const id of this.runs.keys()) {
      this.removeRun(id)
    }
  }


  private emitUpdated(run: SubAgentRun): void {
    const payload: SubAgentRunUpdatedEvent = { run }
    sendToRenderer(this.mainWindow, 'subagent-run:updated', payload)
  }
}

export const subAgentRunRegistry = new SubAgentRunRegistry()
