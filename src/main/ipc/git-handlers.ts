import { ipcMain } from 'electron'
import { getStatus, getLog, stage, unstage, commit, push, pull } from '../git/service'

export function registerGitHandlers(): void {
  ipcMain.handle('git:status', async (_event, cwd: string) => {
    return getStatus(cwd)
  })

  ipcMain.handle('git:log', async (_event, cwd: string, maxCount?: number) => {
    return getLog(cwd, maxCount)
  })

  ipcMain.handle('git:stage', async (_event, cwd: string, paths: string[]) => {
    await stage(cwd, paths)
    return getStatus(cwd)
  })

  ipcMain.handle('git:unstage', async (_event, cwd: string, paths: string[]) => {
    await unstage(cwd, paths)
    return getStatus(cwd)
  })

  ipcMain.handle('git:commit', async (_event, cwd: string, message: string) => {
    await commit(cwd, message)
    return getStatus(cwd)
  })

  ipcMain.handle('git:push', async (_event, cwd: string) => {
    await push(cwd)
  })

  ipcMain.handle('git:pull', async (_event, cwd: string) => {
    await pull(cwd)
  })
}
