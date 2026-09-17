import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { CC_SWITCH_CHANNELS, type CcSwitchApplyProviderRequest, type CcSwitchToolId } from '../../shared/ipc/cc-switch'
import { ccSwitchService, type CcSwitchService } from '../cc-switch/service'

export interface RegisterCcSwitchHandlersOptions {
  getAllowedWindows: () => readonly BrowserWindow[]
  service?: CcSwitchService
}

function isAuthorizedSender(event: IpcMainInvokeEvent, getAllowedWindows: () => readonly BrowserWindow[]): boolean {
  return getAllowedWindows().some(
    (window) =>
      !window.isDestroyed() &&
      !window.webContents.isDestroyed() &&
      event.sender === window.webContents,
  )
}

function isSupportedToolId(value: unknown): value is CcSwitchToolId {
  return value === 'claude'
}

function isApplyProviderRequest(value: unknown): value is CcSwitchApplyProviderRequest {
  if (typeof value !== 'object' || value === null) return false
  const request = value as Record<string, unknown>
  return isSupportedToolId(request.toolId) &&
    (request.providerId === null || typeof request.providerId === 'string')
}

export function registerCcSwitchHandlers(options: RegisterCcSwitchHandlersOptions): () => void {
  const service = options.service ?? ccSwitchService
  const channels = [
    CC_SWITCH_CHANNELS.detect,
    CC_SWITCH_CHANNELS.latest,
    CC_SWITCH_CHANNELS.install,
    CC_SWITCH_CHANNELS.applyProvider,
    CC_SWITCH_CHANNELS.syncState,
    CC_SWITCH_CHANNELS.rollbackProfile,
  ] as const

  for (const channel of channels) {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      const fallbackTool: CcSwitchToolId = 'claude'
      if (!isAuthorizedSender(event, options.getAllowedWindows)) {
        if (channel === CC_SWITCH_CHANNELS.latest) return { toolId: fallbackTool }
        if (channel === CC_SWITCH_CHANNELS.syncState) return { claude: null }
        if (channel === CC_SWITCH_CHANNELS.rollbackProfile) return { success: false, error: 'Unauthorized' }
        return { toolId: fallbackTool, success: false, error: 'Unauthorized' }
      }
      try {
        if (channel === CC_SWITCH_CHANNELS.latest) {
          if (!isSupportedToolId(payload)) return { toolId: fallbackTool }
          return service.latest(payload)
        }
        if (channel === CC_SWITCH_CHANNELS.syncState) return service.syncState()
        if (channel === CC_SWITCH_CHANNELS.rollbackProfile) return service.rollbackProfile()
        if (channel === CC_SWITCH_CHANNELS.applyProvider) {
          if (!isApplyProviderRequest(payload)) return { success: false, error: 'Invalid request.' }
          return service.applyProvider(payload.toolId, payload.providerId)
        }
        if (!isSupportedToolId(payload)) return { toolId: fallbackTool, success: false, error: 'Unsupported tool.' }
        if (channel === CC_SWITCH_CHANNELS.detect) return service.detect(payload)
        return service.install(payload)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (channel === CC_SWITCH_CHANNELS.latest) return { toolId: fallbackTool }
        if (channel === CC_SWITCH_CHANNELS.syncState) return { claude: null }
        if (channel === CC_SWITCH_CHANNELS.detect) {
          return { toolId: isSupportedToolId(payload) ? payload : fallbackTool, installed: false, runnable: false, hint: message }
        }
        if (channel === CC_SWITCH_CHANNELS.rollbackProfile || channel === CC_SWITCH_CHANNELS.applyProvider) {
          return { success: false, error: message }
        }
        return { toolId: isSupportedToolId(payload) ? payload : fallbackTool, success: false, error: message }
      }
    })
  }

  return () => channels.forEach((channel) => ipcMain.removeHandler(channel))
}
