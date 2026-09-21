export const WORKTREE_CHANNELS = {
  list: 'worktree:list',
  identity: 'worktree:identity',
  avatar: 'worktree:avatar',
  create: 'worktree:create',
  cancelCreate: 'worktree:cancel-create',
  delete: 'worktree:delete',
  status: 'worktree:status',
  deleteBranch: 'worktree:delete-branch',
  shipDiff: 'worktree:ship-diff',
  shipMerge: 'worktree:ship-merge',
  shipAbort: 'worktree:ship-abort',
} as const

export interface WorktreeInfo {
  /** Stable id: repoId::path once projects land; path until then. */
  id: string
  /** Workspace that owns this listing. */
  workspaceId: string
  path: string
  branch: string | null
  detached: boolean
  isMain: boolean
  /** True when created outside JanusX (plain `git worktree add`). */
  external: boolean
  /** Creation start point; absent for external or legacy entries. */
  startFrom?: string
  locked?: boolean
  prunable?: boolean
}

export interface RepoIdentity {
  host: string
  owner: string
  repo: string
  /** Upstream owner when an `upstream` remote points elsewhere (fork hint). */
  upstreamOwner?: string
  /** Direct image URL without any API call; null where unsupported. */
  avatarUrl: string | null
}

export interface WorktreeAvatar {
  /** Base64 data URL for direct <img> use; null when unavailable. */
  dataUrl: string | null
  /** True when served from the local disk cache. */
  cached: boolean
}

export interface WorktreeCreateInput {
  workspaceId: string
  workspacePath: string
  creationId: string
  name: string
  branch?: string
  startFrom?: string
}

export interface WorktreeCreateResult {
  worktree: WorktreeInfo
  shared: string[]
  copied: string[]
}

export interface WorktreeDeleteInput {
  workspacePath: string
  worktreePath: string
  force?: boolean
}

export interface WorktreeDeleteResult {
  branch: string | null
  branchDeleted: boolean
  branchKept?: string
  archivedSessions: string[]
}

export interface WorktreeStatus {
  branch: string | null
  dirty: boolean
}

export interface BranchFileDiff {
  path: string
  additions: number | null
  deletions: number | null
}

export interface BranchDiff {
  base: string
  branch: string
  files: BranchFileDiff[]
  additions: number
  deletions: number
}

export interface MergeResult {
  merged: boolean
  upToDate: boolean
  conflicts: string[]
}

export interface WorktreeAPI {
  list(workspaceId: string, workspacePath: string): Promise<WorktreeInfo[]>
  identity(workspacePath: string): Promise<RepoIdentity | null>
  avatar(workspacePath: string): Promise<WorktreeAvatar>
  create(input: WorktreeCreateInput): Promise<WorktreeCreateResult>
  cancelCreate(creationId: string, workspacePath: string): Promise<{ cancelled: boolean }>
  delete(input: WorktreeDeleteInput): Promise<WorktreeDeleteResult>
  status(worktreePath: string): Promise<WorktreeStatus>
  deleteBranch(workspacePath: string, branch: string, force?: boolean): Promise<{ success: boolean }>
  shipDiff(workspacePath: string, base: string, branch: string): Promise<BranchDiff>
  shipMerge(workspacePath: string, branch: string): Promise<MergeResult>
  shipAbort(workspacePath: string): Promise<{ success: boolean }>
}
