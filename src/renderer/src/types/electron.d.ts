import type { FileAPI, FileTreeAPI, WorkspaceAPI } from '../../../shared/ipc/workspace'
import type { TerminalAPI } from '../../../shared/ipc/terminal'
import type { ProjectAPI } from '../../../shared/ipc/project'

interface ElectronAPI {
  /*-- 同步平台信息，构造 xterm windowsPty 用 --*/
  platform: NodeJS.Platform
  windowsBuild?: number
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  send: (channel: string, ...args: unknown[]) => void
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  workspace: WorkspaceAPI
  fileTree: FileTreeAPI
  file: FileAPI
  terminal: TerminalAPI
  project: ProjectAPI
  janusPersona: string
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

export {}
