import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { CC_SWITCH_CHANNELS, type CcSwitchToolId } from '../../shared/ipc/cc-switch'
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

export function registerCcSwitchHandlers(options: RegisterCcSwitchHandlersOptions): () => void {
  const service = options.service ?? ccSwitchService
  const channels = [
    CC_SWITCH_CHANNELS.detect,
    CC_SWITCH_CHANNELS.latest,
    CC_SWITCH_CHANNELS.install,
    CC_SWITCH_CHANNELS.applyLlm,
    CC_SWITCH_CHANNELS.rollbackProfile,
  ] as const

  for (const channel of channels) {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      const fallbackTool: CcSwitchToolId = 'claude'
      if (!isAuthorizedSender(event, options.getAllowedWindows)) {
        if (channel === CC_SWITCH_CHANNELS.latest) return { toolId: fallbackTool }
        if (channel === CC_SWITCH_CHANNELS.rollbackProfile) return { success: false, error: 'Unauthorized' }
        return { toolId: fallbackTool, success: false, error: 'Unauthorized' }
      }
      try {
        if (channel === CC_SWITCH_CHANNELS.latest) {
          if (!isSupportedToolId(payload)) return { toolId: fallbackTool }
          return service.latest(payload)
        }
        if (channel === CC_SWITCH_CHANNELS.rollbackProfile) return service.rollbackProfile()
        if (!isSupportedToolId(payload)) return { toolId: fallbackTool, success: false, error: 'Unsupported tool.' }
        if (channel === CC_SWITCH_CHANNELS.detect) return service.detect(payload)
        if (channel === CC_SWITCH_CHANNELS.applyLlm) return service.applyLlm(payload)
        return service.install(payload)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (channel === CC_SWITCH_CHANNELS.latest) return { toolId: fallbackTool }
        if (channel === CC_SWITCH_CHANNELS.detect) {
          return { toolId: isSupportedToolId(payload) ? payload : fallbackTool, installed: false, runnable: false, hint: message }
        }
        if (channel === CC_SWITCH_CHANNELS.rollbackProfile) return { success: false, error: message }
        return { toolId: isSupportedToolId(payload) ? payload : fallbackTool, success: false, error: message }
      }
    })
  }

  return () => channels.forEach((channel) => ipcMain.removeHandler(channel))
}
