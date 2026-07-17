import { ipcMain } from 'electron'
import {
  getRuntimeTelemetrySnapshot,
  type RuntimeTelemetryRequest,
} from '../runtime-telemetry/history'
import { SYSTEM_CHANNELS } from '../../shared/ipc/system'

export function registerRuntimeTelemetryHandlers(): void {
  ipcMain.handle(SYSTEM_CHANNELS.runtimeTelemetry, async (_event, request: RuntimeTelemetryRequest) => {
    return getRuntimeTelemetrySnapshot(request)
  })
}
