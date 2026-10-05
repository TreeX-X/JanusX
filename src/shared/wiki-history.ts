import type { WikiPage } from './knowledge'

export const WIKI_HISTORY_LIMIT = 20

export interface WikiHistoryQuery {
  workspaceId: string
  slug: string
  offset?: number
  limit?: number
}

export interface WikiRevisionSummary {
  version: number
  title: string
  publishedAt: string
  contentHash: string
  pinned: boolean
  actor?: string
  reason?: string
  candidateId?: string
  /** A legacy current page captured before its next update; original reviewer is unknown. */
  legacy: boolean
}

export interface WikiRevision extends WikiRevisionSummary {
  page: WikiPage
}

export interface WikiHistoryPage {
  items: WikiRevisionSummary[]
  total: number
  offset: number
  limit: number
  retainedVersions: number
}

export interface WikiRevisionQuery {
  workspaceId: string
  slug: string
  version: number
}

export interface WikiRevisionPinInput extends WikiRevisionQuery {
  contentHash: string
  pinned: boolean
}
