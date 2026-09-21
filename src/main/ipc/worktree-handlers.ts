import { ipcMain } from 'electron'
import { app } from 'electron'
import { WORKTREE_CHANNELS, type WorktreeCreateInput, type WorktreeDeleteInput } from '../../shared/ipc/worktree'
import {
  abortMerge,
  cancelCreateWorktree,
  createWorktree,
  deleteBranch,
  diffBranchToBase,
  fetchRepoAvatar,
  getRepoIdentity,
  isWorktreeDirty,
  listWorktrees,
  mergeBranchToBase,
  removeWorktree,
  worktreeBranch,
} from '../git/worktrees'
import { agentSessionRegistry } from '../sessions/session-registry'

export function registerWorktreeHandlers(): void {
  ipcMain.handle(
    WORKTREE_CHANNELS.list,
    async (_event, { workspaceId, workspacePath }: { workspaceId: string; workspacePath: string }) => {
      return listWorktrees(workspaceId, workspacePath)
    },
  )

  ipcMain.handle(WORKTREE_CHANNELS.identity, async (_event, { workspacePath }: { workspacePath: string }) => {
    return getRepoIdentity(workspacePath)
  })

  ipcMain.handle(WORKTREE_CHANNELS.avatar, async (_event, { workspacePath }: { workspacePath: string }) => {
    const identity = await getRepoIdentity(workspacePath)
    if (!identity) return { dataUrl: null, cached: false }
    return fetchRepoAvatar(app.getPath('userData'), identity.host, identity.upstreamOwner ?? identity.owner)
  })

  ipcMain.handle(WORKTREE_CHANNELS.create, async (_event, input: WorktreeCreateInput) => {
    const created = await createWorktree(
      input.workspacePath,
      {
        name: input.name,
        branch: input.branch,
        startFrom: input.startFrom,
        linkedIssue: input.linkedIssue,
      },
      input.creationId,
    )
    return {
      ...created,
      worktree: { ...created.worktree, workspaceId: input.workspaceId },
    }
  })

  ipcMain.handle(
    WORKTREE_CHANNELS.cancelCreate,
    async (_event, { creationId, workspacePath }: { creationId: string; workspacePath: string }) => {
      return { cancelled: await cancelCreateWorktree(workspacePath, creationId) }
    },
  )

  ipcMain.handle(WORKTREE_CHANNELS.delete, async (_event, input: WorktreeDeleteInput) => {
    const removed = await removeWorktree(input.workspacePath, input.worktreePath, input.force === true)
    const archivedSessions = agentSessionRegistry.archiveSessionsByCwd(input.worktreePath)
    return { ...removed, archivedSessions }
  })

  ipcMain.handle(WORKTREE_CHANNELS.status, async (_event, { worktreePath }: { worktreePath: string }) => {
    const [branch, dirty] = await Promise.all([worktreeBranch(worktreePath), isWorktreeDirty(worktreePath)])
    return { branch, dirty }
  })

  ipcMain.handle(
    WORKTREE_CHANNELS.deleteBranch,
    async (_event, { workspacePath, branch, force }: { workspacePath: string; branch: string; force?: boolean }) => {
      await deleteBranch(workspacePath, branch, force === true)
      return { success: true }
    },
  )

  ipcMain.handle(
    WORKTREE_CHANNELS.shipDiff,
    async (_event, { workspacePath, base, branch }: { workspacePath: string; base: string; branch: string }) => {
      return diffBranchToBase(workspacePath, base, branch)
    },
  )

  ipcMain.handle(
    WORKTREE_CHANNELS.shipMerge,
    async (_event, { workspacePath, branch }: { workspacePath: string; branch: string }) => {
      return mergeBranchToBase(workspacePath, branch)
    },
  )

  ipcMain.handle(WORKTREE_CHANNELS.shipAbort, async (_event, { workspacePath }: { workspacePath: string }) => {
    await abortMerge(workspacePath)
    return { success: true }
  })
}
