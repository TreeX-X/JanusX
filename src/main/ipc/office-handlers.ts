import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { extname } from 'path'
import {
  OFFICE_EXTENSIONS,
  OFFICE_INVOKE_CHANNELS,
  OFFICE_WATCH_ERROR_CODES,
  officeError,
  officeOk,
  validateOfficeInvokeRequest,
  type OfficeBuildPromptRequest,
  type OfficeErrorCode,
  type OfficeFileEntry,
  type OfficePreviewLease,
  type OfficePrompt,
  type OfficeReloadPreviewRequest,
  type OfficeResult,
  type OfficeStopPreviewRequest,
  type OfficecliInfo,
  type OfficecliManualInstallGuidance,
} from '../../shared/office'
import {
  OfficeWorkspaceGuardError,
  resolveTrustedOfficeFile,
  resolveTrustedOfficeWorkspace,
  type ResolveWorkspaceRoot,
  type TrustedOfficeFile,
  type TrustedOfficeWorkspace,
} from '../office/office-workspace-guard'
import { officecliManager } from '../office/officecli-manager'

export interface OfficeHandlerOperations {
  detect(workspace: TrustedOfficeWorkspace): Promise<OfficecliInfo>
  listFiles(workspace: TrustedOfficeWorkspace): Promise<OfficeFileEntry[]>
  startPreview(file: TrustedOfficeFile): Promise<OfficePreviewLease>
  stopPreview(file: TrustedOfficeFile, request: OfficeStopPreviewRequest): Promise<void>
  reloadPreview(file: TrustedOfficeFile, request: OfficeReloadPreviewRequest): Promise<OfficePreviewLease>
  buildPrompt(file: TrustedOfficeFile, request: OfficeBuildPromptRequest): Promise<OfficePrompt>
}

export interface RegisterOfficeHandlersOptions {
  getAllowedWindows: () => readonly BrowserWindow[]
  resolveWorkspaceRoot: ResolveWorkspaceRoot
  operations?: Partial<OfficeHandlerOperations>
}

const ERROR_MESSAGES: Record<OfficeErrorCode, string> = {
  INVALID_REQUEST: 'Invalid Office request',
  UNAUTHORIZED: 'Office request is not authorized',
  UNAVAILABLE: 'Office feature is unavailable',
  NOT_INSTALLED: 'OfficeCLI is not installed',
  INCOMPATIBLE: 'OfficeCLI is not compatible',
  NOT_OFFICE: 'Unsupported Office file',
  OUTSIDE_ROOT: 'Office file is outside the workspace',
  START_FAILED: 'Office preview could not start',
  PORT_TIMEOUT: 'Office preview did not become ready',
  NO_PORT: 'No preview port is available',
  TOO_MANY: 'Too many Office previews are active',
  SCAN_LIMIT: 'Office workspace scan limit was reached',
  IO: 'Office file is unavailable',
}

function isAuthorizedSender(event: IpcMainInvokeEvent, getAllowedWindows: () => readonly BrowserWindow[]): boolean {
  return getAllowedWindows().some(
    (window) =>
      !window.isDestroyed() &&
      !window.webContents.isDestroyed() &&
      event.sender === window.webContents,
  )
}

function toPublicError(error: unknown): OfficeResult<never> {
  if (error instanceof OfficeWorkspaceGuardError) {
    return officeError(error.code, ERROR_MESSAGES[error.code])
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (
      typeof code === 'string' &&
      (OFFICE_WATCH_ERROR_CODES as readonly string[]).includes(code)
    ) {
      return officeError(code as OfficeErrorCode, ERROR_MESSAGES[code as OfficeErrorCode])
    }
  }

  return officeError('UNAVAILABLE', ERROR_MESSAGES.UNAVAILABLE)
}

function isSafeRelPath(value: string): boolean {
  return value.length > 0 &&
    value.length <= 4096 &&
    !/^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(value) &&
    !value.split(/[\\/]+/).includes('..')
}

function publicFileEntry(entry: OfficeFileEntry): OfficeFileEntry {
  if (
    !isSafeRelPath(entry.relPath) ||
    !(OFFICE_EXTENSIONS as readonly string[]).includes(entry.ext) ||
    extname(entry.relPath).toLowerCase() !== entry.ext ||
    !Number.isFinite(entry.mtimeMs) ||
    !Number.isFinite(entry.size) ||
    entry.size < 0
  ) {
    throw new Error('Invalid Office file entry')
  }

  return { relPath: entry.relPath, mtimeMs: entry.mtimeMs, size: entry.size, ext: entry.ext }
}

function publicLease(lease: OfficePreviewLease): OfficePreviewLease {
  if (
    !lease.previewLeaseId ||
    !Number.isInteger(lease.port) ||
    lease.port < 1 ||
    lease.port > 65535 ||
    !isSafeRelPath(lease.relPath)
  ) {
    throw new Error('Invalid Office preview lease')
  }

  return {
    previewLeaseId: lease.previewLeaseId,
    port: lease.port,
    relPath: lease.relPath,
  }
}

function publicPrompt(prompt: OfficePrompt): OfficePrompt {
  if (
    typeof prompt.text !== 'string' ||
    !['generic', 'specific', 'guidance'].includes(prompt.mode)
  ) {
    throw new Error('Invalid Office prompt')
  }
  return { text: prompt.text, mode: prompt.mode }
}

function publicManualInstall(guidance: OfficecliManualInstallGuidance): OfficecliManualInstallGuidance {
  return {
    repository: guidance.repository,
    release: guidance.release,
    targetVersion: guidance.targetVersion,
    integrity: guidance.integrity,
    windows: [...guidance.windows],
    automaticInstallEnabled: false,
    automaticUninstallEnabled: false,
  }
}

