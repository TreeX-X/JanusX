import { app, BrowserWindow, ipcMain, nativeImage, shell, type Session } from 'electron'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { isAgentHookClientInvocation, runAgentHookClient } from './notifications/agent-hook-client'
import { OFFICE_EVENT_CHANNELS } from '../shared/office'

const OFFICE_FRAME_CSP = "frame-src 'self' http://127.0.0.1:*; object-src 'none'; base-uri 'self'"
const cspSessions = new WeakSet<Session>()

function installProductionCsp(session: Session): void {
  if (!app.isPackaged || cspSessions.has(session)) return
  cspSessions.add(session)

  session.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame' || !details.url.startsWith('file:')) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    const responseHeaders = { ...details.responseHeaders }
    for (const header of Object.keys(responseHeaders)) {
      if (header.toLowerCase() === 'content-security-policy') delete responseHeaders[header]
    }
    callback({ responseHeaders: { ...responseHeaders, 'Content-Security-Policy': [OFFICE_FRAME_CSP] } })
  })
}

const isHookClient = isAgentHookClientInvocation()

function canWriteDirectory(directory: string): boolean {
  try {
    mkdirSync(directory, { recursive: true })
    const probePath = join(directory, `.janusx-write-test-${process.pid}`)
    writeFileSync(probePath, '')
    unlinkSync(probePath)
    return true
  } catch {
    return false
  }
}

function configureChromiumSessionPaths(): void {
  if (isHookClient) {
    const hookDataRoot = join(tmpdir(), 'JanusX', 'hook-client', String(process.pid))
    const hookSessionData = join(hookDataRoot, 'session')
    const hookCacheData = join(hookDataRoot, 'Cache')
    if (
      !canWriteDirectory(hookDataRoot) ||
      !canWriteDirectory(hookSessionData) ||
      !canWriteDirectory(hookCacheData)
    ) {
      return
    }

    app.setPath('userData', hookDataRoot)
    app.setPath('sessionData', hookSessionData)
    app.commandLine.appendSwitch('disk-cache-dir', hookCacheData)
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
    app.disableHardwareAcceleration()
    return
  }

  const preferredSessionData = join(app.getPath('userData'), 'chromium-session')
  const sessionDataPath = canWriteDirectory(preferredSessionData)
    ? preferredSessionData
    : join(tmpdir(), 'JanusX', 'chromium-session', String(process.pid))

  if (!canWriteDirectory(sessionDataPath)) return

  app.setPath('sessionData', sessionDataPath)
  app.commandLine.appendSwitch('disk-cache-dir', join(sessionDataPath, 'Cache'))
}

