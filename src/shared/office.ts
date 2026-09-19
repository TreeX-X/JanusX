export const OFFICE_EXTENSIONS = ['.docx', '.xlsx', '.pptx'] as const
export type OfficeExtension = (typeof OFFICE_EXTENSIONS)[number]

export const OFFICE_INVOKE_CHANNELS = {
  detect: 'office:detect',
  listFiles: 'office:files:list',
  startPreview: 'office:preview:start',
  stopPreview: 'office:preview:stop',
  reloadPreview: 'office:preview:reload',
  buildPrompt: 'office:prompt:build',
} as const

export const OFFICE_EVENT_CHANNELS = {
  filesChanged: 'office:files:changed',
  watchEvicted: 'office:watch-evicted',
} as const

export type OfficeInvokeChannel = (typeof OFFICE_INVOKE_CHANNELS)[keyof typeof OFFICE_INVOKE_CHANNELS]
export type OfficeEventChannel = (typeof OFFICE_EVENT_CHANNELS)[keyof typeof OFFICE_EVENT_CHANNELS]

export interface OfficeAPI {
  detect(request: OfficeWorkspaceRequest): Promise<OfficeResult<OfficecliPublicInfo>>
  listFiles(request: OfficeWorkspaceRequest): Promise<OfficeResult<OfficeFileEntry[]>>
  startPreview(request: OfficeFileRequest): Promise<OfficeResult<OfficePreviewLease>>
  stopPreview(request: OfficeStopPreviewRequest): Promise<OfficeResult<null>>
  reloadPreview(request: OfficeReloadPreviewRequest): Promise<OfficeResult<OfficePreviewLease>>
  buildPrompt(request: OfficeBuildPromptRequest): Promise<OfficeResult<OfficePrompt>>
  onFilesChanged(listener: (event: OfficeFilesChangedEvent) => void): () => void
  onWatchEvicted(listener: (event: OfficeWatchEvictedEvent) => void): () => void
}

export const OFFICE_WATCH_ERROR_CODES = [
  'NOT_INSTALLED',
  'INCOMPATIBLE',
  'NOT_OFFICE',
  'OUTSIDE_ROOT',
  'START_FAILED',
  'PORT_TIMEOUT',
  'NO_PORT',
  'TOO_MANY',
  'SCAN_LIMIT',
  'IO',
] as const

export type OfficeWatchErrorCode = (typeof OFFICE_WATCH_ERROR_CODES)[number]
export type OfficeErrorCode = OfficeWatchErrorCode | 'INVALID_REQUEST' | 'UNAUTHORIZED' | 'UNAVAILABLE'

export const OFFICE_SKILL_IDS = ['officecli-xlsx', 'officecli-docx', 'officecli-pptx'] as const
export type OfficeSkillId = (typeof OFFICE_SKILL_IDS)[number]

export interface OfficeFileEntry {
  relPath: string
  mtimeMs: number
  size: number
  // Note: widened for 产物工作区 so the artifact index can also track previewable
  // local files (md/html); preview leases remain Office-only via the workspace guard.
  // See .agents/notes/implemented/feature/2026-09-13-product-workspace.md
  ext: string
}

export interface OfficecliPublicInfo {
  installed: boolean
  compatible: boolean
  version?: string
  source?: 'bundled'
}

export interface OfficecliInfo extends OfficecliPublicInfo {
  path?: string
  runtimeError?: string
}

export interface OfficePreviewLease {
  previewLeaseId: string
  port: number
  relPath: string
}

export interface OfficeWorkspaceRequest {
  workspaceId: string
}

export interface OfficeFileRequest extends OfficeWorkspaceRequest {
  relPath: string
}

export interface OfficeStopPreviewRequest extends OfficeFileRequest {
  previewLeaseId: string
}

export interface OfficeReloadPreviewRequest extends OfficeStopPreviewRequest {}

export interface OfficeBuildPromptRequest extends OfficeFileRequest {
  terminalPreset: 'shell' | 'claude' | 'codex' | 'opencode' | 'janus' | 'pi'
  skillId?: OfficeSkillId
}

export interface OfficePrompt {
  text: string
  mode: 'generic' | 'specific' | 'guidance'
}

