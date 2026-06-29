import { ipcMain, BrowserWindow } from 'electron'
import { terminalManager } from '../terminal/manager'
import { checkpointManager } from '../agent/checkpoint/checkpoint-manager'
import type { CheckpointEngine } from '../agent/checkpoint/types'
import { analyzer } from '../janus/analyzer'
import { isTerminalPreset, resolveTerminalLaunchCommand } from '../../shared/terminalLaunch'

// Track checkpoint state per terminal
interface TerminalCpState {
  checkpointId: string | null  // current pending checkpoint
  cwd: string
  engine: CheckpointEngine
  initialized: boolean         // whether checkpointManager.initialize() succeeded
  creating: boolean
  pendingSubmitTexts: string[]
}

const terminalStates = new Map<string, TerminalCpState>()

function sendToRenderer(mainWindow: BrowserWindow, channel: string, payload: unknown): void {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function normalizeSubmittedPrompt(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .trimEnd()
}

function enqueueCheckpointFromSubmit(mainWindow: BrowserWindow, id: string, text: string): void {
  const prompt = normalizeSubmittedPrompt(text)
  if (!prompt.trim()) return

  const state = terminalStates.get(id)
  if (!state) {
    sendToRenderer(mainWindow, 'checkpoint:event', {
      type: 'error',
      terminalId: id,
      error: 'Terminal checkpoint state not found',
    })
    return
  }

  state.pendingSubmitTexts.push(prompt)
  processCheckpointQueue(mainWindow, id)
}

function processCheckpointQueue(mainWindow: BrowserWindow, id: string): void {
  const state = terminalStates.get(id)
  if (!state || !state.initialized || state.creating) return

  const prompt = state.pendingSubmitTexts.shift()
  if (!prompt) return

  state.creating = true

  const previousCpId = state.checkpointId
  state.checkpointId = null

  checkpointManager.finalizeAndCreateCheckpoint(previousCpId, {
    terminalId: id,
    engine: state.engine,
    prompt,
    cwd: state.cwd,
  }).then(({ finalized, checkpoint }) => {
    if (finalized && previousCpId) {
      sendToRenderer(mainWindow, 'checkpoint:event', {
        type: 'finalized',
        terminalId: id,
        checkpointId: previousCpId,
      })
    }
    state.checkpointId = checkpoint.id
    sendToRenderer(mainWindow, 'checkpoint:event', {
      type: 'created',
      terminalId: id,
      checkpointId: checkpoint.id,
    })
  }).catch((err) => {
    state.checkpointId = previousCpId
    const message = err instanceof Error ? err.message : String(err)
    console.error('Checkpoint lifecycle failed:', err)
    sendToRenderer(mainWindow, 'checkpoint:event', {
      type: 'error',
      terminalId: id,
      error: message,
    })
  }).finally(() => {
    state.creating = false
    processCheckpointQueue(mainWindow, id)
  })
}

export function registerTerminalHandlers(mainWindow: BrowserWindow): void {
  mainWindow.on('closed', () => {
    terminalManager.killAll()
    terminalStates.clear()
  })

  ipcMain.handle('terminal:create', async (event, config) => {
    const { id, cwd, shell, autoCommand, preset } = config as {
      id: string
      cwd: string
      shell: string
      autoCommand?: string
      preset?: string
    }

    const resolvedAutoCommand = resolveTerminalLaunchCommand({ preset, autoCommand })
    const instance = terminalManager.create({ id, workspaceId: '', cwd, shell, autoCommand: resolvedAutoCommand })

    const engine: CheckpointEngine =
      isTerminalPreset(preset) && preset !== 'shell' ? preset : 'shell'

    terminalStates.set(id, {
      checkpointId: null,
      cwd,
      engine,
      initialized: false,
      creating: false,
      pendingSubmitTexts: [],
    })

    // PTY output — just forward to renderer
    instance.pty.onData((data: string) => {
      sendToRenderer(mainWindow, 'terminal:data', { id, data })
    })

    // Terminal exit — finalize any pending checkpoint
    instance.pty.onExit(({ exitCode }: { exitCode: number }) => {
      sendToRenderer(mainWindow, 'terminal:exit', { id, exitCode })
      terminalManager.kill(id)

      const state = terminalStates.get(id)
      if (state?.checkpointId) {
        const cpId = state.checkpointId
        checkpointManager.finalizeCheckpoint(cpId, state.cwd).then(() => {
          sendToRenderer(mainWindow, 'checkpoint:event', {
            type: 'finalized',
            checkpointId: cpId,
          })
        }).catch(err => console.error('Checkpoint finalize failed:', err))
      }
      // Janus Analyzer 入口④：仅 AI CLI 工作终端关闭触发，普通 shell 不参与蓝图分析。
      if (state && state.engine !== 'shell') {
        analyzer.analyzeTerminal(state.cwd, id).catch(err => console.error('[janus] terminal-close analyze failed:', err))
      }
      terminalStates.delete(id)
    })

    checkpointManager.initialize(cwd).then(() => {
      const state = terminalStates.get(id)
      if (state) {
        state.initialized = true
        processCheckpointQueue(mainWindow, id)
      }
      sendToRenderer(mainWindow, 'checkpoint:ready', { terminalId: id, success: true })
    }).catch((err) => {
      console.error('Checkpoint init failed:', err)
      sendToRenderer(mainWindow, 'checkpoint:ready', { terminalId: id, success: false, error: String(err) })
    })

    return { pid: instance.pty.pid }
  })

  // Input handler — just forward to PTY (no parsing)
  ipcMain.on('terminal:input', (_event, { id, data }: { id: string; data: string }) => {
    terminalManager.write(id, data)
  })

  // Submit-line handler — renderer sends one complete user input transaction.
  ipcMain.on('terminal:submit-line', (_event, { id, text }: { id: string; text: string }) => {
    enqueueCheckpointFromSubmit(mainWindow, id, text)
  })

  ipcMain.on('terminal:resize', (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    terminalManager.resize(id, cols, rows)
  })

  ipcMain.handle('terminal:kill', async (_event, { id }: { id: string }) => {
    terminalManager.kill(id)
    return { success: true }
  })
}
