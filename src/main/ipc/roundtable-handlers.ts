import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { ROUNDTABLE_CHANNELS } from '../../shared/ipc/roundtable'
import { roundtableService } from '../roundtable/service'

let subscribed = false
function validateStartInput(input: unknown): { prompt: string; workspaceResources?: Array<{ workspaceId: string; workspaceName: string; workspacePath: string }>; toolTimeoutMs?: number } {
  if (typeof input === 'string') return { prompt: input }
  if (!input || typeof input !== 'object') throw new Error('Invalid roundtable start input')
  const value = input as Record<string, unknown>
  if (typeof value.prompt !== 'string') throw new Error('Roundtable prompt must be a string')
  if (value.workspaceResources !== undefined && (!Array.isArray(value.workspaceResources) || value.workspaceResources.some((item) => {
    if (!item || typeof item !== 'object') return true
    const resource = item as Record<string, unknown>
    return typeof resource.workspaceId !== 'string' || typeof resource.workspaceName !== 'string' || typeof resource.workspacePath !== 'string'
  }))) throw new Error('Invalid roundtable workspace resources')
  if (value.toolTimeoutMs !== undefined && (!Number.isInteger(value.toolTimeoutMs) || (value.toolTimeoutMs as number) < 1000 || (value.toolTimeoutMs as number) > 120000)) throw new Error('Invalid roundtable tool timeout')
  return value as ReturnType<typeof validateStartInput>
}
export function registerRoundtableHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(ROUNDTABLE_CHANNELS.start, (_event, input) => roundtableService.start(validateStartInput(input)))
  ipcMain.handle(ROUNDTABLE_CHANNELS.advance, (_event, sessionId: string, input?: string, requestId?: string) => {
    if (requestId !== undefined && typeof requestId !== 'string') throw new Error('Invalid roundtable request id')
    return roundtableService.advance(sessionId, input, requestId)
  })
  ipcMain.handle(ROUNDTABLE_CHANNELS.end, (_event, sessionId: string) => roundtableService.end(sessionId))
  ipcMain.handle(ROUNDTABLE_CHANNELS.state, (_event, sessionId: string) => roundtableService.getState(sessionId))
  ipcMain.handle(ROUNDTABLE_CHANNELS.restore, (_event, sessionId: string) => roundtableService.restore(sessionId))
  ipcMain.handle(ROUNDTABLE_CHANNELS.export, (_event, sessionId: string) => roundtableService.exportMarkdown(sessionId))
  ipcMain.handle(ROUNDTABLE_CHANNELS.bundleBuild, (_event, sessionId: string, input: unknown) => {
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('Invalid roundtable session id')
    if (!input || typeof input !== 'object') throw new Error('Invalid bundle build input')
    const value = input as Record<string, unknown>
    if (typeof value.repoId !== 'string' || !value.repoId) throw new Error('Bundle build needs a repoId')
    if (value.factIds !== undefined && (!Array.isArray(value.factIds) || value.factIds.some((id) => typeof id !== 'string'))) {
      throw new Error('Invalid bundle fact ids')
    }
    if (value.bundleId !== undefined && typeof value.bundleId !== 'string') throw new Error('Invalid bundle id')
    if (value.revision !== undefined && (!Number.isInteger(value.revision) || (value.revision as number) < 1)) {
      throw new Error('Invalid bundle revision')
    }
    return roundtableService.buildBundle(sessionId, value as { factIds?: string[]; repoId: string; bundleId?: string; revision?: number })
  })
  ipcMain.handle(ROUNDTABLE_CHANNELS.bundleApply, (_event, root: string, bundle: unknown, reason: string) => {
    if (typeof root !== 'string' || !root) throw new Error('Invalid bundle apply root')
    if (!bundle || typeof bundle !== 'object') throw new Error('Invalid bundle')
    if (typeof reason !== 'string' || !reason) throw new Error('Bundle apply needs a reason')
    return roundtableService.applyBundle(root, bundle as Parameters<typeof roundtableService.applyBundle>[1], reason)
  })
  if (!subscribed) {
    subscribed = true
    roundtableService.onEvent((event) => {
      const window = getMainWindow()
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(ROUNDTABLE_CHANNELS.event, event)
    })
  }
}
