import { contextBridge, ipcRenderer } from 'electron'
import os from 'os'
import { JANUS_PERSONA } from '../shared/janus/persona'
import { OFFICE_EVENT_CHANNELS, OFFICE_INVOKE_CHANNELS } from '../shared/office'
import {
  FILE_CHANNELS,
  FILE_TREE_CHANNELS,
  WORKSPACE_CHANNELS,
  type FileAPI,
  type FileTreeAPI,
  type WorkspaceAPI,
} from '../shared/ipc/workspace'
import {
  TERMINAL_EVENT_CHANNELS,
  TERMINAL_INVOKE_CHANNELS,
  TERMINAL_SEND_CHANNELS,
  type TerminalAPI,
} from '../shared/ipc/terminal'

const ALLOWED_INVOKE_CHANNELS = [
  ...Object.values(OFFICE_INVOKE_CHANNELS),
  'runtime-telemetry:get',
  'dialog:openDirectory',
  'dialog:saveFile',
  'system:getDefaultShell',
  'system:getPlatform',
  'system:which',
  'settings:notifications:get',
  'settings:notifications:update',
  'settings:notifications:test-feishu',
  'settings:knowledge:get',
  'settings:knowledge:update',
  'window:minimize',
  'window:maximize',
  'window:close',
  'editor-window:open',
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
  'subagent-run:list',
  'checkpoint:create',
  'checkpoint:finalize',
  'checkpoint:restore',
  'checkpoint:list',
  'checkpoint:diff',
  'checkpoint:diff:all',
  'checkpoint:delete',
  'checkpoint:clearAll',
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
  'llm:model-catalog:get',
  'llm:model-catalog:refresh',
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
  'janus:requirements:list-candidates',
  'janus:requirements:accept-candidate',
  'janus:requirements:reject-candidate',
  'janus:analyzer:accept-discovered',
  'knowledge:contracts:get',
  'knowledge:bootstrap',
  'knowledge:observe',
  'knowledge:observations:list',
  'knowledge:observations:prune',
  'knowledge:observations:resolve-content',
  'knowledge:retention:stats',
  'knowledge:audit:list',
  'knowledge:audit:stats',
  // Phase 6: 候选知识提炼 + 候选读取
  'knowledge:extract',
  'knowledge:candidates:list',
  'knowledge:candidates:list-graph',
  'knowledge:candidates:list-wiki-patches',
  // MVP review: reject / apply
  'knowledge:candidates:reject',
  'knowledge:candidates:apply',
  'knowledge:search',
  'knowledge:truth:list',
  'knowledge:truth:revoke',
  'knowledge:conflicts:list',
  'knowledge:feedback:record',
  'knowledge:feedback:summary',
  'knowledge:context',
]

const ALLOWED_SEND_CHANNELS = [
  'desktop-toast:ready',
  'desktop-toast:action',
  // LLM 流式请求（单向 send）
  'llm:chat-stream',
]

const ALLOWED_ON_CHANNELS = [
  ...Object.values(OFFICE_EVENT_CHANNELS),
  'agent-hook:event',
  'agent-notification:show',
  'desktop-toast:show',
  'workspace:updated',
  'app:init-state',
  'agent:event',
  'subagent-run:updated',
  'subagent-run:removed',
  'checkpoint:event',
  'checkpoint:ready',
  // LLM 流式频道
  'llm:chat:delta',
  'llm:chat:done',
  'llm:chat:error',
  'llm:chat:recall-trace',
  // Janus Island 通知（主进程 -> 渲染）
  'janus:island:analysis',
  'janus:island:discovered',
]

const workspaceAPI: WorkspaceAPI = {
  initialize: () => ipcRenderer.invoke(WORKSPACE_CHANNELS.initialize),
  list: () => ipcRenderer.invoke(WORKSPACE_CHANNELS.list),
  load: (id) => ipcRenderer.invoke(WORKSPACE_CHANNELS.load, id),
  create: (input) => ipcRenderer.invoke(WORKSPACE_CHANNELS.create, input),
  update: (id, updates) => ipcRenderer.invoke(WORKSPACE_CHANNELS.update, id, updates),
  delete: (id) => ipcRenderer.invoke(WORKSPACE_CHANNELS.delete, id),
}

