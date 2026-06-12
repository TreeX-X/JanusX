import { contextBridge, ipcRenderer } from 'electron'

const ALLOWED_INVOKE_CHANNELS = [
  'workspace:list',
  'workspace:load',
  'workspace:create',
  'workspace:update',
  'workspace:delete',
  'terminal:create',
  'terminal:kill',
  'dialog:openDirectory',
  'filetree:load',
  'system:getDefaultShell',
  'system:getPlatform',
  'system:which',
  'app:init',
  'window:minimize',
  'window:maximize',
  'window:close',
  'git:status',
  'git:log',
  'git:stage',
  'git:unstage',
  'git:commit',
  'git:push',
  'git:pull',
  'agent:start',
  'agent:cancel',
  'agent:cancelAll',
  'agent:listSessions',
  'checkpoint:create',
  'checkpoint:finalize',
  'checkpoint:restore',
  'checkpoint:list',
  'checkpoint:diff',
  'checkpoint:diff:all',
  'checkpoint:delete',
  'checkpoint:clearAll',
]

const ALLOWED_SEND_CHANNELS = [
  'terminal:input',
  'terminal:resize',
  'terminal:submit-line',
]

const ALLOWED_ON_CHANNELS = [
  'terminal:data',
  'terminal:exit',
  'workspace:updated',
  'app:init-state',
  'agent:event',
  'checkpoint:event',
  'checkpoint:ready',
]

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    return Promise.reject(new Error(`Channel ${channel} is not allowed`))
  },

  send: (channel: string, ...args: unknown[]) => {
    if (ALLOWED_SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    }
  },

  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (ALLOWED_ON_CHANNELS.includes(channel)) {
      const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => {
        ipcRenderer.removeListener(channel, handler)
      }
    }
    return () => {}
  },
})
