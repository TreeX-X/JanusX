import type { BrowserWindow } from 'electron'
import type { OfficeArtifactIndex } from '../office/office-artifact-index'
import type { OfficecliInstaller } from '../office/officecli-installer'
import type { OfficeWatchPool } from '../office/office-watch-pool'
import type { ResolveWorkspaceRoot } from '../office/office-workspace-guard'
import { createProductionOfficeOperations } from '../office/office-handler-operations'
import { registerAgentHandlers } from './agent-handlers'
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

export interface RegisterApplicationIpcOptions {
  mainWindow: BrowserWindow
  getAllowedWindows: () => BrowserWindow[]
  resolveWorkspaceRoot: ResolveWorkspaceRoot
  officeWatchPool: OfficeWatchPool
  officeArtifactIndex: OfficeArtifactIndex
  officecliInstaller: OfficecliInstaller
}

export function registerApplicationIpc(options: RegisterApplicationIpcOptions): void {
  const { mainWindow, officeWatchPool, officeArtifactIndex } = options
  registerWorkspaceHandlers(mainWindow, {
    beforeWorkspaceDelete: async (workspaceId) => {
      await officeWatchPool.stopUnderRoot(workspaceId)
      officeArtifactIndex.dispose(workspaceId)
    },
  })
  registerTerminalHandlers(mainWindow)
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
