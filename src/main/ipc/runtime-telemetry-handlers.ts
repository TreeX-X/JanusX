import { ipcMain } from 'electron'
import {
  getRuntimeTelemetrySnapshot,
  type RuntimeTelemetryRequest,
} from '../runtime-telemetry/history'

export function registerRuntimeTelemetryHandlers(): void {
  ipcMain.handle('runtime-telemetry:get', async (_event, request: RuntimeTelemetryRequest) => {
    return getRuntimeTelemetrySnapshot(request)
  })
}
