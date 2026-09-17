import type {
  CcSwitchActivateResult,
  CcSwitchDetectResult,
  CcSwitchInstallResult,
  CcSwitchLatestResult,
  CcSwitchProfileInput,
  CcSwitchProfilesResult,
  CcSwitchRollbackResult,
  CcSwitchSaveProfileResult,
  CcSwitchToolId,
} from '../../../shared/ipc/cc-switch'

export interface CcSwitchService {
  detect(toolId: CcSwitchToolId): Promise<CcSwitchDetectResult>
  latest(toolId: CcSwitchToolId): Promise<CcSwitchLatestResult>
  install(toolId: CcSwitchToolId): Promise<CcSwitchInstallResult>
  profiles(): Promise<CcSwitchProfilesResult>
  saveProfile(input: CcSwitchProfileInput): Promise<CcSwitchSaveProfileResult>
  removeProfile(profileId: string): Promise<CcSwitchSaveProfileResult>
  activateProfile(profileId: string): Promise<CcSwitchActivateResult>
  rollbackProfile(): Promise<CcSwitchRollbackResult>
}

export const ccSwitchService: CcSwitchService = {
  detect: (toolId) => window.electron.ccSwitch.detect(toolId),
  latest: (toolId) => window.electron.ccSwitch.latest(toolId),
  install: (toolId) => window.electron.ccSwitch.install(toolId),
  profiles: () => window.electron.ccSwitch.profiles(),
  saveProfile: (input) => window.electron.ccSwitch.saveProfile(input),
  removeProfile: (profileId) => window.electron.ccSwitch.removeProfile(profileId),
  activateProfile: (profileId) => window.electron.ccSwitch.activateProfile(profileId),
  rollbackProfile: () => window.electron.ccSwitch.rollbackProfile(),
}
