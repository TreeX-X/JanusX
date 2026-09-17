import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import {
  CC_SWITCH_CHANNELS,
  type CcSwitchProfileInput,
  type CcSwitchToolId,
} from '../../shared/ipc/cc-switch'
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

function isProfileInput(value: unknown): value is CcSwitchProfileInput {
  return typeof value === 'object' && value !== null
}

export function registerCcSwitchHandlers(options: RegisterCcSwitchHandlersOptions): () => void {
  const service = options.service ?? ccSwitchService
  const channels = [
    CC_SWITCH_CHANNELS.detect,
    CC_SWITCH_CHANNELS.latest,
    CC_SWITCH_CHANNELS.install,
    CC_SWITCH_CHANNELS.profiles,
    CC_SWITCH_CHANNELS.saveProfile,
    CC_SWITCH_CHANNELS.removeProfile,
    CC_SWITCH_CHANNELS.activateProfile,
    CC_SWITCH_CHANNELS.rollbackProfile,
  ] as const

  for (const channel of channels) {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      const fallbackTool: CcSwitchToolId = 'claude'
      if (!isAuthorizedSender(event, options.getAllowedWindows)) {
        if (channel === CC_SWITCH_CHANNELS.latest) return { toolId: fallbackTool }
        if (channel === CC_SWITCH_CHANNELS.install) return { toolId: fallbackTool, success: false, error: 'Unauthorized' }
        if (channel === CC_SWITCH_CHANNELS.profiles) return { profiles: [], activeProfileId: null }
        if (channel === CC_SWITCH_CHANNELS.saveProfile || channel === CC_SWITCH_CHANNELS.removeProfile) {
          return { success: false, error: 'Unauthorized' }
        }
        if (channel === CC_SWITCH_CHANNELS.activateProfile || channel === CC_SWITCH_CHANNELS.rollbackProfile) {
          return { success: false, error: 'Unauthorized' }
        }
        return { toolId: fallbackTool, installed: false, runnable: false, hint: 'Unauthorized' }
      }
      try {
        if (channel === CC_SWITCH_CHANNELS.detect) {
          if (!isSupportedToolId(payload)) {
            return { toolId: fallbackTool, installed: false, runnable: false, hint: 'Unsupported tool.' }
          }
          return service.detect(payload)
        }
        if (channel === CC_SWITCH_CHANNELS.latest) {
          if (!isSupportedToolId(payload)) return { toolId: fallbackTool }
          return service.latest(payload)
        }
        if (channel === CC_SWITCH_CHANNELS.install) {
          if (!isSupportedToolId(payload)) return { toolId: fallbackTool, success: false, error: 'Unsupported tool.' }
          return service.install(payload)
        }
        if (channel === CC_SWITCH_CHANNELS.profiles) return service.profiles()
        if (channel === CC_SWITCH_CHANNELS.saveProfile) {
          if (!isProfileInput(payload)) return { success: false, error: 'Invalid profile.' }
          return service.saveProfile(payload)
        }
        if (channel === CC_SWITCH_CHANNELS.removeProfile || channel === CC_SWITCH_CHANNELS.activateProfile) {
          if (typeof payload !== 'string' || !payload) return { success: false, error: 'Invalid profile id.' }
          return channel === CC_SWITCH_CHANNELS.removeProfile
            ? service.removeProfile(payload)
            : service.activateProfile(payload)
        }
        return service.rollbackProfile()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (channel === CC_SWITCH_CHANNELS.latest) return { toolId: fallbackTool }
        if (channel === CC_SWITCH_CHANNELS.detect) {
          return { toolId: isSupportedToolId(payload) ? payload : fallbackTool, installed: false, runnable: false, hint: message }
        }
        if (channel === CC_SWITCH_CHANNELS.profiles) return { profiles: [], activeProfileId: null }
        return { success: false, error: message }
      }
    })
  }

  return () => channels.forEach((channel) => ipcMain.removeHandler(channel))
}
