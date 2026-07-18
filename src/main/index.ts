import { app, BrowserWindow } from 'electron'
import { isAgentHookClientInvocation, runAgentHookClient } from './notifications/agent-hook-client'
import { configureChromiumSessionPaths } from './bootstrap/session'

const isHookClient = isAgentHookClientInvocation()

configureChromiumSessionPaths(isHookClient)

if (isHookClient) {
  void runAgentHookClient()
    .catch(() => {})
    .finally(() => {
      process.exit(0)
    })
} else {
  void bootstrapApp()
}

async function bootstrapApp(): Promise<void> {
  const [
    { disposeWorkspaceWatchers },
    { stopAllProjects },
    { abortAllChatStreams },
    { registerApplicationIpc },
    { initializeOfficecliProvider, officecliManager },
    { createApplicationServices },
    { terminalManager },
    { agentStreamManager },
    { analyzer },
    { desktopToastWindow },
    { appShutdown },
    { EditorWindowManager },
    { createMainWindow },
    { registerWindowIpc },
    { feishuInboundRuntime },
  ] = await Promise.all([
    import('./ipc/handlers'),
    import('./ipc/project-handlers'),
    import('./ipc/llm-handlers'),
    import('./ipc/register'),
    import('./office/officecli-manager'),
    import('./bootstrap/services'),
    import('./terminal/manager'),
    import('./agent/stream-manager'),
    import('./janus/analyzer'),
    import('./notifications/desktop-toast-window'),
    import('./shutdown/AppShutdown'),
    import('./windows/editor-window'),
    import('./windows/main-window'),
    import('./windows/register-window-ipc'),
    import('./remote-notifications/feishu-inbound/runtime'),
  ])

  let mainWindow: BrowserWindow | null = null
  const editorWindows = new EditorWindowManager()
  const getOfficeWindows = (): BrowserWindow[] => [
    ...(mainWindow && !mainWindow.isDestroyed() ? [mainWindow] : []),
    ...editorWindows.list(),
  ]
  const { resolveOfficeWorkspaceRoot, officecliInstaller, officeWatchPool, officeArtifactIndex } =
    createApplicationServices(getOfficeWindows)

  appShutdown.configure({
    abortChatStreams: () => abortAllChatStreams(),
    cancelAnalyzer: () => analyzer.cancelAll(),
    killTerminals: () => terminalManager.killAll(),
    killAgents: () => agentStreamManager.killAll(),
    stopProjects: () => stopAllProjects(),
    stopOfficeWatches: () => officeWatchPool.stopAll(),
    disposeOfficeArtifactIndexes: () => officeArtifactIndex.disposeAll(),
    disposeWatchers: () => disposeWorkspaceWatchers(),
    destroyToast: () => desktopToastWindow.destroy(),
    closeEditors: () => editorWindows.closeAll(),
    stopCompanion: () => feishuInboundRuntime.stop(),
  })

  function createWindow(): void {
    mainWindow = createMainWindow(() => {
      officeArtifactIndex.disposeAll()
      void feishuInboundRuntime.stop()
      mainWindow = null
      if (process.platform === 'darwin') return
      if (appShutdown.isQuitting) return
      app.quit()
    })
    registerApplicationIpc({
      mainWindow,
      getAllowedWindows: getOfficeWindows,
      resolveWorkspaceRoot: resolveOfficeWorkspaceRoot,
      officeWatchPool,
      officeArtifactIndex,
      officecliInstaller,
    })
    registerWindowIpc(editorWindows)
    feishuInboundRuntime.configure(mainWindow)
    void feishuInboundRuntime.reconfigure()
  }

  const hasSingleInstanceLock = app.requestSingleInstanceLock()

  if (!hasSingleInstanceLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        if (app.isReady()) createWindow()
        return
      }

      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    })

    app.whenReady().then(async () => {
      officecliManager.configureManagedBinaryPath(await officecliInstaller.getManagedBinary())
      await initializeOfficecliProvider()
      createWindow()

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
      })
    })

    app.on('window-all-closed', () => {
      // Keep macOS app alive until explicit quit; other platforms exit.
      if (process.platform === 'darwin') return
      if (appShutdown.isQuitting) return
      app.quit()
    })

    app.on('before-quit', (event) => {
      if (appShutdown.isQuitting) return
      event.preventDefault()
      void appShutdown.beginQuit({ reason: 'before-quit' })
    })
  }
}
