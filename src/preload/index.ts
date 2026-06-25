import { contextBridge, ipcRenderer } from 'electron'
import os from 'os'
import { JANUS_PERSONA } from '../shared/janus/persona'

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
  'filetree:children',
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
  // stream 请求改为单向 send
  'llm:chat:abort',
  // 蓝图与 Janus Analyzer 频道
  'blueprint:list',
  'blueprint:load',
  'blueprint:create',
  'blueprint:update',
  'blueprint:delete',
  'blueprint:node:create',
  'blueprint:node:update',
  'blueprint:node:delete',
  'blueprint:node:features',
  'blueprint:node:feature:add',
  'blueprint:node:feature:update',
  'blueprint:node:feature:delete',
  'janus:node:focus',
  'janus:terminal:bind',
  'janus:analyzer:analyze',
  'janus:analyzer:apply-patch',
  'janus:analysis:list',
  'janus:analysis:apply',
  'janus:analyzer:accept-discovered',
]

const ALLOWED_SEND_CHANNELS = [
  'terminal:input',
  'terminal:resize',
  'terminal:submit-line',
  // LLM 流式请求（单向 send）
  'llm:chat-stream',
]

const ALLOWED_ON_CHANNELS = [
  'terminal:data',
  'terminal:exit',
  'filetree:changed',
  'workspace:updated',
  'app:init-state',
  'agent:event',
  'checkpoint:event',
  'checkpoint:ready',
  // LLM 流式频道
  'llm:chat:delta',
  'llm:chat:done',
  'llm:chat:error',
  // Janus Island 通知（主进程 -> 渲染）
  'janus:island:analysis',
  'janus:island:discovered',
]

contextBridge.exposeInMainWorld('electron', {
  /*-- 同步暴露平台与 Windows build 号，供渲染端构造 xterm windowsPty 用 --*/
  /*-- preload 在 Node 环境，可同步读取；os.release() 形如 "10.0.22621"，第三段为 build 号 --*/
  platform: process.platform,
  windowsBuild:
    process.platform === 'win32' ? Number(os.release().split('.')[2]) || undefined : undefined,

  /*-- Janus 人格 prompt 单一来源：主进程 Analyzer 与渲染层 JanusChat 共用 --*/
  janusPersona: JANUS_PERSONA,

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
      const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
        console.log('[preload] event received:', channel, args)
        callback(...args)
      }
      ipcRenderer.on(channel, handler)
      return () => {
        ipcRenderer.removeListener(channel, handler)
      }
    }
    return () => {}
  },
})
