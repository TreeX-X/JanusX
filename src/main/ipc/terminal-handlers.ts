import { ipcMain, BrowserWindow } from 'electron'
import { terminalManager } from '../terminal/manager'
import { checkpointManager } from '../agent/checkpoint/checkpoint-manager'
import { analyzer } from '../janus/analyzer'

// Track checkpoint state per terminal
interface TerminalCpState {
  checkpointId: string | null  // current pending checkpoint
  cwd: string
  engine: 'claude' | 'codex' | 'opencode'
  checkpointCreatedAt: number  // timestamp of last checkpoint creation
  initialized: boolean         // whether checkpointManager.initialize() succeeded
}

const terminalStates = new Map<string, TerminalCpState>()

// Cooldown between checkpoint creations (ms)
const CHECKPOINT_COOLDOWN_MS = 5_000  // 5 seconds

export function registerTerminalHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('terminal:create', async (event, config) => {
    const { id, cwd, shell, autoCommand, preset } = config as {
      id: string
      cwd: string
      shell: string
      autoCommand?: string
      preset?: string
    }

    const instance = terminalManager.create({ id, workspaceId: '', cwd, shell, autoCommand })

    // Determine engine from preset
    const isCLI = preset && preset !== 'shell'
    const engine = isCLI ? (preset as 'claude' | 'codex' | 'opencode') : null

    if (engine) {
      terminalStates.set(id, {
        checkpointId: null,
        cwd,
        engine,
        checkpointCreatedAt: 0,
        initialized: false,
      })
    }

    // PTY output — just forward to renderer
    instance.pty.onData((data: string) => {
      mainWindow.webContents.send('terminal:data', { id, data })
    })

    // Terminal exit — finalize any pending checkpoint
    instance.pty.onExit(({ exitCode }: { exitCode: number }) => {
      mainWindow.webContents.send('terminal:exit', { id, exitCode })
      terminalManager.kill(id)

      const state = terminalStates.get(id)
      if (state?.checkpointId) {
        const cpId = state.checkpointId
        checkpointManager.finalizeCheckpoint(cpId, state.cwd).then(() => {
          mainWindow.webContents.send('checkpoint:event', {
            type: 'finalized',
            checkpointId: cpId,
          })
        }).catch(err => console.error('Checkpoint finalize failed:', err))
      }
      // Janus Analyzer 入口④：终端关闭最终分析（fire-and-forget，不阻塞）
      if (state) {
        analyzer.analyzeTerminal(state.cwd, id).catch(err => console.error('[janus] terminal-close analyze failed:', err))
      }
      terminalStates.delete(id)
    })

    if (engine) {
      checkpointManager.initialize(cwd).then(() => {
        const state = terminalStates.get(id)
        if (state) state.initialized = true
        mainWindow.webContents.send('checkpoint:ready', { terminalId: id, success: true })
      }).catch((err) => {
        console.error('Checkpoint init failed:', err)
        mainWindow.webContents.send('checkpoint:ready', { terminalId: id, success: false, error: String(err) })
      })
    }

    return { pid: instance.pty.pid }
  })

  // Input handler — just forward to PTY (no parsing)
  ipcMain.on('terminal:input', (_event, { id, data }: { id: string; data: string }) => {
    terminalManager.write(id, data)
  })

  // Submit-line handler — renderer sends clean user input on Enter
  ipcMain.on('terminal:submit-line', (_event, { id, text }: { id: string; text: string }) => {
    const state = terminalStates.get(id)
    if (!state || !state.initialized) return

    const now = Date.now()

    // Cooldown: don't create checkpoints too frequently
    if (now - state.checkpointCreatedAt < CHECKPOINT_COOLDOWN_MS) return

    state.checkpointCreatedAt = now

    // Atomically finalize previous checkpoint and create new one
    const previousCpId = state.checkpointId
    state.checkpointId = null

    checkpointManager.finalizeAndCreateCheckpoint(previousCpId, {
      terminalId: id,
      engine: state.engine,
      prompt: text,
      cwd: state.cwd,
    }).then(({ finalized, checkpoint }) => {
      if (finalized && previousCpId) {
        mainWindow.webContents.send('checkpoint:event', {
          type: 'finalized',
          checkpointId: previousCpId,
        })
      }
      state.checkpointId = checkpoint.id
      mainWindow.webContents.send('checkpoint:event', {
        type: 'created',
        checkpointId: checkpoint.id,
      })
    }).catch(err => console.error('Checkpoint lifecycle failed:', err))
  })

  ipcMain.on('terminal:resize', (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    terminalManager.resize(id, cols, rows)
  })

  ipcMain.handle('terminal:kill', async (_event, { id }: { id: string }) => {
    terminalManager.kill(id)
    return { success: true }
  })
}
