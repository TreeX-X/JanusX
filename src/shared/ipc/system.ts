export const SYSTEM_CHANNELS = {
  defaultShell: 'system:getDefaultShell', platform: 'system:getPlatform',
  openDirectory: 'dialog:openDirectory', saveFile: 'dialog:saveFile',
  minimize: 'window:minimize', maximize: 'window:maximize', close: 'window:close',
  openEditor: 'editor-window:open', embedEditor: 'editor-window:embed', editorEmbedded: 'editor-window:embedded',
  setAlwaysOnTop: 'editor-window:set-always-on-top', runtimeTelemetry: 'runtime-telemetry:get',
  toastReady: 'desktop-toast:ready', toastAction: 'desktop-toast:action', toastShow: 'desktop-toast:show',
} as const

export interface RuntimeTelemetryRequest { preset?: 'shell' | 'claude' | 'codex' | 'opencode'; cwd?: string; startedAt?: number }
export interface RuntimeTelemetrySnapshot {
  detectedModel?: string; contextTokens?: number; contextWindowTokens?: number; inputTokens?: number; outputTokens?: number
  filePath?: string; sessionId?: string; updatedAt?: number
}
export interface DesktopToastPayload {
  id?: string; type?: 'completed' | 'failed' | 'attention'; engine?: string; title?: string; body?: string
  terminalId?: string; workspaceId?: string; createdAt?: string
}

export interface DialogAPI {
  openDirectory(): Promise<{ canceled: boolean; filePaths: string[] }>
  saveFile(options: { defaultName?: string; extension?: string }): Promise<{ canceled: boolean; filePath?: string }>
}
export interface WindowAPI {
  minimize(): Promise<void>; maximize(): Promise<void>; close(): Promise<void>
  openEditor(payload: { filePath?: string; workspacePath?: string }): Promise<{ success?: boolean }>
  embedEditor(payload: { filePath: string; workspacePath: string; content?: string; isDirty?: boolean }): Promise<{ success?: boolean }>
  setAlwaysOnTop(value: boolean): Promise<{ value: boolean }>
  onEditorEmbedded(callback: (payload: { filePath: string; workspacePath: string; content?: string; isDirty?: boolean }) => void): () => void
}
export interface SystemAPI {
  getDefaultShell(): Promise<string>; getPlatform(): Promise<NodeJS.Platform>
  getRuntimeTelemetry(request: RuntimeTelemetryRequest): Promise<RuntimeTelemetrySnapshot | null>
}
export interface DesktopToastAPI {
  ready(): void; action(action: 'activate' | 'dismiss'): void
  onShow(callback: (payload: DesktopToastPayload) => void): () => void
}
