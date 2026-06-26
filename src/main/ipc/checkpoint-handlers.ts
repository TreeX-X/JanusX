import { ipcMain } from 'electron'
import { access } from 'fs/promises'
import { checkpointManager } from '../agent/checkpoint/checkpoint-manager'
import type { CheckpointEngine } from '../agent/checkpoint/types'

export function registerCheckpointHandlers(): void {
  ipcMain.handle(
    'checkpoint:create',
    async (
      _event,
      options: {
        terminalId: string
        engine: CheckpointEngine
        prompt: string
        cwd: string
      }
    ) => {
      const cwd = options.cwd?.trim()
      if (!cwd) throw new Error('Workspace path is empty')

      try {
        await access(cwd)
      } catch {
        throw new Error(`Workspace path does not exist: ${cwd}`)
      }

      await checkpointManager.initialize(cwd)

      const cp = await checkpointManager.createCheckpoint({ ...options, cwd })
      return {
        id: cp.id,
        terminalId: cp.terminalId,
        engine: cp.engine,
        conversationIndex: cp.conversationIndex,
        createdAt: cp.createdAt,
        branch: cp.branch,
        prompt: cp.prompt,
        fileCount: Object.keys(cp.filesSnapshot).length,
        changedFileCount: 0,
        status: cp.status,
      }
    }
  )

  ipcMain.handle(
    'checkpoint:finalize',
    async (_event, { checkpointId, cwd }: { checkpointId: string; cwd: string }) => {
      await checkpointManager.finalizeCheckpoint(checkpointId, cwd)
      return { success: true }
    }
  )

  ipcMain.handle(
    'checkpoint:restore',
    async (_event, { checkpointId, cwd }: { checkpointId: string; cwd: string }) => {
      return checkpointManager.restoreCheckpoint(checkpointId, cwd)
    }
  )

  ipcMain.handle(
    'checkpoint:list',
    async (_event, filter?: { terminalId?: string; engine?: CheckpointEngine; cwd?: string }) => {
      const cps = await checkpointManager.listCheckpoints(filter)
      const changedCounts = await checkpointManager.getChangedFileCounts(
        cps.map(cp => cp.id),
        filter?.cwd,
      )
      return cps.map((cp) => ({
          id: cp.id,
          terminalId: cp.terminalId,
          engine: cp.engine,
          conversationIndex: cp.conversationIndex,
          createdAt: cp.createdAt,
          branch: cp.branch,
          prompt: cp.prompt,
          fileCount: Object.keys(cp.filesSnapshot).length,
          changedFileCount: changedCounts[cp.id] ?? 0,
          status: cp.status,
        }))
    }
  )

  ipcMain.handle(
    'checkpoint:diff',
    async (
      _event,
      { checkpointId, filePath, cwd }: { checkpointId: string; filePath: string; cwd: string }
    ) => {
      return checkpointManager.getDiff(checkpointId, filePath, cwd)
    }
  )

  ipcMain.handle(
    'checkpoint:diff:all',
    async (_event, { checkpointId, cwd }: { checkpointId: string; cwd: string }) => {
      return checkpointManager.getAllDiffs(checkpointId, cwd)
    }
  )

  ipcMain.handle('checkpoint:delete', async (_event, { checkpointId }: { checkpointId: string }) => {
    await checkpointManager.deleteCheckpoint(checkpointId)
    return { success: true }
  })

  ipcMain.handle('checkpoint:clearAll', async () => {
    await checkpointManager.clearAll()
    return { success: true }
  })
}
