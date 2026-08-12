import { ipcMain } from 'electron'
import { extname } from 'path'
import { FILE_CHANNELS } from '../../shared/ipc/workspace'
import { authorizeRendererAction, type RendererActionAuthorizer } from '../agent/runtime/renderer-authorization'
import { janusWorkspaceFs } from '../agent/environment/janus-workspace-fs'

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

export function registerFileHandlers(authorize: RendererActionAuthorizer = authorizeRendererAction): void {
  ipcMain.handle(FILE_CHANNELS.read, async (_event, filePath: string) => {
    const result = await janusWorkspaceFs.readText(filePath)
    return result.ok
      ? { content: result.value.content, encoding: 'utf-8', size: result.value.size, mtime: result.value.mtime }
      : { error: result.error.message || 'Failed to read file' }
  })

  ipcMain.handle(FILE_CHANNELS.save, async (event, filePath: string, content: string) => {
    try {
      if (!await authorize(event, { workspaceRoot: filePath, toolName: 'legacy.file.save', actionRisk: 'write', source: 'renderer-user', preview: { summary: 'Save file changes', paths: [filePath], detail: `${content.length} characters`, truncated: false } })) return { error: 'File save denied by workspace policy' }
      const result = await janusWorkspaceFs.writeText(filePath, content)
      if (!result.ok) throw result.error
      return { success: true }
    } catch (err: any) {
      return { error: err.message || 'Failed to save file' }
    }
  })

  ipcMain.handle(FILE_CHANNELS.readBinary, async (_event, filePath: string) => {
    try {
      const result = await janusWorkspaceFs.readBinary(filePath)
      if (!result.ok) throw result.error
      const { buffer, size, mtime } = result.value
      const ext = extname(filePath).toLowerCase()
      const mimeType = MIME_MAP[ext] || 'application/octet-stream'
      return { base64: buffer.toString('base64'), mimeType, size, mtime }
    } catch (err: any) {
      return { error: err.message || 'Failed to read binary file' }
    }
  })

  ipcMain.handle(FILE_CHANNELS.stat, async (_event, filePath: string) => {
    try {
      const result = await janusWorkspaceFs.stat(filePath)
      if (!result.ok) throw result.error
      return result.value
    } catch (err: any) {
      return { error: err.message || 'Failed to stat file' }
    }
  })
}
