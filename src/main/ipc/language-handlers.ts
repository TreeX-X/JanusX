import { ipcMain } from 'electron'
import { configService } from '../config/service'
import { SYSTEM_CHANNELS } from '../../shared/ipc/system'

export function registerLanguageHandlers(): void {
  ipcMain.handle(SYSTEM_CHANNELS.getLanguage, async () => configService.getLanguage())
  ipcMain.handle(SYSTEM_CHANNELS.setLanguage, async (_event, lang: string) => {
    await configService.setLanguage(lang)
  })
}