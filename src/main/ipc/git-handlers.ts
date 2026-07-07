import { ipcMain } from 'electron'
import { getStatus, getLog, stage, unstage, commit, push, pull } from '../git/service'
import { analyzer } from '../janus/analyzer'
import { knowledgeObservationService } from '../knowledge/observation-service'

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
    void knowledgeObservationService.capture({
      workspacePath: cwd,
      source: 'tool',
      type: 'git-event',
      content: `git stage ${paths.join(', ')}`,
      summary: `Git stage ${paths.length} path(s)`,
      fileRefs: paths,
      tags: ['git-stage'],
      actor: 'user',
      metadata: { paths },
    }).catch(() => {})
    return getStatus(cwd)
  })

  ipcMain.handle('git:unstage', async (_event, cwd: string, paths: string[]) => {
    await unstage(cwd, paths)
    void knowledgeObservationService.capture({
      workspacePath: cwd,
      source: 'tool',
      type: 'git-event',
      content: `git unstage ${paths.join(', ')}`,
      summary: `Git unstage ${paths.length} path(s)`,
      fileRefs: paths,
      tags: ['git-unstage'],
      actor: 'user',
      metadata: { paths },
    }).catch(() => {})
    return getStatus(cwd)
  })

  ipcMain.handle('git:commit', async (_event, cwd: string, message: string) => {
    await commit(cwd, message)
    // Janus Analyzer 入口①：commit 后即时分析焦点节点（fire-and-forget，不阻塞）
    analyzer.scheduleFocusedAnalyze(cwd, 'commit-threshold').catch(err => console.error('[janus] commit trigger failed:', err))
    void knowledgeObservationService.capture({
      workspacePath: cwd,
      source: 'tool',
      type: 'git-event',
      content: message,
      summary: 'Git commit',
      tags: ['git-commit'],
      actor: 'user',
    }).catch(() => {})
    return getStatus(cwd)
  })

  ipcMain.handle('git:push', async (_event, cwd: string) => {
    await push(cwd)
    void knowledgeObservationService.capture({
      workspacePath: cwd,
      source: 'tool',
      type: 'git-event',
      content: 'git push',
      summary: 'Git push',
      tags: ['git-push'],
      actor: 'user',
    }).catch(() => {})
  })

  ipcMain.handle('git:pull', async (_event, cwd: string) => {
    await pull(cwd)
    void knowledgeObservationService.capture({
      workspacePath: cwd,
      source: 'tool',
      type: 'git-event',
      content: 'git pull',
      summary: 'Git pull',
      tags: ['git-pull'],
      actor: 'user',
    }).catch(() => {})
  })
}