export interface OfficeError {
  code: OfficeErrorCode
  message: string
}

export type OfficeResult<T> = { ok: true; value: T } | { ok: false; error: OfficeError }

export interface OfficeFilesChangedEvent {
  workspaceId: string
  entries: OfficeFileEntry[]
  reason: 'initial' | 'reconciled' | 'watch'
}

export interface OfficeWatchEvictedEvent {
  previewLeaseIds: string[]
  relPath: string
  reason: 'crashed' | 'workspace-removed' | 'shutdown'
}

export type OfficeInvokeRequestMap = {
  [OFFICE_INVOKE_CHANNELS.detect]: OfficeWorkspaceRequest
  [OFFICE_INVOKE_CHANNELS.listFiles]: OfficeWorkspaceRequest
  [OFFICE_INVOKE_CHANNELS.startPreview]: OfficeFileRequest
  [OFFICE_INVOKE_CHANNELS.stopPreview]: OfficeStopPreviewRequest
  [OFFICE_INVOKE_CHANNELS.reloadPreview]: OfficeReloadPreviewRequest
  [OFFICE_INVOKE_CHANNELS.buildPrompt]: OfficeBuildPromptRequest
}

export type OfficeInvokeResultMap = {
  [OFFICE_INVOKE_CHANNELS.detect]: OfficecliPublicInfo
  [OFFICE_INVOKE_CHANNELS.listFiles]: OfficeFileEntry[]
  [OFFICE_INVOKE_CHANNELS.startPreview]: OfficePreviewLease
  [OFFICE_INVOKE_CHANNELS.stopPreview]: null
  [OFFICE_INVOKE_CHANNELS.reloadPreview]: OfficePreviewLease
  [OFFICE_INVOKE_CHANNELS.buildPrompt]: OfficePrompt
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false }

const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const TERMINAL_PRESETS = new Set(['shell', 'claude', 'codex', 'opencode', 'janus', 'pi'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function isWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && WORKSPACE_ID_PATTERN.test(value)
}

function isRelPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096
}

export function validateOfficeInvokeRequest<C extends OfficeInvokeChannel>(
  channel: C,
  input: unknown,
): ValidationResult<OfficeInvokeRequestMap[C]> {
  if (!isRecord(input)) return { ok: false }

  if (!isWorkspaceId(input.workspaceId)) return { ok: false }

  if (channel === OFFICE_INVOKE_CHANNELS.detect || channel === OFFICE_INVOKE_CHANNELS.listFiles) {
    return hasOnlyKeys(input, ['workspaceId'])
      ? { ok: true, value: input as unknown as OfficeInvokeRequestMap[C] }
      : { ok: false }
  }

  if (!isRelPath(input.relPath)) return { ok: false }

  if (channel === OFFICE_INVOKE_CHANNELS.startPreview) {
    return hasOnlyKeys(input, ['workspaceId', 'relPath'])
      ? { ok: true, value: input as unknown as OfficeInvokeRequestMap[C] }
      : { ok: false }
  }

  if (channel === OFFICE_INVOKE_CHANNELS.stopPreview || channel === OFFICE_INVOKE_CHANNELS.reloadPreview) {
    return hasOnlyKeys(input, ['workspaceId', 'relPath', 'previewLeaseId']) &&
      typeof input.previewLeaseId === 'string' && input.previewLeaseId.length > 0
      ? { ok: true, value: input as unknown as OfficeInvokeRequestMap[C] }
      : { ok: false }
  }

  const skillIdIsValid =
    input.skillId === undefined || (OFFICE_SKILL_IDS as readonly unknown[]).includes(input.skillId)
  return hasOnlyKeys(input, ['workspaceId', 'relPath', 'terminalPreset', 'skillId']) &&
    typeof input.terminalPreset === 'string' && TERMINAL_PRESETS.has(input.terminalPreset) && skillIdIsValid
    ? { ok: true, value: input as unknown as OfficeInvokeRequestMap[C] }
    : { ok: false }
}

export function officeOk<T>(value: T): OfficeResult<T> {
  return { ok: true, value }
}

export function officeError(code: OfficeErrorCode, message: string): OfficeResult<never> {
  return { ok: false, error: { code, message } }
}
