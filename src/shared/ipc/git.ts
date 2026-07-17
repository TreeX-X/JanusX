export const GIT_CHANNELS = {
  status: 'git:status', log: 'git:log', stage: 'git:stage', unstage: 'git:unstage',
  commit: 'git:commit', push: 'git:push', pull: 'git:pull',
} as const

export interface GitBranch { name: string; upstream: string | null; ahead: number; behind: number }
export interface GitFileChange { path: string; status: 'M' | 'A' | 'D' | 'R' | '??' | 'UU'; staged: boolean }
export interface GitCommit { hash: string; shortHash: string; message: string; author: string; date: string }
export interface GitStatus { branch: GitBranch; changes: GitFileChange[]; clean: boolean }

export interface GitAPI {
  status(cwd: string): Promise<GitStatus>
  log(cwd: string, maxCount?: number): Promise<GitCommit[]>
  stage(cwd: string, paths: string[]): Promise<GitStatus>
  unstage(cwd: string, paths: string[]): Promise<GitStatus>
  commit(cwd: string, message: string): Promise<GitStatus>
  push(cwd: string): Promise<void>
  pull(cwd: string): Promise<void>
}
