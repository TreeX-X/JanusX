import type {
  CcSwitchApplyResult,
  CcSwitchDetectResult,
  CcSwitchInstallResult,
  CcSwitchLatestResult,
  CcSwitchRollbackResult,
  CcSwitchToolId,
} from '../../../shared/ipc/cc-switch'

export interface CcSwitchService {
  detect(toolId: CcSwitchToolId): Promise<CcSwitchDetectResult>
  latest(toolId: CcSwitchToolId): Promise<CcSwitchLatestResult>
  install(toolId: CcSwitchToolId): Promise<CcSwitchInstallResult>
  applyLlm(toolId: CcSwitchToolId): Promise<CcSwitchApplyResult>
  rollbackProfile(): Promise<CcSwitchRollbackResult>
}

export const ccSwitchService: CcSwitchService = {
  detect: (toolId) => window.electron.ccSwitch.detect(toolId),
  latest: (toolId) => window.electron.ccSwitch.latest(toolId),
  install: (toolId) => window.electron.ccSwitch.install(toolId),
  applyLlm: (toolId) => window.electron.ccSwitch.applyLlm(toolId),
  rollbackProfile: () => window.electron.ccSwitch.rollbackProfile(),
}
