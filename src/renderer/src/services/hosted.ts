import type { GitlabInstanceConfig, GitlabVerifyResult } from '../../../shared/ipc/hosted'

export function getGitlabConfig(): Promise<GitlabInstanceConfig> {
  return window.electron.hosted.gitlabGet()
}

export function saveGitlabConfig(input: {
  url: string
  allowInsecure?: boolean
  timeoutMs?: number
  token?: string
}): Promise<GitlabInstanceConfig> {
  return window.electron.hosted.gitlabSave(input)
}

export function verifyGitlabConfig(input?: {
  url?: string
  allowInsecure?: boolean
  timeoutMs?: number
  token?: string
}): Promise<GitlabVerifyResult> {
  return window.electron.hosted.gitlabVerify(input)
}

export function clearGitlabToken(): Promise<GitlabInstanceConfig> {
  return window.electron.hosted.gitlabClearToken()
}
