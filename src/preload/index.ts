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
import { PROJECT_CHANNELS, type ProjectAPI } from '../shared/ipc/project'
import { KNOWLEDGE_CHANNELS, type KnowledgeAPI } from '../shared/ipc/knowledge'
import {
  JANUS_COMMAND_CHANNELS,
  JANUS_EVENT_CHANNELS,
  type JanusAPI
} from '../shared/ipc/janus'

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

function subscribeIpcEvent<T>(channel: string, callback: (event: T) => void): () => void {
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
  onData: (callback) => subscribeIpcEvent(TERMINAL_EVENT_CHANNELS.data, callback),
  onExit: (callback) => subscribeIpcEvent(TERMINAL_EVENT_CHANNELS.exit, callback),
  onFocus: (callback) => subscribeIpcEvent(TERMINAL_EVENT_CHANNELS.focus, callback),
}

const projectAPI: ProjectAPI = {
  detect: (projectPath) => ipcRenderer.invoke(PROJECT_CHANNELS.detect, projectPath),
  detectWithDetails: (projectPath) => ipcRenderer.invoke(PROJECT_CHANNELS.detectWithDetails, projectPath),
  readConfig: (projectPath) => ipcRenderer.invoke(PROJECT_CHANNELS.readConfig, projectPath),
  writeConfig: (projectPath, config) => ipcRenderer.invoke(PROJECT_CHANNELS.writeConfig, projectPath, config),
  createDefaultConfig: (projectPath, projectType, projectName) =>
    ipcRenderer.invoke(PROJECT_CHANNELS.createDefaultConfig, projectPath, projectType, projectName),
  validateConfig: (config) => ipcRenderer.invoke(PROJECT_CHANNELS.validateConfig, config),
  run: (projectPath, configName) => ipcRenderer.invoke(PROJECT_CHANNELS.run, projectPath, configName),
  stop: (projectId) => ipcRenderer.invoke(PROJECT_CHANNELS.stop, projectId),
  list: () => ipcRenderer.invoke(PROJECT_CHANNELS.list),
  get: (projectId) => ipcRenderer.invoke(PROJECT_CHANNELS.get, projectId),
  schemas: () => ipcRenderer.invoke(PROJECT_CHANNELS.schemas),
}

const knowledgeAPI: KnowledgeAPI = {
  contracts: () => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.contracts),
  bootstrap: (workspacePath) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.bootstrap, workspacePath),
  observe: (input) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.observe, input),
  listObservations: (query) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.listObservations, query),
  pruneObservations: (query) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.pruneObservations, query),
  resolveObservationContent: (observation) =>
    ipcRenderer.invoke(KNOWLEDGE_CHANNELS.resolveObservationContent, observation),
  retentionStats: () => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.retentionStats),
  listAudit: (query) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.listAudit, query),
  auditStats: () => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.auditStats),
  extract: (input) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.extract, input),
  listCandidates: () => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.listCandidates),
  listGraphCandidates: () => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.listGraphCandidates),
  listWikiPatchCandidates: () => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.listWikiPatchCandidates),
  rejectCandidate: (input) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.rejectCandidate, input),
  applyCandidate: (input) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.applyCandidate, input),
  search: (query) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.search, query),
  listTruth: () => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.listTruth),
  revokeTruth: (input) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.revokeTruth, input),
  listConflicts: (workspaceId) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.listConflicts, workspaceId),
  recordFeedback: (input) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.recordFeedback, input),
  feedbackSummary: (workspaceId) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.feedbackSummary, workspaceId),
  context: (request) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.context, request),
  getSettings: () => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.getSettings),
  updateSettings: (settings) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.updateSettings, settings),
}

const janusAPI: JanusAPI = {
  listBlueprints: (cwd) => ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.listBlueprints, cwd),
  loadBlueprint: (cwd, id) => ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.loadBlueprint, cwd, id),
  createBlueprint: (cwd, input) => ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.createBlueprint, cwd, input),
  updateBlueprint: (cwd, id, patch) => ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.updateBlueprint, cwd, id, patch),
  deleteBlueprint: (cwd, id) => ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.deleteBlueprint, cwd, id),
  createNode: (cwd, blueprintId, input, parentId) =>
    ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.createNode, cwd, blueprintId, input, parentId),
  updateNode: (cwd, blueprintId, nodeId, patch) =>
    ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.updateNode, cwd, blueprintId, nodeId, patch),
  deleteNode: (cwd, blueprintId, nodeId) =>
    ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.deleteNode, cwd, blueprintId, nodeId),
  replaceNodeFeatures: (cwd, blueprintId, nodeId, features) =>
    ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.replaceNodeFeatures, cwd, blueprintId, nodeId, features),
  addNodeFeature: (cwd, blueprintId, nodeId, feature) =>
    ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.addNodeFeature, cwd, blueprintId, nodeId, feature),
  updateNodeFeature: (cwd, blueprintId, nodeId, featureId, patch) =>
    ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.updateNodeFeature, cwd, blueprintId, nodeId, featureId, patch),
  deleteNodeFeature: (cwd, blueprintId, nodeId, featureId) =>
    ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.deleteNodeFeature, cwd, blueprintId, nodeId, featureId),
  focusNode: (payload) =>
    ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.focusNode, payload.workspacePath, payload.nodeId),
  bindTerminal: (cwd, nodeId, terminalId) =>
    ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.bindTerminal, cwd, nodeId, terminalId),
  analyze: (payload) => ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.analyze, payload),
  applyAnalysisPatch: (payload) => ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.applyAnalysisPatch, payload),
  listAnalyses: (payload) => ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.listAnalyses, payload),
  applyAnalysis: (payload) => ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.applyAnalysis, payload),
  listRequirementCandidates: (payload) =>
    ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.listRequirementCandidates, payload),
  acceptRequirementCandidate: (payload) =>
    ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.acceptRequirementCandidate, payload),
  rejectRequirementCandidate: (payload) =>
    ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.rejectRequirementCandidate, payload),
  acceptDiscovered: (payload) => ipcRenderer.invoke(JANUS_COMMAND_CHANNELS.acceptDiscovered, payload),
  onAnalysisResult: (callback) => subscribeIpcEvent(JANUS_EVENT_CHANNELS.analysis, callback),
  onDiscovered: (callback) => subscribeIpcEvent(JANUS_EVENT_CHANNELS.discovered, callback),
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
  project: projectAPI,
  knowledge: knowledgeAPI,
  janus: janusAPI,

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
