export interface TerminalCreationRollback {
  clearState(): void
  unregisterCompanion(): void
  unregisterHook(): void
  unregisterRecorder(): void
  unregisterTelemetry?(): void
  removeRun(): void
  killPty(): void
}

export function rollbackTerminalCreation(operations: TerminalCreationRollback): void {
  for (const operation of [operations.clearState, operations.unregisterCompanion, operations.unregisterHook, operations.unregisterRecorder, operations.unregisterTelemetry, operations.removeRun, operations.killPty]) {
    if (!operation) continue
    try { operation() } catch { /* best-effort reverse cleanup */ }
  }
}
