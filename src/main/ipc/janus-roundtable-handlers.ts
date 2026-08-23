import { ipcMain } from 'electron'
import { JANUS_ROUNDTABLE_CHANNELS, type AdvanceRoundInput, type CreateRoundtableInput, type UpdateRoundtableWorkspacesInput } from '../../shared/ipc/janus-roundtable'
import { exportRoundtableMarkdown, roundtableOrchestrator } from '../janus/roundtable-orchestrator'
import { roundtableStore } from '../janus/roundtable-store'

export function registerJanusRoundtableHandlers(): void {
  ipcMain.handle(JANUS_ROUNDTABLE_CHANNELS.list, () => roundtableStore.list())
  ipcMain.handle(JANUS_ROUNDTABLE_CHANNELS.get, (_event, sessionId: string) => roundtableStore.get(sessionId))
  ipcMain.handle(JANUS_ROUNDTABLE_CHANNELS.create, (_event, input: CreateRoundtableInput) => roundtableOrchestrator.create(input))
  ipcMain.handle(JANUS_ROUNDTABLE_CHANNELS.updateWorkspaces, (_event, input: UpdateRoundtableWorkspacesInput) => roundtableOrchestrator.updateWorkspaces(input))
  ipcMain.handle(JANUS_ROUNDTABLE_CHANNELS.advance, (event, input: AdvanceRoundInput) => roundtableOrchestrator.advance(input, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send(JANUS_ROUNDTABLE_CHANNELS.progress, progress)
  }))
  ipcMain.handle(JANUS_ROUNDTABLE_CHANNELS.end, (_event, sessionId: string) => roundtableOrchestrator.end(sessionId))
  ipcMain.handle(JANUS_ROUNDTABLE_CHANNELS.exportMarkdown, (_event, sessionId: string, directory: string, fileName?: string) => exportRoundtableMarkdown(sessionId, directory, fileName))
}
