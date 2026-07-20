import type { BrowserWindow } from 'electron'
import type { OfficeArtifactIndex } from '../office/office-artifact-index'
import type { OfficecliInstaller } from '../office/officecli-installer'
import type { OfficeWatchPool } from '../office/office-watch-pool'
import type { ResolveWorkspaceRoot } from '../office/office-workspace-guard'
import { createProductionOfficeOperations } from '../office/office-handler-operations'
import type { BrowserSurfaceManager } from '../browser/surface-manager'
import { registerAgentHandlers } from './agent-handlers'
import { registerBrowserHandlers } from './browser-handlers'
import { registerCheckpointHandlers } from './checkpoint-handlers'
import { registerFileHandlers } from './file-handlers'
import { registerGitHandlers } from './git-handlers'
import { registerWorkspaceHandlers } from './handlers'
import { registerJanusHandlers } from './janus-handlers'
import { registerKnowledgeHandlers } from './knowledge-handlers'
import { registerLlmHandlers } from './llm-handlers'
import { registerOfficeHandlers } from './office-handlers'
import { registerProjectHandlers } from './project-handlers'
import { registerRuntimeTelemetryHandlers } from './runtime-telemetry-handlers'
import { registerSettingsHandlers } from './settings-handlers'
import { registerSubAgentRunHandlers } from './subagent-run-handlers'
import { registerTerminalHandlers } from './terminal-handlers'
import { terminalManager } from '../terminal/manager'

export interface RegisterApplicationIpcOptions {
  mainWindow: BrowserWindow
  getAllowedWindows: () => BrowserWindow[]
  resolveWorkspaceRoot: ResolveWorkspaceRoot
  officeWatchPool: OfficeWatchPool
  officeArtifactIndex: OfficeArtifactIndex
  officecliInstaller: OfficecliInstaller
  browserSurfaces: BrowserSurfaceManager
}

/** 幂等守卫：重复调用不再触发 "Attempted to register a second handler"。 */
let applicationIpcRegistered = false

export function registerApplicationIpc(options: RegisterApplicationIpcOptions): void {
  if (applicationIpcRegistered) return
  applicationIpcRegistered = true

  const { mainWindow, officeWatchPool, officeArtifactIndex } = options
  registerWorkspaceHandlers(mainWindow, {
    beforeWorkspaceDelete: async (workspaceId) => {
      // 删除工作区前先回收其全部终端，避免 pty 子进程变孤儿；onExit 负责状态清理。
      terminalManager.killByWorkspace(workspaceId)
      await officeWatchPool.stopUnderRoot(workspaceId)
      officeArtifactIndex.dispose(workspaceId)
    },
  })
  registerTerminalHandlers(mainWindow)
  registerBrowserHandlers(() => mainWindow, options.browserSurfaces)
  registerGitHandlers()
  registerAgentHandlers(mainWindow)
  registerCheckpointHandlers()
  registerFileHandlers()
  registerProjectHandlers()
  registerLlmHandlers()
  registerJanusHandlers(mainWindow)
  registerRuntimeTelemetryHandlers()
  registerSettingsHandlers()
  registerSubAgentRunHandlers(mainWindow)
  registerKnowledgeHandlers()
  registerOfficeHandlers({
    getAllowedWindows: options.getAllowedWindows,
    resolveWorkspaceRoot: options.resolveWorkspaceRoot,
    operations: createProductionOfficeOperations({ artifactIndex: officeArtifactIndex, watchPool: officeWatchPool }),
    installer: options.officecliInstaller,
  })
}
