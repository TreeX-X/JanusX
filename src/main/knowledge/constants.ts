import { homedir } from 'os'
import { join } from 'path'

export const KNOWLEDGE_SCHEMA_VERSION = 1 as const
export const KNOWLEDGE_ROOT_DIR = 'knowledge'
export const KNOWLEDGE_ROOT_ENV = 'JANUSX_KNOWLEDGE_ROOT'

// Phase 4: observations longer than this (UTF-8 bytes) are gzip-compressed into blobs/.
export const BLOB_CONTENT_THRESHOLD = 2048

// Phase 4: in-record content preview length (characters) when content is blobbed.
export const CONTENT_PREVIEW_CHARS = 200

function defaultUserDataDir(): string {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'JanusX')
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'JanusX')
  }

  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'JanusX')
}

// User memory MVP: person-scoped provenance for workspace-free janus-chat turns.
// Observation shards are global (monthly files); the workspace fields are
// provenance only, so a stable sentinel keeps person observations queryable
// without a real cwd. Recall drops workspaceId 'user' from every non-user
// request, so the sentinel never leaks into shared surfaces.
export const USER_MEMORY_WORKSPACE_ID = 'user'
export const USER_MEMORY_WORKSPACE_PATH = 'user'

export function knowledgeRootPath(): string {
  const override = process.env[KNOWLEDGE_ROOT_ENV]?.trim()
  if (override) return override

  return join(defaultUserDataDir(), 'janusx', KNOWLEDGE_ROOT_DIR)
}