import { ipcMain } from 'electron'
import { readFile, writeFile, stat } from 'fs/promises'
import { extname } from 'path'

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
}

export function registerFileHandlers(): void {
  ipcMain.handle('file:read', async (_event, filePath: string) => {
    try {
      const [content, info] = await Promise.all([
        readFile(filePath, 'utf-8'),
        stat(filePath),
      ])
      return { content, encoding: 'utf-8', size: info.size, mtime: info.mtimeMs }
    } catch (err: any) {
      return { error: err.message || 'Failed to read file' }
    }
  })

  ipcMain.handle('file:save', async (_event, filePath: string, content: string) => {
    try {
      await writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { error: err.message || 'Failed to save file' }
    }
  })

  ipcMain.handle('file:readBinary', async (_event, filePath: string) => {
    try {
      const [buffer, info] = await Promise.all([readFile(filePath), stat(filePath)])
      const ext = extname(filePath).toLowerCase()
      const mimeType = MIME_MAP[ext] || 'application/octet-stream'
      return { base64: buffer.toString('base64'), mimeType, size: info.size, mtime: info.mtimeMs }
    } catch (err: any) {
      return { error: err.message || 'Failed to read binary file' }
    }
  })

  ipcMain.handle('file:stat', async (_event, filePath: string) => {
    try {
      const s = await stat(filePath)
      return { size: s.size, mtime: s.mtimeMs, isFile: s.isFile() }
    } catch (err: any) {
      return { error: err.message || 'Failed to stat file' }
    }
  })
}
