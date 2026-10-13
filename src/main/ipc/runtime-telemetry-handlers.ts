import { ipcMain } from 'electron'
import { terminalContextCoordinator } from '../runtime-telemetry/coordinator'
import { SYSTEM_CHANNELS } from '../../shared/ipc/system'
import type { RuntimeTelemetryRequest } from '../../shared/ipc/system'
import type { UsageLedgerQuery } from '../../shared/usage'

export function registerRuntimeTelemetryHandlers(): void {
  ipcMain.handle(SYSTEM_CHANNELS.runtimeTelemetry, async (_event, request: RuntimeTelemetryRequest) => {
    return terminalContextCoordinator.getSnapshot(request)
  })
  ipcMain.handle(SYSTEM_CHANNELS.usageLedger, (_event, query: UsageLedgerQuery) => terminalContextCoordinator.listUsage(query))
}
