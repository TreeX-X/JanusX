import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { join, relative } from 'path'
import { readdir, readFile, writeFile, mkdir, unlink, stat } from 'fs/promises'
import { randomUUID } from 'crypto'

const WORKSPACES_DIR = join(app.getPath('userData'), 'switchx', 'workspaces')

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export function registerWorkspaceHandlers(mainWindow: BrowserWindow): void {
  // 初始化
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

  // 工作区 CRUD
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

  // 系统对话框
  ipcMain.handle('dialog:openDirectory', async () => {
    return dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
  })

  // 系统信息
  ipcMain.handle('system:getDefaultShell', () => {
    if (process.platform === 'win32') return 'powershell.exe'
    return process.env.SHELL || '/bin/bash'
  })

  ipcMain.handle('system:getPlatform', () => {
    return process.platform
  })

  // 文件树加载
  ipcMain.handle('filetree:load', async (_event, dirPath: string) => {
    const IGNORED = new Set(['node_modules', '.git', '.next', 'dist', 'out', '.hybrid', '.claude', '.codex'])

    async function scanDir(dir: string, depth = 0): Promise<unknown[]> {
      if (depth > 3) return []
      try {
        const entries = await readdir(dir, { withFileTypes: true })
        const nodes = []
        for (const entry of entries) {
          if (IGNORED.has(entry.name)) continue
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory()) {
            const children = await scanDir(fullPath, depth + 1)
            nodes.push({
              name: entry.name,
              path: relative(dirPath, fullPath).replace(/\\/g, '/'),
              type: 'directory',
              children,
            })
          } else {
            nodes.push({
              name: entry.name,
              path: relative(dirPath, fullPath).replace(/\\/g, '/'),
              type: 'file',
            })
          }
        }
        // 按类型排序：文件夹在前，文件在后
        nodes.sort((a: any, b: any) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1
          if (a.type !== 'directory' && b.type === 'directory') return 1
          return a.name.localeCompare(b.name)
        })
        return nodes
      } catch {
        return []
      }
    }

    return scanDir(dirPath)
  })
}
