import type {
  CcSwitchApplyProviderRequest,
  CcSwitchApplyResult,
  CcSwitchDetectResult,
  CcSwitchInstallResult,
  CcSwitchLatestResult,
  CcSwitchRollbackResult,
  CcSwitchSyncState,
  CcSwitchToolId,
} from '../../../shared/ipc/cc-switch'

export interface CcSwitchService {
  detect(toolId: CcSwitchToolId): Promise<CcSwitchDetectResult>
  latest(toolId: CcSwitchToolId): Promise<CcSwitchLatestResult>
  install(toolId: CcSwitchToolId): Promise<CcSwitchInstallResult>
  applyProvider(request: CcSwitchApplyProviderRequest): Promise<CcSwitchApplyResult>
  syncState(): Promise<CcSwitchSyncState>
  rollbackProfile(): Promise<CcSwitchRollbackResult>
}

export const ccSwitchService: CcSwitchService = {
  detect: (toolId) => window.electron.ccSwitch.detect(toolId),
  latest: (toolId) => window.electron.ccSwitch.latest(toolId),
  install: (toolId) => window.electron.ccSwitch.install(toolId),
  applyProvider: (request) => window.electron.ccSwitch.applyProvider(request),
  syncState: () => window.electron.ccSwitch.syncState(),
  rollbackProfile: () => window.electron.ccSwitch.rollbackProfile(),
}
