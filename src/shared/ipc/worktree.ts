export const WORKTREE_CHANNELS = {
  list: 'worktree:list',
  identity: 'worktree:identity',
  avatar: 'worktree:avatar',
  event: 'worktree:event',
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

export interface WorktreeAPI {
  list(workspaceId: string, workspacePath: string): Promise<WorktreeInfo[]>
  identity(workspacePath: string): Promise<RepoIdentity | null>
  avatar(workspacePath: string): Promise<WorktreeAvatar>
  onEvent(callback: (payload: { type: string; workspaceId?: string }) => void): () => void
}
