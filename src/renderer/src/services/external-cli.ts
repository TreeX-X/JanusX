import type {
  ExternalCliApplyProviderRequest,
  ExternalCliApplyResult,
  ExternalCliDetectResult,
  ExternalCliInstallResult,
  ExternalCliLatestResult,
  ExternalCliRollbackResult,
  ExternalCliSyncState,
  ExternalCliToolId,
  TerminalApplyModelRequest,
  TerminalApplyModelResult,
  TerminalModelState,
  TerminalRollbackResult,
} from '../../../shared/ipc/external-cli'

export interface ExternalCliService {
  detect(toolId: ExternalCliToolId): Promise<ExternalCliDetectResult>
  latest(toolId: ExternalCliToolId): Promise<ExternalCliLatestResult>
  install(toolId: ExternalCliToolId): Promise<ExternalCliInstallResult>
  applyProvider(request: ExternalCliApplyProviderRequest): Promise<ExternalCliApplyResult>
  syncState(): Promise<ExternalCliSyncState>
  rollbackProfile(): Promise<ExternalCliRollbackResult>
  readTerminalModel(toolId: ExternalCliToolId): Promise<TerminalModelState>
  applyTerminalModel(request: TerminalApplyModelRequest): Promise<TerminalApplyModelResult>
  rollbackTerminal(toolId: ExternalCliToolId): Promise<TerminalRollbackResult>
}

export const externalCliService: ExternalCliService = {
  detect: (toolId) => window.electron.externalCli.detect(toolId),
  latest: (toolId) => window.electron.externalCli.latest(toolId),
  install: (toolId) => window.electron.externalCli.install(toolId),
  applyProvider: (request) => window.electron.externalCli.applyProvider(request),
  syncState: () => window.electron.externalCli.syncState(),
  rollbackProfile: () => window.electron.externalCli.rollbackProfile(),
  readTerminalModel: (toolId) => window.electron.externalCli.readTerminalModel(toolId),
  applyTerminalModel: (request) => window.electron.externalCli.applyTerminalModel(request),
  rollbackTerminal: (toolId) => window.electron.externalCli.rollbackTerminal(toolId),
}
