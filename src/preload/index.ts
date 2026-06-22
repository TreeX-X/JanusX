import { contextBridge, ipcRenderer } from 'electron'
import os from 'os'

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
  'file:read',
  'file:save',
  'file:readBinary',
  'file:stat',
  'project:detect',
  'project:detect-with-details',
  'project:config:read',
  'project:config:write',
  'project:config:create-default',
  'project:config:validate',
  'project:run',
  'project:stop',
  'project:list',
  'project:get',
  'project:schemas',
  // LLM 相关频道
  'llm:get-providers',
  'llm:save-provider',
  'llm:test-connection',
  'llm:remove-provider',
  'llm:set-default-provider',
  'llm:list-models',
  'llm:get-adapters',
  'llm:get-default-provider',
  'llm:chat',
  'llm:chat-stream',
  'llm:chat:abort',
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
  // LLM 流式频道
  'llm:chat:delta',
  'llm:chat:done',
  'llm:chat:error',
]

contextBridge.exposeInMainWorld('electron', {
  /*-- 同步暴露平台与 Windows build 号，供渲染端构造 xterm windowsPty 用 --*/
  /*-- preload 在 Node 环境，可同步读取；os.release() 形如 "10.0.22621"，第三段为 build 号 --*/
  platform: process.platform,
  windowsBuild:
    process.platform === 'win32' ? Number(os.release().split('.')[2]) || undefined : undefined,

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
