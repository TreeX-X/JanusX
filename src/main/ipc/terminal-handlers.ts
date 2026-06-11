import { ipcMain, BrowserWindow } from 'electron'
import { terminalManager } from '../terminal/manager'
import { checkpointManager } from '../agent/checkpoint/checkpoint-manager'

// Track checkpoint state per terminal
interface TerminalCpState {
  checkpointId: string | null  // current pending checkpoint
  cwd: string
  engine: 'claude' | 'codex' | 'opencode'
  lastInputAt: number          // timestamp of last user input
  checkpointCreatedAt: number  // timestamp of last checkpoint creation
  initialized: boolean         // whether checkpointManager.initialize() succeeded
}

const terminalStates = new Map<string, TerminalCpState>()

// Cooldown between checkpoint creations (ms) — avoid creating one per keystroke
const CHECKPOINT_COOLDOWN_MS = 10_000  // 10 seconds

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
        lastInputAt: 0,
        checkpointCreatedAt: 0,
        initialized: false,
      })

      // Initialize checkpoint manager for this workspace — MUST await
      try {
        await checkpointManager.initialize(cwd)
        const state = terminalStates.get(id)
        if (state) state.initialized = true
        mainWindow.webContents.send('checkpoint:ready', { terminalId: id, success: true })
      } catch (err) {
        console.error('Checkpoint init failed:', err)
        mainWindow.webContents.send('checkpoint:ready', { terminalId: id, success: false, error: String(err) })
      }
    }

    // PTY output — just forward to renderer (no JSON parsing for interactive TUI)
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
      terminalStates.delete(id)
    })

    return { pid: instance.pty.pid }
  })

  // Input handler — detect user activity for checkpoint creation
  ipcMain.on('terminal:input', (_event, { id, data }: { id: string; data: string }) => {
    terminalManager.write(id, data)

    const state = terminalStates.get(id)
    if (!state || !state.initialized) return

    // 只有包含可打印字符的输入才触发还原点
    // 跳过：转义序列（鼠标/方向键/功能键）、纯控制字符（Ctrl+C/Enter/Backspace 等）
    if (data.startsWith('\x1b')) return
    if (!/[\x20-\x7e]/.test(data)) return

    // DEBUG: 记录触发还原点的输入
    const codes = Array.from(data).map(c => c.charCodeAt(0))
    console.log(`[CP-DEBUG] terminal:input id=${id.slice(0, 8)} data=${JSON.stringify(data)} codes=[${codes}]`)

    const now = Date.now()
    state.lastInputAt = now

    // Create checkpoint on user input if cooldown has elapsed
    const timeSinceLastCheckpoint = now - state.checkpointCreatedAt
    if (timeSinceLastCheckpoint > CHECKPOINT_COOLDOWN_MS) {
      // If there's an existing pending checkpoint from a previous conversation, finalize it first
      if (state.checkpointId) {
        const oldCpId = state.checkpointId
        state.checkpointId = null
        checkpointManager.finalizeCheckpoint(oldCpId, state.cwd).then(() => {
          mainWindow.webContents.send('checkpoint:event', {
            type: 'finalized',
            checkpointId: oldCpId,
          })
        }).catch(err => console.error('Checkpoint finalize failed:', err))
      }

      // Create new checkpoint (snapshot "before" state)
      console.log(`[CP-DEBUG] Creating checkpoint for terminal ${id.slice(0, 8)} engine=${state.engine}`)
      state.checkpointCreatedAt = now
      checkpointManager.createCheckpoint({
        terminalId: id,
        engine: state.engine,
        prompt: `对话 #${Math.floor(now / 1000)}`,
        cwd: state.cwd,
      }).then(cp => {
        state.checkpointId = cp.id
        mainWindow.webContents.send('checkpoint:event', {
          type: 'created',
          checkpointId: cp.id,
        })
      }).catch(err => console.error('Checkpoint create failed:', err))
    }
  })

  ipcMain.on('terminal:resize', (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    terminalManager.resize(id, cols, rows)
  })

  ipcMain.handle('terminal:kill', async (_event, { id }: { id: string }) => {
    terminalManager.kill(id)
    return { success: true }
  })
}
