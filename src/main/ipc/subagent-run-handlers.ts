import { ipcMain, BrowserWindow } from 'electron'
import { subAgentRunRegistry } from '../agent/subagent-run-registry'
import { SUBAGENT_RUN_CHANNELS } from '../../shared/ipc/agent'

export function registerSubAgentRunHandlers(mainWindow: BrowserWindow): void {
  subAgentRunRegistry.setMainWindow(mainWindow)

  mainWindow.on('closed', () => {
    subAgentRunRegistry.setMainWindow(null)
  })

  ipcMain.handle(SUBAGENT_RUN_CHANNELS.list, async () => {
    return subAgentRunRegistry.listRuns()
  })
}