configureChromiumSessionPaths()

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
    { is },
    { registerWorkspaceHandlers, disposeWorkspaceWatchers, subscribeWorkspaceWatcher },
    { registerTerminalHandlers },
    { registerGitHandlers },
    { registerAgentHandlers },
    { registerCheckpointHandlers },
    { registerFileHandlers },
    { registerProjectHandlers, stopAllProjects },
    { registerLlmHandlers, abortAllChatStreams },
    { registerJanusHandlers },
    { registerRuntimeTelemetryHandlers },
    { registerSettingsHandlers },
    { registerSubAgentRunHandlers },
    { registerKnowledgeHandlers },
    { registerOfficeHandlers },
    { createRegisteredWorkspaceRootResolver },
    { initializeOfficecliProvider, officecliManager },
    { OfficecliInstaller },
    { resolveOfficecliManagedRoot },
    { OfficeWatchPool },
    { OfficeArtifactIndex },
    { createProductionOfficeOperations },
    { terminalManager },
    { agentStreamManager },
    { analyzer },
    { desktopToastWindow },
    { appShutdown },
  ] = await Promise.all([
    import('@electron-toolkit/utils'),
    import('./ipc/handlers'),
    import('./ipc/terminal-handlers'),
    import('./ipc/git-handlers'),
    import('./ipc/agent-handlers'),
    import('./ipc/checkpoint-handlers'),
    import('./ipc/file-handlers'),
    import('./ipc/project-handlers'),
    import('./ipc/llm-handlers'),
    import('./ipc/janus-handlers'),
    import('./ipc/runtime-telemetry-handlers'),
    import('./ipc/settings-handlers'),
    import('./ipc/subagent-run-handlers'),
    import('./ipc/knowledge-handlers'),
    import('./ipc/office-handlers'),
    import('./office/office-workspace-guard'),
    import('./office/officecli-manager'),
    import('./office/officecli-installer'),
    import('./office/office-managed-root'),
    import('./office/office-watch-pool'),
    import('./office/office-artifact-index'),
    import('./office/office-handler-operations'),
    import('./terminal/manager'),
    import('./agent/stream-manager'),
    import('./janus/analyzer'),
    import('./notifications/desktop-toast-window'),
    import('./shutdown/AppShutdown'),
  ])

  let mainWindow: BrowserWindow | null = null
  const editorWindows = new Map<string, BrowserWindow>()
  const resolveOfficeWorkspaceRoot = createRegisteredWorkspaceRootResolver(
    join(app.getPath('userData'), 'janusx', 'workspaces'),
  )
  const getOfficeWindows = (): BrowserWindow[] => [
    ...(mainWindow && !mainWindow.isDestroyed() ? [mainWindow] : []),
    ...Array.from(editorWindows.values()).filter((window) => !window.isDestroyed()),
  ]
  const officecliInstaller = new OfficecliInstaller(
    resolveOfficecliManagedRoot({ userDataDir: app.getPath('userData') }),
    (event) => {
      for (const window of getOfficeWindows()) {
        if (!window.webContents.isDestroyed()) window.webContents.send(OFFICE_EVENT_CHANNELS.installerProgress, event)
      }
    },
    { verifyBinary: (binary, signal) => officecliManager.verifyManagedBinary(binary, signal) },
  )
  const officeWatchPool = new OfficeWatchPool(resolveOfficeWorkspaceRoot, {
    onEvicted: (event) => {
      for (const window of getOfficeWindows()) {
        if (!window.webContents.isDestroyed()) {
          window.webContents.send(OFFICE_EVENT_CHANNELS.watchEvicted, event)
        }
      }
    },
  })
  const officeArtifactIndex = new OfficeArtifactIndex(resolveOfficeWorkspaceRoot, {
    subscribe: subscribeWorkspaceWatcher,
    onChanged: (event) => {
      for (const window of getOfficeWindows()) {
        if (!window.webContents.isDestroyed()) {
          window.webContents.send(OFFICE_EVENT_CHANNELS.filesChanged, event)
        }
      }
    },
  })

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
    closeEditors: () => {
      for (const window of editorWindows.values()) {
        if (!window.isDestroyed()) window.destroy()
      }
      editorWindows.clear()
    },
  })

  async function resolveDevRendererUrl(rawUrl: string): Promise<string> {
    const baseUrl = new URL(rawUrl)
    const candidates = buildDevRendererUrlCandidates(baseUrl)

    for (let attempt = 0; attempt < 20; attempt++) {
      for (const candidate of candidates) {
        if (await canReachRenderer(candidate)) return candidate
      }
      await delay(250)
    }

    return rawUrl
  }

  function buildDevRendererUrlCandidates(baseUrl: URL): string[] {
    const candidates = new Set<string>([baseUrl.toString()])
    const basePort = Number(baseUrl.port)
    if (!Number.isFinite(basePort) || basePort <= 0) return Array.from(candidates)

    for (let port = basePort; port <= basePort + 5; port++) {
      const candidate = new URL(baseUrl.toString())
      if (candidate.hostname === 'localhost') candidate.hostname = '127.0.0.1'
      candidate.port = String(port)
      candidate.pathname = '/'
      candidate.search = ''
      candidate.hash = ''
      candidates.add(candidate.toString())
    }

    return Array.from(candidates)
  }

  async function canReachRenderer(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(1_000),
      })
      return response.status < 500
    } catch {
      return false
    }
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function loadRendererWindow(
    window: BrowserWindow,
    configureUrl?: (url: URL) => void
  ): Promise<void> {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const resolvedUrl = await resolveDevRendererUrl(process.env['ELECTRON_RENDERER_URL'])
      const url = new URL(resolvedUrl)
      configureUrl?.(url)
      await loadUrlWithRetry(window, url.toString())
      return
    }

    await window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  async function loadUrlWithRetry(window: BrowserWindow, url: string): Promise<void> {
    let lastError: unknown
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await window.loadURL(url)
        return
      } catch (error) {
        lastError = error
        await delay(250)
      }
    }
    console.error(`Failed to load renderer URL after retries: ${url}`, lastError)
  }

  function createWindow(): void {
    const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
    const iconPath = join(__dirname, '../../resources', iconFile)
    const appIcon = nativeImage.createFromPath(iconPath)

    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1000,
      minHeight: 600,
      title: 'JanusX',
      icon: appIcon,
      frame: false,
      backgroundColor: '#121212',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
        webSecurity: true,
        webviewTag: false,
      },
    })
    installProductionCsp(mainWindow.webContents.session)

    // Toast/editor keep-alive windows mean window-all-closed may never fire.
    // Non-darwin: main window close must enter the unified quit path.
    mainWindow.on('closed', () => {
      officeArtifactIndex.disposeAll()
      mainWindow = null
      if (process.platform === 'darwin') return
      if (appShutdown.isQuitting) return
      app.quit()
    })

    // 注册 IPC handlers
    registerWorkspaceHandlers(mainWindow, {
      beforeWorkspaceDelete: async (workspaceId) => {
        await officeWatchPool.stopUnderRoot(workspaceId)
        officeArtifactIndex.dispose(workspaceId)
      },
    })
    registerTerminalHandlers(mainWindow)
    registerGitHandlers()
    registerAgentHandlers(mainWindow)
    registerCheckpointHandlers()
    registerFileHandlers()
    registerProjectHandlers()
    registerLlmHandlers()
    registerJanusHandlers(mainWindow)
    registerRuntimeTelemetryHandlers()
    registerSettingsHandlers()
    registerSubAgentRunHandlers(mainWindow)
    registerKnowledgeHandlers()
    registerOfficeHandlers({
      getAllowedWindows: getOfficeWindows,
      resolveWorkspaceRoot: resolveOfficeWorkspaceRoot,
      operations: createProductionOfficeOperations({
        artifactIndex: officeArtifactIndex,
        watchPool: officeWatchPool,
      }),
      installer: officecliInstaller,
    })

    // 窗口控制 IPC
    ipcMain.handle('window:minimize', () => {
      BrowserWindow.getFocusedWindow()?.minimize()
    })
    ipcMain.handle('window:maximize', () => {
      const win = BrowserWindow.getFocusedWindow()
      if (win) {
        win.isMaximized() ? win.unmaximize() : win.maximize()
      }
    })
    ipcMain.handle('window:close', () => {
      BrowserWindow.getFocusedWindow()?.close()
    })

    ipcMain.handle('editor-window:open', (_event, payload: { filePath?: string; workspacePath?: string }) => {
      if (!payload.filePath || !payload.workspacePath) {
        return { success: false, error: 'Missing editor window payload' }
      }

      const existing = editorWindows.get(payload.filePath)
      if (existing && !existing.isDestroyed()) {
        existing.focus()
        return { success: true }
      }

      const editorWindow = new BrowserWindow({
        width: 1100,
        height: 760,
        minWidth: 820,
        minHeight: 520,
        title: 'JanusX Editor',
        backgroundColor: '#0a0a0a',
        frame: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: join(__dirname, '../preload/index.mjs'),
          sandbox: false,
          webSecurity: true,
          webviewTag: false,
        },
      })

      editorWindow.on('closed', () => {
        editorWindows.delete(payload.filePath!)
      })

      editorWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
      })

      editorWindows.set(payload.filePath, editorWindow)

      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        void loadRendererWindow(editorWindow, (url) => {
          url.searchParams.set('editorWindow', '1')
          url.searchParams.set('editorFile', payload.filePath!)
          url.searchParams.set('workspacePath', payload.workspacePath!)
        })
      } else {
        editorWindow.loadFile(join(__dirname, '../renderer/index.html'), {
          query: {
            editorWindow: '1',
            editorFile: payload.filePath,
            workspacePath: payload.workspacePath,
          },
        })
      }

      return { success: true }
    })

    void loadRendererWindow(mainWindow)
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
