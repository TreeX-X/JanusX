import type { ShellCandidate, ShellProfilesSettings } from '../shellProfiles'

export const SHELL_PROFILE_CHANNELS = {
  list: 'shell-profiles:list',
  save: 'shell-profiles:save',
  detect: 'shell-profiles:detect',
} as const

export interface ShellProfilesAPI {
  /** Configured entries plus CLI preset visibility. */
  list(): Promise<ShellProfilesSettings>
  save(settings: ShellProfilesSettings): Promise<ShellProfilesSettings>
  /** Shells detected on this machine that the user may confirm into the list. */
  detect(): Promise<ShellCandidate[]>
}
