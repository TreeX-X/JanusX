import { ipcMain, type BrowserWindow } from 'electron'
import {
  LANGUAGE_SERVICE_CHANNELS,
  LANGUAGE_SERVICE_EVENT_CHANNELS,
  type LanguageServiceId,
  type LanguageServiceInstallerProgressEvent,
  type LanguageServiceManagedInstallStatus,
  type LanguageServiceInstallerStartRequest,
  type LanguageServiceInstallerRemoveRequest,
  type LanguageServiceInstallerStatusRequest,
} from '../../shared/ipc/language-service'
import { getDescriptor, getAllDescriptors } from '../language-service/registry'
import type { ManagedBinaryInstaller } from '../language-service/installer'
import { clangdManager } from '../language-service/clangd-manager'

export interface LanguageServiceInstallerHandlerOptions {
  getAllowedWindows: () => readonly BrowserWindow[]
  installers: ReadonlyMap<LanguageServiceId, ManagedBinaryInstaller>
}

function isAuthorizedSender(event: Electron.IpcMainInvokeEvent, getAllowedWindows: () => readonly BrowserWindow[]): boolean {
  return getAllowedWindows().some(
    (window) => !window.isDestroyed() && !window.webContents.isDestroyed() && event.sender === window.webContents,
  )
}

function isValidServiceId(value: unknown): value is LanguageServiceId {
  return typeof value === 'string' && getAllDescriptors().some(d => d.id === value)
}

function publicStatus(status: LanguageServiceManagedInstallStatus): LanguageServiceManagedInstallStatus {
  return {
    serviceId: status.serviceId,
    state: status.state,
    version: status.version,
    sha256: status.sha256,
    source: status.source,
    location: status.location,
    error: status.error,
  }
}

export function registerLanguageServiceInstallerHandlers(options: LanguageServiceInstallerHandlerOptions): () => void {
  const broadcast = (event: LanguageServiceInstallerProgressEvent) => {
    for (const window of options.getAllowedWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send(LANGUAGE_SERVICE_EVENT_CHANNELS.installerProgress, event)
      }
    }
  }

  const channels = [
    LANGUAGE_SERVICE_CHANNELS.installerStatus,
    LANGUAGE_SERVICE_CHANNELS.installerStart,
    LANGUAGE_SERVICE_CHANNELS.installerCancel,
    LANGUAGE_SERVICE_CHANNELS.installerRemove,
  ] as const

  for (const channel of channels) {
    ipcMain.handle(channel, async (event, rawRequest) => {
      if (!isAuthorizedSender(event, options.getAllowedWindows)) {
        return publicStatus({
          serviceId: 'clangd',
          state: 'failed',
          location: '',
          error: 'Unauthorized',
        })
      }
      if (!rawRequest || typeof rawRequest !== 'object' || !isValidServiceId(rawRequest.serviceId)) {
        return publicStatus({
          serviceId: 'clangd',
          state: 'failed',
          location: '',
          error: 'Invalid request',
        })
      }
      const serviceId = rawRequest.serviceId as LanguageServiceId
      const installer = options.installers.get(serviceId)
      if (!installer) {
        return publicStatus({
          serviceId,
          state: 'failed',
          location: '',
          error: 'Unknown language service',
        })
      }

      try {
        if (channel === LANGUAGE_SERVICE_CHANNELS.installerStatus) {
          const req = rawRequest as LanguageServiceInstallerStatusRequest
          return publicStatus(await installer.status())
        }
        if (channel === LANGUAGE_SERVICE_CHANNELS.installerCancel) {
          installer.cancel()
          return publicStatus(await installer.status())
        }
        if (channel === LANGUAGE_SERVICE_CHANNELS.installerRemove) {
          const req = rawRequest as LanguageServiceInstallerRemoveRequest
          if (req.confirmed !== true) {
            return publicStatus({ serviceId, state: 'failed', location: '', error: 'Confirmation required' })
          }
          const status = await installer.remove()
          if (serviceId === 'clangd') clangdManager.configureManagedBinaryPath(undefined)
          return publicStatus(status)
        }
        const req = rawRequest as LanguageServiceInstallerStartRequest
        if (req.confirmed !== true) {
          return publicStatus({ serviceId, state: 'failed', location: '', error: 'Confirmation required' })
        }
        const status = await installer.start(req.repair === true)
        if (serviceId === 'clangd') {
          const managedBinary = await installer.getManagedBinary()
          clangdManager.configureManagedBinaryPath(managedBinary)
        }
        return publicStatus(status)
      } catch (error) {
        return publicStatus({
          serviceId,
          state: 'failed',
          location: '',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  return () => channels.forEach((channel) => ipcMain.removeHandler(channel))
}