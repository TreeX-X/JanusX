// Note: snapshots observe and never mutate — see .agents/notes/2026-06-27-checkpoint-safety--94f306fb.md
import { ipcMain } from 'electron'
import { access } from 'fs/promises'
import { checkpointManager } from '@janus-agent/agent-core'
import type { CheckpointEngine, RestoreScope } from '@janus-agent/agent-core'
import { agentSessionRegistry } from '../sessions/session-registry'
import { captureForCwd, logKnowledgeCaptureFailure } from '../knowledge/workspace-identity'
import { CHECKPOINT_CHANNELS } from '../../shared/ipc/checkpoint'
import type { CheckpointCreateInput, CheckpointFilter } from '../../shared/ipc/checkpoint'

export function registerCheckpointHandlers(): void {
  ipcMain.handle(
    CHECKPOINT_CHANNELS.create,
    async (
      _event,
      options: CheckpointCreateInput & { terminalId: string; engine: CheckpointEngine }
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
      void captureForCwd(cwd, {
        source: 'checkpoint',
        type: 'checkpoint-event',
        content: options.prompt,
        summary: `Checkpoint created: ${cp.id}`,
        tags: ['checkpoint-create'],
        actor: options.engine,
        correlationId: cp.id,
        metadata: {
          checkpointId: cp.id,
          terminalId: cp.terminalId,
          branch: cp.branch,
          conversationIndex: cp.conversationIndex,
          sessionId: cp.sessionId,
        },
      }).catch(logKnowledgeCaptureFailure)
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
        sessionId: cp.sessionId,
      }
    }
  )

  ipcMain.handle(
    CHECKPOINT_CHANNELS.finalize,
    async (_event, { checkpointId, cwd }: { checkpointId: string; cwd: string }) => {
      await checkpointManager.finalizeCheckpoint(checkpointId, cwd)
      void captureForCwd(cwd, {
        source: 'checkpoint',
        type: 'checkpoint-event',
        content: `Checkpoint finalized: ${checkpointId}`,
        summary: `Checkpoint finalized: ${checkpointId}`,
        tags: ['checkpoint-finalize'],
        actor: 'system',
        correlationId: checkpointId,
      }).catch(logKnowledgeCaptureFailure)
      return { success: true }
    }
  )

  ipcMain.handle(
    CHECKPOINT_CHANNELS.restore,
    async (_event, { checkpointId, cwd, scope }: { checkpointId: string; cwd: string; scope?: RestoreScope }) => {
      const result = await checkpointManager.restoreCheckpoint(checkpointId, cwd, scope)
      void captureForCwd(cwd, {
        source: 'checkpoint',
        type: 'checkpoint-event',
        content: `Checkpoint restored: ${checkpointId}`,
        summary: `Checkpoint restored: ${checkpointId}`,
        tags: ['checkpoint-restore'],
        actor: 'system',
        correlationId: checkpointId,
      }).catch(logKnowledgeCaptureFailure)
      return result
    }
  )

  ipcMain.handle(
    CHECKPOINT_CHANNELS.list,
    async (_event, filter?: CheckpointFilter) => {
      // Note: session scope joins tagged, legacy untagged, and live ids — see .agents/notes/2026-09-22-session-checkpoint-count-truth--b363ad92.md
      const cps = await checkpointManager.listCheckpoints(
        filter ? { ...filter, engine: filter.engine as CheckpointEngine | undefined } : undefined,
      )
      if (filter?.sessionId) {
        const record = agentSessionRegistry.getSession(filter.sessionId)
        if (record) {
          // Legacy checkpoints predate session tagging; attribute the session's
          // own terminals' untagged checkpoints to this card.
          const seen = new Set(cps.map((cp) => cp.id))
          for (const terminalId of record.terminalIds) {
            const owned = await checkpointManager.listCheckpoints({ terminalId, cwd: filter.cwd })
            for (const cp of owned) {
              if (!cp.sessionId && !seen.has(cp.id)) {
                seen.add(cp.id)
                cps.push(cp)
              }
            }
          }
          cps.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          // Reconcile the card count against live storage (restore prune and
          // retention caps delete without notifying the session ledger).
          const liveIds = new Set(
            (await checkpointManager.listCheckpoints({ cwd: filter.cwd })).map((cp) => cp.id),
          )
          agentSessionRegistry.retainCheckpoints(filter.sessionId, liveIds)
        }
      }
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
          sessionId: cp.sessionId,
        }))
    }
  )

  ipcMain.handle(
    CHECKPOINT_CHANNELS.diff,
    async (
      _event,
      { checkpointId, filePath, cwd }: { checkpointId: string; filePath: string; cwd: string }
    ) => {
      return checkpointManager.getDiff(checkpointId, filePath, cwd)
    }
  )

  ipcMain.handle(
    CHECKPOINT_CHANNELS.diffAll,
    async (_event, { checkpointId, cwd }: { checkpointId: string; cwd: string }) => {
      return checkpointManager.getAllDiffs(checkpointId, cwd)
    }
  )

  ipcMain.handle(
    CHECKPOINT_CHANNELS.records,
    async (_event, { checkpointId, cwd }: { checkpointId: string; cwd: string }) => {
      return checkpointManager.getChangedFileRecords(checkpointId, cwd)
    }
  )

  ipcMain.handle(
    CHECKPOINT_CHANNELS.delete,
    async (_event, { checkpointId, cwd }: { checkpointId: string; cwd?: string }) => {
      await checkpointManager.deleteCheckpoint(checkpointId, cwd)
      return { success: true }
    }
  )

  ipcMain.handle(CHECKPOINT_CHANNELS.clearAll, async (_event, filter?: { cwd?: string }) => {
    await checkpointManager.clearAll(filter?.cwd)
    return { success: true }
  })
}
