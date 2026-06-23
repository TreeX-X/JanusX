import { ipcMain } from 'electron'
import { getStatus, getLog, stage, unstage, commit, push, pull } from '../git/service'
import { analyzer } from '../janus/analyzer'

export function registerGitHandlers(): void {
  ipcMain.handle('git:status', async (_event, cwd: string) => {
    const status = getStatus(cwd)
    // Janus Analyzer 入口②：status 查询后对账补漏（fire-and-forget，不阻塞）
    analyzer.maybeReconcile(cwd).catch(err => console.error('[janus] reconcile failed:', err))
    return status
  })

  ipcMain.handle('git:log', async (_event, cwd: string, maxCount?: number) => {
    const log = getLog(cwd, maxCount)
    // Janus Analyzer 入口②：log 查询后对账补漏（fire-and-forget，不阻塞）
    analyzer.maybeReconcile(cwd).catch(err => console.error('[janus] reconcile failed:', err))
    return log
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
    // Janus Analyzer 入口①：commit 后即时分析焦点节点（fire-and-forget，不阻塞）
    analyzer.scheduleFocusedAnalyze(cwd, 'commit-threshold').catch(err => console.error('[janus] commit trigger failed:', err))
    return getStatus(cwd)
  })

  ipcMain.handle('git:push', async (_event, cwd: string) => {
    await push(cwd)
  })

  ipcMain.handle('git:pull', async (_event, cwd: string) => {
    await pull(cwd)
  })
}
