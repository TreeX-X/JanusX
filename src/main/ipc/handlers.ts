import { randomUUID } from 'crypto'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { watch, type FSWatcher } from 'fs'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'fs/promises'
import { join, relative, resolve } from 'path'

const WORKSPACES_DIR = join(app.getPath('userData'), 'janusx', 'workspaces')
const HIDDEN_FILETREE_ENTRIES = new Set(['.git', '.janusX'])
const watcherRegistry = new Map<string, FSWatcher>()
const watcherTimers = new Map<string, NodeJS.Timeout>()

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
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('filetree:changed', workspacePath)
            }
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
    const safeRelativePath = relativePathValue.replace(/^[/\\]+/, '')
    const targetDir = resolve(rootPath, safeRelativePath)

    if (!isPathWithinRoot(rootPath, targetDir)) return []

    try {
      const info = await stat(targetDir)
      if (!info.isDirectory()) return []
    } catch {
      return []
    }

    registerWorkspaceWatcher(mainWindow, rootPath)
    return readDirectoryNodes(rootPath, targetDir)
  })
}
