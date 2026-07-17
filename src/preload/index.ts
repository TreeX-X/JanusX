import { contextBridge, ipcRenderer } from 'electron'
import os from 'os'
import { JANUS_PERSONA } from '../shared/janus/persona'
import { OFFICE_EVENT_CHANNELS, OFFICE_INVOKE_CHANNELS, type OfficeAPI } from '../shared/office'
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
import { AGENT_CHANNELS, SUBAGENT_RUN_CHANNELS, type AgentAPI, type SubAgentRunAPI } from '../shared/ipc/agent'
import { CHECKPOINT_CHANNELS, type CheckpointAPI } from '../shared/ipc/checkpoint'
import { GIT_CHANNELS, type GitAPI } from '../shared/ipc/git'
import { LLM_CHANNELS, type LlmAPI } from '../shared/ipc/llm'
import { NOTIFICATION_SETTINGS_CHANNELS, type NotificationSettingsAPI } from '../shared/ipc/settings'
import { SYSTEM_CHANNELS, type DesktopToastAPI, type DialogAPI, type SystemAPI, type WindowAPI } from '../shared/ipc/system'

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
  autoPruneObservations: (nowMs) => ipcRenderer.invoke(KNOWLEDGE_CHANNELS.autoPruneObservations, nowMs),
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

const officeAPI: OfficeAPI = {
  detect: (request) => ipcRenderer.invoke(OFFICE_INVOKE_CHANNELS.detect, request),
  listFiles: (request) => ipcRenderer.invoke(OFFICE_INVOKE_CHANNELS.listFiles, request),
  startPreview: (request) => ipcRenderer.invoke(OFFICE_INVOKE_CHANNELS.startPreview, request),
  stopPreview: (request) => ipcRenderer.invoke(OFFICE_INVOKE_CHANNELS.stopPreview, request),
  reloadPreview: (request) => ipcRenderer.invoke(OFFICE_INVOKE_CHANNELS.reloadPreview, request),
  buildPrompt: (request) => ipcRenderer.invoke(OFFICE_INVOKE_CHANNELS.buildPrompt, request),
  installerStatus: (request) => ipcRenderer.invoke(OFFICE_INVOKE_CHANNELS.installerStatus, request),
  installerStart: (request) => ipcRenderer.invoke(OFFICE_INVOKE_CHANNELS.installerStart, request),
  installerCancel: (request) => ipcRenderer.invoke(OFFICE_INVOKE_CHANNELS.installerCancel, request),
  installerRemove: (request) => ipcRenderer.invoke(OFFICE_INVOKE_CHANNELS.installerRemove, request),
  onInstallerProgress: (callback) => subscribeIpcEvent(OFFICE_EVENT_CHANNELS.installerProgress, callback),
  onFilesChanged: (callback) => subscribeIpcEvent(OFFICE_EVENT_CHANNELS.filesChanged, callback),
  onWatchEvicted: (callback) => subscribeIpcEvent(OFFICE_EVENT_CHANNELS.watchEvicted, callback),
}

const llmAPI: LlmAPI = {
  getProviders: () => ipcRenderer.invoke(LLM_CHANNELS.getProviders),
  saveProvider: (settings) => ipcRenderer.invoke(LLM_CHANNELS.saveProvider, settings),
  testConnection: (settings) => ipcRenderer.invoke(LLM_CHANNELS.testConnection, settings),
  removeProvider: (providerId) => ipcRenderer.invoke(LLM_CHANNELS.removeProvider, providerId),
  setDefaultProvider: (providerId) => ipcRenderer.invoke(LLM_CHANNELS.setDefaultProvider, providerId),
  listModels: (providerId) => ipcRenderer.invoke(LLM_CHANNELS.listModels, providerId),
  getModelCatalog: () => ipcRenderer.invoke(LLM_CHANNELS.getCatalog),
  refreshModelCatalog: () => ipcRenderer.invoke(LLM_CHANNELS.refreshCatalog),
  getAdapters: () => ipcRenderer.invoke(LLM_CHANNELS.getAdapters),
  getDefaultProvider: () => ipcRenderer.invoke(LLM_CHANNELS.getDefaultProvider),
  chat: (request) => ipcRenderer.invoke(LLM_CHANNELS.chat, request),
  startChatStream: (request) => ipcRenderer.send(LLM_CHANNELS.chatStream, request),
  abortChat: (requestId) => ipcRenderer.invoke(LLM_CHANNELS.abort, requestId),
  onDelta: (callback) => subscribeIpcEvent(LLM_CHANNELS.delta, callback),
  onDone: (callback) => subscribeIpcEvent(LLM_CHANNELS.done, callback),
  onError: (callback) => subscribeIpcEvent(LLM_CHANNELS.error, callback),
  onRecallTrace: (callback) => subscribeIpcEvent(LLM_CHANNELS.recallTrace, callback),
}

const agentAPI: AgentAPI = {
  start: (options) => ipcRenderer.invoke(AGENT_CHANNELS.start, options),
  cancel: (sessionId) => ipcRenderer.invoke(AGENT_CHANNELS.cancel, { sessionId }),
  cancelAll: () => ipcRenderer.invoke(AGENT_CHANNELS.cancelAll),
  listSessions: () => ipcRenderer.invoke(AGENT_CHANNELS.listSessions),
  onEvent: (callback) => subscribeIpcEvent(AGENT_CHANNELS.event, callback),
  onNotification: (callback) => subscribeIpcEvent(AGENT_CHANNELS.notification, callback),
  onHookEvent: (callback) => subscribeIpcEvent(AGENT_CHANNELS.hookEvent, callback),
}

