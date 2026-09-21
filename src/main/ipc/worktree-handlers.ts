import { ipcMain } from 'electron'
import { app } from 'electron'
import { WORKTREE_CHANNELS } from '../../shared/ipc/worktree'
import { fetchRepoAvatar, getRepoIdentity, listWorktrees } from '../git/worktrees'

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
}
