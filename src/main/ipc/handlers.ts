import { randomUUID } from 'crypto'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { watch, type FSWatcher } from 'fs'
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'fs/promises'
import { join, relative, resolve } from 'path'

const WORKSPACES_DIR = join(app.getPath('userData'), 'janusx', 'workspaces')
const HIDDEN_FILETREE_ENTRIES = new Set(['.git', '.janusX'])
const watcherRegistry = new Map<string, FSWatcher>()
const watcherTimers = new Map<string, NodeJS.Timeout>()

function sendToRenderer(mainWindow: BrowserWindow, channel: string, payload: unknown): void {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

function normalizeRelativePath(rootPath: string, targetPath: string): string {
  return relative(rootPath, targetPath).replace(/\\/g, '/')
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const resolvedRoot = resolve(rootPath)
  const resolvedTarget = resolve(targetPath)
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}\\`) || resolvedTarget.startsWith(`${resolvedRoot}/`)
}

function resolveWorkspacePath(rootPath: string, relativePathValue = ''): string | null {
  const safeRelativePath = relativePathValue.replace(/^[/\\]+/, '')
  const targetPath = resolve(rootPath, safeRelativePath)
  return isPathWithinRoot(rootPath, targetPath) ? targetPath : null
}

function sanitizeEntryName(nameValue: string): string | null {
  const name = nameValue.trim()
  if (!name || name === '.' || name === '..' || /[/\\]/.test(name)) return null
  return name
}

function fileTreeResult(success: boolean, error?: string, path?: string): { success: boolean; error?: string; path?: string } {
  return { success, error, path }
}

async function readDirectoryNodes(rootPath: string, targetDir: string): Promise<unknown[]> {
  try {
    const entries = await readdir(targetDir, { withFileTypes: true })
    const nodes = await Promise.all(
      entries
        .filter((entry) => !HIDDEN_FILETREE_ENTRIES.has(entry.name))
        .map(async (entry) => {
          const fullPath = join(targetDir, entry.name)
          const nodePath = normalizeRelativePath(rootPath, fullPath)

          if (entry.isDirectory()) {
            let hasChildren = false
            try {
              const children = await readdir(fullPath, { withFileTypes: true })
              hasChildren = children.some((child) => !HIDDEN_FILETREE_ENTRIES.has(child.name))
            } catch {
              hasChildren = false
            }

            return {
              name: entry.name,
              path: nodePath,
              type: 'directory' as const,
              children: [],
              hasChildren,
              loaded: false,
            }
          }

          return {
            name: entry.name,
            path: nodePath,
            type: 'file' as const,
          }
        }),
    )

    nodes.sort((a: any, b: any) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1
      if (a.type !== 'directory' && b.type === 'directory') return 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })

    return nodes
  } catch {
    return []
  }
}

function registerWorkspaceWatcher(mainWindow: BrowserWindow, workspacePath: string): void {
  if (watcherRegistry.has(workspacePath)) return

  try {
    const watcher = watch(
      workspacePath,
      { recursive: process.platform === 'win32' || process.platform === 'darwin' },
      () => {
        const existingTimer = watcherTimers.get(workspacePath)
        if (existingTimer) clearTimeout(existingTimer)

        watcherTimers.set(
          workspacePath,
          setTimeout(() => {
            watcherTimers.delete(workspacePath)
            sendToRenderer(mainWindow, 'filetree:changed', workspacePath)
          }, 150),
        )
      },
    )

    watcher.on('error', () => {
      watcher.close()
      watcherRegistry.delete(workspacePath)
      const timer = watcherTimers.get(workspacePath)
      if (timer) {
        clearTimeout(timer)
        watcherTimers.delete(workspacePath)
      }
    })

    watcherRegistry.set(workspacePath, watcher)
  } catch {
    // ignore watcher registration failure
  }
}

function disposeWorkspaceWatchers(): void {
  for (const [workspacePath, watcher] of watcherRegistry.entries()) {
    watcher.close()
    watcherRegistry.delete(workspacePath)
    const timer = watcherTimers.get(workspacePath)
    if (timer) {
      clearTimeout(timer)
      watcherTimers.delete(workspacePath)
    }
  }
}

export function registerWorkspaceHandlers(mainWindow: BrowserWindow): void {
  mainWindow.on('closed', disposeWorkspaceWatchers)

  ipcMain.handle('app:init', async () => {
    try {
      await ensureDir(WORKSPACES_DIR)
      const files = await readdir(WORKSPACES_DIR)
      const workspaces = []
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await readFile(join(WORKSPACES_DIR, file), 'utf-8')
          workspaces.push(JSON.parse(data))
        }
      }
      return {
        loadState: workspaces.length > 0 ? 'workspace-loaded' : 'no-workspace',
        workspaces,
        activeWorkspaceId: workspaces[0]?.id || null,
      }
    } catch {
      return { loadState: 'no-workspace', workspaces: [], activeWorkspaceId: null }
    }
  })

  ipcMain.handle('workspace:list', async () => {
    await ensureDir(WORKSPACES_DIR)
    const files = await readdir(WORKSPACES_DIR)
    const workspaces = []
    for (const file of files) {
      if (file.endsWith('.json')) {
        const data = await readFile(join(WORKSPACES_DIR, file), 'utf-8')
        workspaces.push(JSON.parse(data))
      }
    }
    return workspaces
  })

  ipcMain.handle('workspace:load', async (_event, id: string) => {
    const data = await readFile(join(WORKSPACES_DIR, `${id}.json`), 'utf-8')
    return JSON.parse(data)
  })

  ipcMain.handle('workspace:create', async (_event, dto: { name: string; path: string }) => {
    await ensureDir(WORKSPACES_DIR)
    const workspace = {
      id: randomUUID(),
      name: dto.name,
      path: dto.path,
      clis: [],
      layout: { mode: 'grid', positions: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await writeFile(join(WORKSPACES_DIR, `${workspace.id}.json`), JSON.stringify(workspace, null, 2))
    return workspace
  })

  ipcMain.handle('workspace:update', async (_event, id: string, updates: Record<string, unknown>) => {
    const filePath = join(WORKSPACES_DIR, `${id}.json`)
    const data = JSON.parse(await readFile(filePath, 'utf-8'))
    const updated = { ...data, ...updates, updatedAt: new Date().toISOString() }
    await writeFile(filePath, JSON.stringify(updated, null, 2))
    return updated
  })

  ipcMain.handle('workspace:delete', async (_event, id: string) => {
    try {
      await unlink(join(WORKSPACES_DIR, `${id}.json`))
      return { success: true }
    } catch {
      return { success: false }
    }
  })

  ipcMain.handle('dialog:openDirectory', async () => {
    return dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
  })

  ipcMain.handle('system:getDefaultShell', () => {
    if (process.platform === 'win32') return 'powershell.exe'
    return process.env.SHELL || '/bin/bash'
  })

  ipcMain.handle('system:getPlatform', () => {
    return process.platform
  })

  ipcMain.handle('filetree:load', async (_event, rootPath: string) => {
    registerWorkspaceWatcher(mainWindow, rootPath)
    return readDirectoryNodes(rootPath, rootPath)
  })

  ipcMain.handle('filetree:children', async (_event, rootPath: string, relativePathValue: string) => {
    const targetDir = resolveWorkspacePath(rootPath, relativePathValue)
    if (!targetDir) return []

    try {
      const info = await stat(targetDir)
      if (!info.isDirectory()) return []
    } catch {
      return []
    }

    registerWorkspaceWatcher(mainWindow, rootPath)
    return readDirectoryNodes(rootPath, targetDir)
  })

  ipcMain.handle('filetree:create-file', async (_event, rootPath: string, parentRelativePath: string, nameValue: string) => {
    const name = sanitizeEntryName(nameValue)
    const parentDir = resolveWorkspacePath(rootPath, parentRelativePath)
    if (!name || !parentDir) return fileTreeResult(false, 'Invalid file name')

    const targetPath = resolve(parentDir, name)
    if (!isPathWithinRoot(rootPath, targetPath)) return fileTreeResult(false, 'Invalid target path')

    try {
      const parentInfo = await stat(parentDir)
      if (!parentInfo.isDirectory()) return fileTreeResult(false, 'Parent is not a directory')
      await writeFile(targetPath, '', { encoding: 'utf-8', flag: 'wx' })
      return fileTreeResult(true, undefined, normalizeRelativePath(rootPath, targetPath))
    } catch (err: any) {
      return fileTreeResult(false, err.message || 'Failed to create file')
    }
  })

  ipcMain.handle('filetree:create-directory', async (_event, rootPath: string, parentRelativePath: string, nameValue: string) => {
    const name = sanitizeEntryName(nameValue)
    const parentDir = resolveWorkspacePath(rootPath, parentRelativePath)
    if (!name || !parentDir) return fileTreeResult(false, 'Invalid folder name')

    const targetPath = resolve(parentDir, name)
    if (!isPathWithinRoot(rootPath, targetPath)) return fileTreeResult(false, 'Invalid target path')

    try {
      const parentInfo = await stat(parentDir)
      if (!parentInfo.isDirectory()) return fileTreeResult(false, 'Parent is not a directory')
      await mkdir(targetPath)
      return fileTreeResult(true, undefined, normalizeRelativePath(rootPath, targetPath))
    } catch (err: any) {
      return fileTreeResult(false, err.message || 'Failed to create folder')
    }
  })

  ipcMain.handle('filetree:rename', async (_event, rootPath: string, relativePathValue: string, nameValue: string) => {
    const name = sanitizeEntryName(nameValue)
    const sourcePath = resolveWorkspacePath(rootPath, relativePathValue)
    if (!name || !sourcePath || resolve(sourcePath) === resolve(rootPath)) {
      return fileTreeResult(false, 'Invalid rename target')
    }

    const targetPath = resolve(sourcePath, '..', name)
    if (!isPathWithinRoot(rootPath, targetPath)) return fileTreeResult(false, 'Invalid target path')

    try {
      await rename(sourcePath, targetPath)
      return fileTreeResult(true, undefined, normalizeRelativePath(rootPath, targetPath))
    } catch (err: any) {
      return fileTreeResult(false, err.message || 'Failed to rename item')
    }
  })

  ipcMain.handle('filetree:delete', async (_event, rootPath: string, relativePathValue: string) => {
    const targetPath = resolveWorkspacePath(rootPath, relativePathValue)
    if (!targetPath || resolve(targetPath) === resolve(rootPath)) {
      return fileTreeResult(false, 'Cannot delete workspace root')
    }

    try {
      await rm(targetPath, { recursive: true, force: false })
      return fileTreeResult(true)
    } catch (err: any) {
      return fileTreeResult(false, err.message || 'Failed to delete item')
    }
  })

  ipcMain.handle('filetree:reveal', async (_event, rootPath: string, relativePathValue: string) => {
    const targetPath = resolveWorkspacePath(rootPath, relativePathValue)
    if (!targetPath) return fileTreeResult(false, 'Invalid target path')

    shell.showItemInFolder(targetPath)
    return fileTreeResult(true)
  })
}