const checkpointAPI: CheckpointAPI = {
  create: (input) => ipcRenderer.invoke(CHECKPOINT_CHANNELS.create, input),
  finalize: (checkpointId, cwd) => ipcRenderer.invoke(CHECKPOINT_CHANNELS.finalize, { checkpointId, cwd }),
  restore: (checkpointId, cwd) => ipcRenderer.invoke(CHECKPOINT_CHANNELS.restore, { checkpointId, cwd }),
  list: (filter) => ipcRenderer.invoke(CHECKPOINT_CHANNELS.list, filter),
  diff: (checkpointId, filePath, cwd) => ipcRenderer.invoke(CHECKPOINT_CHANNELS.diff, { checkpointId, filePath, cwd }),
  diffAll: (checkpointId, cwd) => ipcRenderer.invoke(CHECKPOINT_CHANNELS.diffAll, { checkpointId, cwd }),
  delete: (checkpointId, cwd) => ipcRenderer.invoke(CHECKPOINT_CHANNELS.delete, { checkpointId, cwd }),
  clearAll: (cwd) => ipcRenderer.invoke(CHECKPOINT_CHANNELS.clearAll, cwd ? { cwd } : undefined),
  onEvent: (callback) => subscribeIpcEvent(CHECKPOINT_CHANNELS.event, callback),
  onReady: (callback) => subscribeIpcEvent(CHECKPOINT_CHANNELS.ready, callback),
}

const gitAPI: GitAPI = {
  status: (cwd) => ipcRenderer.invoke(GIT_CHANNELS.status, cwd),
  log: (cwd, maxCount) => ipcRenderer.invoke(GIT_CHANNELS.log, cwd, maxCount),
  stage: (cwd, paths) => ipcRenderer.invoke(GIT_CHANNELS.stage, cwd, paths),
  unstage: (cwd, paths) => ipcRenderer.invoke(GIT_CHANNELS.unstage, cwd, paths),
  commit: (cwd, message) => ipcRenderer.invoke(GIT_CHANNELS.commit, cwd, message),
  push: (cwd) => ipcRenderer.invoke(GIT_CHANNELS.push, cwd),
  pull: (cwd) => ipcRenderer.invoke(GIT_CHANNELS.pull, cwd),
}

const notificationSettingsAPI: NotificationSettingsAPI = {
  get: () => ipcRenderer.invoke(NOTIFICATION_SETTINGS_CHANNELS.get),
  update: (settings) => ipcRenderer.invoke(NOTIFICATION_SETTINGS_CHANNELS.update, settings),
  testFeishu: (settings) => ipcRenderer.invoke(NOTIFICATION_SETTINGS_CHANNELS.testFeishu, settings),
}

const subAgentRunAPI: SubAgentRunAPI = {
  list: () => ipcRenderer.invoke(SUBAGENT_RUN_CHANNELS.list),
  onUpdated: (callback) => subscribeIpcEvent(SUBAGENT_RUN_CHANNELS.updated, callback),
  onRemoved: (callback) => subscribeIpcEvent(SUBAGENT_RUN_CHANNELS.removed, callback),
}

const dialogAPI: DialogAPI = {
  openDirectory: () => ipcRenderer.invoke(SYSTEM_CHANNELS.openDirectory),
  saveFile: (options) => ipcRenderer.invoke(SYSTEM_CHANNELS.saveFile, options),
}
const windowAPI: WindowAPI = {
  minimize: () => ipcRenderer.invoke(SYSTEM_CHANNELS.minimize),
  maximize: () => ipcRenderer.invoke(SYSTEM_CHANNELS.maximize),
  close: () => ipcRenderer.invoke(SYSTEM_CHANNELS.close),
  openEditor: (payload) => ipcRenderer.invoke(SYSTEM_CHANNELS.openEditor, payload),
}
const systemAPI: SystemAPI = {
  getDefaultShell: () => ipcRenderer.invoke(SYSTEM_CHANNELS.defaultShell),
  getPlatform: () => ipcRenderer.invoke(SYSTEM_CHANNELS.platform),
  getRuntimeTelemetry: (request) => ipcRenderer.invoke(SYSTEM_CHANNELS.runtimeTelemetry, request),
}
const desktopToastAPI: DesktopToastAPI = {
  ready: () => ipcRenderer.send(SYSTEM_CHANNELS.toastReady),
  action: (action) => ipcRenderer.send(SYSTEM_CHANNELS.toastAction, { action }),
  onShow: (callback) => subscribeIpcEvent(SYSTEM_CHANNELS.toastShow, callback),
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
  office: officeAPI,
  llm: llmAPI,
  agent: agentAPI,
  checkpoint: checkpointAPI,
  git: gitAPI,
  notificationSettings: notificationSettingsAPI,
  subAgentRun: subAgentRunAPI,
  dialog: dialogAPI,
  window: windowAPI,
  system: systemAPI,
  desktopToast: desktopToastAPI,
})
