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

export function knowledgeRootPath(): string {
  const override = process.env[KNOWLEDGE_ROOT_ENV]?.trim()
  if (override) return override

  return join(defaultUserDataDir(), 'janusx', KNOWLEDGE_ROOT_DIR)
}