import { ipcMain } from 'electron'
import { subAgentRunRegistry } from '../agent/subagent-run-registry'
import { SUBAGENT_RUN_CHANNELS } from '../../shared/ipc/agent'

/** setMainWindow 由 register.ts 在每次窗口重建时重绑（audit M1） */
export function registerSubAgentRunHandlers(): void {
  ipcMain.handle(SUBAGENT_RUN_CHANNELS.list, async () => {
    return subAgentRunRegistry.listRuns()
  })
}
