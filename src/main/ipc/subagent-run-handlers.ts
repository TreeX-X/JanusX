import { ipcMain, BrowserWindow } from 'electron'
import { subAgentRunRegistry } from '../agent/subagent-run-registry'

export function registerSubAgentRunHandlers(mainWindow: BrowserWindow): void {
  subAgentRunRegistry.setMainWindow(mainWindow)

  mainWindow.on('closed', () => {
    subAgentRunRegistry.setMainWindow(null)
  })

  ipcMain.handle('subagent-run:list', async () => {
    return subAgentRunRegistry.listRuns()
  })
}
