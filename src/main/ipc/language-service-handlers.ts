import { ipcMain } from 'electron'
import { LANGUAGE_SERVICE_CHANNELS, type DefinitionRequest } from '../../shared/ipc/language-service'
import { clangdManager } from '../language-service/clangd-manager'

export function registerLanguageServiceHandlers(): void {
  ipcMain.handle(LANGUAGE_SERVICE_CHANNELS.definition, (_event, request: DefinitionRequest) => (
    clangdManager.definition(request)
  ))
}
