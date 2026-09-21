export const HOSTED_CHANNELS = {
  detect: 'hosted:detect',
  listReviews: 'hosted:list-reviews',
  checks: 'hosted:checks',
  failedLogs: 'hosted:failed-logs',
  createReview: 'hosted:create-review',
  mergeReview: 'hosted:merge-review',
  gitlabGet: 'hosted:gitlab-get',
  gitlabSave: 'hosted:gitlab-save',
  gitlabVerify: 'hosted:gitlab-verify',
  gitlabClearToken: 'hosted:gitlab-clear-token',
} as const

export type HostedProviderId = 'github' | 'gitlab'

export type HostedCapability =
  | 'reviews'
  | 'checks'
  | 'comments'
  | 'autoMerge'
  | 'stackedReviews'
  | 'reactions'

export type HostedReviewState = 'open' | 'draft' | 'merged' | 'closed'
export type HostedCheckState = 'pass' | 'fail' | 'pending' | 'skipped'

export interface HostedReview {
  number: number
  title: string
  state: HostedReviewState
  base: string
  head: string
  url: string
  checksState: 'passing' | 'failing' | 'pending' | 'none'
}

export interface HostedCheck {
  name: string
  state: HostedCheckState
  url?: string
}

export interface FailedCheckLog {
  name: string
  log: string
  truncated: boolean
}

export interface CreateReviewInput {
  workspacePath: string
  title: string
  body?: string
  base: string
  head: string
  draft?: boolean
  /** Worktree path to bind the created review onto. */
  worktreePath?: string
}

export interface GitlabInstanceConfig {
  url: string
  allowInsecure: boolean
  timeoutMs: number
  tokenSource: 'keychain' | 'env' | 'none'
}

export interface GitlabSaveInput {
  url: string
  allowInsecure?: boolean
  timeoutMs?: number
  token?: string
}

export interface GitlabVerifyResult {
  ok: boolean
  username?: string
  error?: string
  code?: 'network' | 'auth' | 'cert' | 'config' | 'token'
}

export interface HostedAPI {
  detect(workspacePath: string): Promise<HostedProviderId | null>
  listReviews(workspacePath: string, branch: string): Promise<HostedReview[]>
  checks(workspacePath: string, branch: string): Promise<HostedCheck[]>
  failedLogs(workspacePath: string, branch: string): Promise<FailedCheckLog[]>
  createReview(input: CreateReviewInput): Promise<HostedReview>
  mergeReview(
    workspacePath: string,
    number: number,
    method?: 'squash' | 'merge' | 'rebase',
  ): Promise<{ merged: boolean }>
  gitlabGet(): Promise<GitlabInstanceConfig>
  gitlabSave(input: GitlabSaveInput): Promise<GitlabInstanceConfig>
  gitlabVerify(input?: Partial<GitlabSaveInput>): Promise<GitlabVerifyResult>
  gitlabClearToken(): Promise<GitlabInstanceConfig>
}