export function registerOfficeHandlers(options: RegisterOfficeHandlersOptions): () => void {
  const { operations: operationOverrides = {}, resolveWorkspaceRoot } = options
  const operations: Partial<OfficeHandlerOperations> = {
    detect: async () => officecliManager.detect(),
    ...operationOverrides,
  }
  const channels = Object.values(OFFICE_INVOKE_CHANNELS)
  channels.forEach((channel) => ipcMain.removeHandler(channel))

  ipcMain.handle(OFFICE_INVOKE_CHANNELS.detect, async (event, rawRequest) => {
    if (!isAuthorizedSender(event, options.getAllowedWindows)) {
      return officeError('UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED)
    }
    const request = validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.detect, rawRequest)
    if (!request.ok) return officeError('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST)
    if (!operations.detect) return officeError('UNAVAILABLE', ERROR_MESSAGES.UNAVAILABLE)

    try {
      const info = await operations.detect(
        await resolveTrustedOfficeWorkspace(request.value.workspaceId, resolveWorkspaceRoot),
      )
      return officeOk({
        installed: info.installed,
        compatible: info.compatible,
        ...(info.version ? { version: info.version } : {}),
        ...(info.source ? { source: info.source } : {}),
        ...(info.manualInstall ? { manualInstall: publicManualInstall(info.manualInstall) } : {}),
        ...(info.existingTerminalNotice ? { existingTerminalNotice: info.existingTerminalNotice } : {}),
      })
    } catch (error) {
      return toPublicError(error)
    }
  })

  ipcMain.handle(OFFICE_INVOKE_CHANNELS.listFiles, async (event, rawRequest) => {
    if (!isAuthorizedSender(event, options.getAllowedWindows)) {
      return officeError('UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED)
    }
    const request = validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.listFiles, rawRequest)
    if (!request.ok) return officeError('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST)
    if (!operations.listFiles) return officeError('UNAVAILABLE', ERROR_MESSAGES.UNAVAILABLE)

    try {
      const entries = await operations.listFiles(
        await resolveTrustedOfficeWorkspace(request.value.workspaceId, resolveWorkspaceRoot),
      )
      return officeOk(entries.map(publicFileEntry))
    } catch (error) {
      return toPublicError(error)
    }
  })

  ipcMain.handle(OFFICE_INVOKE_CHANNELS.startPreview, async (event, rawRequest) => {
    if (!isAuthorizedSender(event, options.getAllowedWindows)) {
      return officeError('UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED)
    }
    const request = validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.startPreview, rawRequest)
    if (!request.ok) return officeError('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST)
    if (!operations.startPreview) return officeError('UNAVAILABLE', ERROR_MESSAGES.UNAVAILABLE)

    try {
      const file = await resolveTrustedOfficeFile(request.value, resolveWorkspaceRoot)
      return officeOk(publicLease(await operations.startPreview(file)))
    } catch (error) {
      return toPublicError(error)
    }
  })

  ipcMain.handle(OFFICE_INVOKE_CHANNELS.stopPreview, async (event, rawRequest) => {
    if (!isAuthorizedSender(event, options.getAllowedWindows)) {
      return officeError('UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED)
    }
    const request = validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.stopPreview, rawRequest)
    if (!request.ok) return officeError('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST)
    if (!operations.stopPreview) return officeError('UNAVAILABLE', ERROR_MESSAGES.UNAVAILABLE)

    try {
      const file = await resolveTrustedOfficeFile(request.value, resolveWorkspaceRoot)
      await operations.stopPreview(file, request.value)
      return officeOk(null)
    } catch (error) {
      return toPublicError(error)
    }
  })

  ipcMain.handle(OFFICE_INVOKE_CHANNELS.reloadPreview, async (event, rawRequest) => {
    if (!isAuthorizedSender(event, options.getAllowedWindows)) {
      return officeError('UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED)
    }
    const request = validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.reloadPreview, rawRequest)
    if (!request.ok) return officeError('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST)
    if (!operations.reloadPreview) return officeError('UNAVAILABLE', ERROR_MESSAGES.UNAVAILABLE)

    try {
      const file = await resolveTrustedOfficeFile(request.value, resolveWorkspaceRoot)
      return officeOk(publicLease(await operations.reloadPreview(file, request.value)))
    } catch (error) {
      return toPublicError(error)
    }
  })

  ipcMain.handle(OFFICE_INVOKE_CHANNELS.buildPrompt, async (event, rawRequest) => {
    if (!isAuthorizedSender(event, options.getAllowedWindows)) {
      return officeError('UNAUTHORIZED', ERROR_MESSAGES.UNAUTHORIZED)
    }
    const request = validateOfficeInvokeRequest(OFFICE_INVOKE_CHANNELS.buildPrompt, rawRequest)
    if (!request.ok) return officeError('INVALID_REQUEST', ERROR_MESSAGES.INVALID_REQUEST)
    if (!operations.buildPrompt) return officeError('UNAVAILABLE', ERROR_MESSAGES.UNAVAILABLE)

    try {
      const file = await resolveTrustedOfficeFile(request.value, resolveWorkspaceRoot)
      return officeOk(publicPrompt(await operations.buildPrompt(file, request.value)))
    } catch (error) {
      return toPublicError(error)
    }
  })

  return () => channels.forEach((channel) => ipcMain.removeHandler(channel))
}
