import { ipcMain } from 'electron'
import { JANUS_CHAT_CHANNELS, type JanusChatStorageSnapshot } from '../../shared/ipc/janus-chat'
import { janusChatStore } from '../janus/chat-store'

export function registerJanusChatHandlers(): void {
  ipcMain.handle(JANUS_CHAT_CHANNELS.load, () => janusChatStore.load())
  ipcMain.handle(JANUS_CHAT_CHANNELS.save, async (_, snapshot: JanusChatStorageSnapshot) => {
    await janusChatStore.save(snapshot)
    return { success: true }
  })
}
