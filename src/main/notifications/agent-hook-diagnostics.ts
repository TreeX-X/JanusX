import { app } from 'electron'
import { appendFile, mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { AgentHookCoordinatorEvent, AgentHookPayload } from './agent-hook-types'

type DiagnosticValue = string | number | boolean | null | undefined

export interface AgentHookDiagnosticRecord {
  stage: string
  timestamp?: string
  source?: string
  event?: string
  terminalId?: string
  workspaceId?: string
  engine?: string
  reason?: string
  delivered?: boolean
  detail?: DiagnosticValue
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== ''),
  )
}

function rawKeys(raw: unknown): string[] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  return Object.keys(raw as Record<string, unknown>).slice(0, 24)
}

export function summarizeHookPayload(payload: AgentHookPayload): AgentHookDiagnosticRecord {
  return compactRecord({
    stage: 'bridge-received',
    timestamp: new Date().toISOString(),
    source: payload.source,
    event: payload.event,
    terminalId: payload.terminalId,
    workspaceId: payload.workspaceId,
    detail: payload.cwd,
    rawKeys: rawKeys(payload.raw),
  }) as unknown as AgentHookDiagnosticRecord
}

export function summarizeCoordinatorEvent(event: AgentHookCoordinatorEvent): AgentHookDiagnosticRecord {
  return compactRecord({
    stage: `coordinator-${event.type}`,
    timestamp: new Date().toISOString(),
    source: event.source,
    event: event.hookEvent,
    terminalId: event.terminalId,
    engine: event.engine,
    reason: event.reason,
    delivered: event.delivered,
    detail: event.turnId,
  }) as unknown as AgentHookDiagnosticRecord
}

export class AgentHookDiagnostics {
  private readonly lastPath: string
  private readonly logPath: string

  constructor(baseDir = join(app.getPath('userData'), 'janusx', 'hooks')) {
    this.lastPath = join(baseDir, 'janusx-agent-hook-main-last.json')
    this.logPath = join(baseDir, 'janusx-agent-hook-main.log')
  }

  record(record: AgentHookDiagnosticRecord): void {
    const normalized = compactRecord({
      ...record,
      timestamp: record.timestamp ?? new Date().toISOString(),
    })
    const json = JSON.stringify(normalized)

    void mkdir(dirname(this.lastPath), { recursive: true })
      .then(async () => {
        await writeFile(this.lastPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
        await appendFile(this.logPath, `${json}\n`, 'utf8')
      })
      .catch(() => {})
  }
}