const fileTreeAPI: FileTreeAPI = {
  load: (rootPath) => ipcRenderer.invoke(FILE_TREE_CHANNELS.load, rootPath),
  children: (rootPath, relativePath) => ipcRenderer.invoke(FILE_TREE_CHANNELS.children, rootPath, relativePath),
  createFile: (rootPath, parentRelativePath, name) =>
    ipcRenderer.invoke(FILE_TREE_CHANNELS.createFile, rootPath, parentRelativePath, name),
  createDirectory: (rootPath, parentRelativePath, name) =>
    ipcRenderer.invoke(FILE_TREE_CHANNELS.createDirectory, rootPath, parentRelativePath, name),
  rename: (rootPath, relativePath, name) => ipcRenderer.invoke(FILE_TREE_CHANNELS.rename, rootPath, relativePath, name),
  delete: (rootPath, relativePath) => ipcRenderer.invoke(FILE_TREE_CHANNELS.delete, rootPath, relativePath),
  reveal: (rootPath, relativePath) => ipcRenderer.invoke(FILE_TREE_CHANNELS.reveal, rootPath, relativePath),
  onChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, workspacePath: string) => callback(workspacePath)
    ipcRenderer.on(FILE_TREE_CHANNELS.changed, handler)
    return () => ipcRenderer.removeListener(FILE_TREE_CHANNELS.changed, handler)
  },
}

const fileAPI: FileAPI = {
  read: (filePath) => ipcRenderer.invoke(FILE_CHANNELS.read, filePath),
  save: (filePath, content) => ipcRenderer.invoke(FILE_CHANNELS.save, filePath, content),
  readBinary: (filePath) => ipcRenderer.invoke(FILE_CHANNELS.readBinary, filePath),
  stat: (filePath) => ipcRenderer.invoke(FILE_CHANNELS.stat, filePath),
}

function subscribeTerminalEvent<T>(channel: string, callback: (event: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const terminalAPI: TerminalAPI = {
  warmup: (request) => ipcRenderer.invoke(TERMINAL_INVOKE_CHANNELS.warmup, request),
  create: (request) => ipcRenderer.invoke(TERMINAL_INVOKE_CHANNELS.create, request),
  replay: (id) => ipcRenderer.invoke(TERMINAL_INVOKE_CHANNELS.replay, { id }),
  kill: (id) => ipcRenderer.invoke(TERMINAL_INVOKE_CHANNELS.kill, { id }),
  input: (id, data) => ipcRenderer.send(TERMINAL_SEND_CHANNELS.input, { id, data }),
  resize: (id, cols, rows) => ipcRenderer.send(TERMINAL_SEND_CHANNELS.resize, { id, cols, rows }),
  submitLine: (id, text) => ipcRenderer.send(TERMINAL_SEND_CHANNELS.submitLine, { id, text }),
  onData: (callback) => subscribeTerminalEvent(TERMINAL_EVENT_CHANNELS.data, callback),
  onExit: (callback) => subscribeTerminalEvent(TERMINAL_EVENT_CHANNELS.exit, callback),
  onFocus: (callback) => subscribeTerminalEvent(TERMINAL_EVENT_CHANNELS.focus, callback),
}

contextBridge.exposeInMainWorld('electron', {
  /*-- 同步暴露平台与 Windows build 号，供渲染端构造 xterm windowsPty 用 --*/
  /*-- preload 在 Node 环境，可同步读取；os.release() 形如 "10.0.22621"，第三段为 build 号 --*/
  platform: process.platform,
  windowsBuild:
    process.platform === 'win32' ? Number(os.release().split('.')[2]) || undefined : undefined,

  /*-- Janus 人格 prompt 单一来源：主进程 Analyzer 与渲染层 JanusChat 共用 --*/
  janusPersona: JANUS_PERSONA,
  workspace: workspaceAPI,
  fileTree: fileTreeAPI,
  file: fileAPI,
  terminal: terminalAPI,

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
