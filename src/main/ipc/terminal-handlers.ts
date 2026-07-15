import { ipcMain, BrowserWindow } from 'electron'
import { terminalManager } from '../terminal/manager'
import { checkpointManager } from '../agent/checkpoint/checkpoint-manager'
import type { CheckpointEngine } from '../agent/checkpoint/types'
import { analyzer } from '../janus/analyzer'
import { isTerminalPreset, resolveTerminalLaunchCommand } from '../../shared/terminalLaunch'
import { subAgentRunRegistry } from '../agent/subagent-run-registry'
import type { SubAgentRunEngine } from '../../shared/subAgentRun'
import { AgentHookBridge } from '../notifications/agent-hook-bridge'
import { AgentHookConfigManager } from '../notifications/agent-hook-config'
import { AgentHookCoordinator } from '../notifications/agent-hook-coordinator'
import {
  AgentHookDiagnostics,
  summarizeCoordinatorEvent,
  summarizeHookPayload,
} from '../notifications/agent-hook-diagnostics'
import { logTerminalDiagnostic } from '../terminal/diagnostics'
import { agentTurnRecorder } from '../knowledge/agent-turn-recorder'
import { appShutdown } from '../shutdown/AppShutdown'
import { officecliManager } from '../office/officecli-manager'
import { resolve } from 'path'
import { buildOfficeAgentSession, mergeOfficeAgentEnv } from '../office/office-agent-policy'

// Track checkpoint state per terminal
interface TerminalCpState {
  checkpointId: string | null  // current pending checkpoint
  cwd: string
  workspaceId: string
  engine: CheckpointEngine
  initialized: boolean         // whether checkpointManager.initialize() succeeded
  creating: boolean
  pendingSubmitTexts: string[]
}

const terminalStates = new Map<string, TerminalCpState>()

/** Finalize current pending checkpoints for all terminals (best-effort, no wipe). */
export async function finalizePendingTerminalCheckpoints(): Promise<void> {
  const pending = Array.from(terminalStates.entries())
    .filter(([, state]) => Boolean(state.checkpointId))
    .map(([id, state]) => ({ id, checkpointId: state.checkpointId!, cwd: state.cwd }))

  await Promise.all(
    pending.map(async ({ id, checkpointId, cwd }) => {
      try {
        await checkpointManager.finalizeCheckpoint(checkpointId, cwd)
        const state = terminalStates.get(id)
        if (state?.checkpointId === checkpointId) {
          state.checkpointId = null
        }
      } catch (err) {
        console.error('Checkpoint finalize on shutdown failed:', err)
      }
    }),
  )
}

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
  const hookDiagnostics = new AgentHookDiagnostics()
  agentTurnRecorder.setEventSink((event) => {
    hookDiagnostics.record({
      stage: `knowledge-${event.type}`,
      source: event.engine,
      event: event.hookEvent,
      terminalId: event.terminalId,
      workspaceId: event.workspaceId,
      engine: event.engine,
      reason: event.reason,
      detail: event.observationId ?? event.workspacePath,
    })
  })
  const hookCoordinator = new AgentHookCoordinator(mainWindow, {
    onEvent: (event) => {
      hookDiagnostics.record(summarizeCoordinatorEvent(event))
      sendToRenderer(mainWindow, 'agent-hook:event', event)
    },
    onResolvedPayload: (payload) => {
      agentTurnRecorder.handleHookPayload(payload)
    },
  })
  const hookBridge = new AgentHookBridge({
    onPayload: (payload) => {
      hookDiagnostics.record(summarizeHookPayload(payload))
      hookCoordinator.handleHookPayload(payload)
    },
  })
  const hookConfigManager = new AgentHookConfigManager()

  // Register terminal/hook cleanup into the unified shutdown path.
  // Window close without full quit still needs local cleanup.
  appShutdown.configure({
    finalizePendingCheckpoints: () => finalizePendingTerminalCheckpoints(),
    stopHookBridge: () => hookBridge.stop(),
    disposeTerminalSession: () => {
      terminalStates.clear()
      hookCoordinator.dispose()
      agentTurnRecorder.dispose()
      agentTurnRecorder.setEventSink(undefined)
    },
  })

  mainWindow.on('closed', () => {
    if (appShutdown.isQuitting) return
    // Non-darwin: index mainWindow.closed triggers app.quit -> AppShutdown.
    // Keep terminal state until finalizePendingCheckpoints runs there.
    if (process.platform !== 'darwin') return

    // Darwin keeps the app process alive after the last window closes.
    void finalizePendingTerminalCheckpoints()
      .catch((err) => console.error('Checkpoint finalize on window close failed:', err))
      .finally(() => {
        terminalManager.killAll()
        terminalStates.clear()
        hookCoordinator.dispose()
        agentTurnRecorder.dispose()
        agentTurnRecorder.setEventSink(undefined)
        void hookBridge.stop()
      })
  })

  ipcMain.handle('terminal:create', async (_event, config) => {
    const { id, cwd, shell, autoCommand, preset } = config as {
      id: string
      workspaceId?: string
      cwd: string
      shell: string
      autoCommand?: string
      preset?: string
    }

    const resolvedAutoCommand = resolveTerminalLaunchCommand({ preset, autoCommand })
    const workspaceId = typeof config.workspaceId === 'string' ? config.workspaceId : ''
    const engine: CheckpointEngine =
      isTerminalPreset(preset) && preset !== 'shell' ? preset : 'shell'
    let hookEnv: Record<string, string> | undefined

    logTerminalDiagnostic('terminal create requested', {
      id,
      workspaceId,
      cwd,
      shell,
      preset,
      engine,
      hasAutoCommand: Boolean(resolvedAutoCommand),
    })

    if (engine !== 'shell') {
      try {
        await hookBridge.start()
        await hookConfigManager.ensureInstalled(engine)
        hookEnv = hookConfigManager.buildTerminalEnv(
          {
            terminalId: id,
            workspaceId,
            engine,
          },
          hookBridge.getEnv(),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('Agent hook setup failed:', err)
        const event = {
          type: 'ignored',
          terminalId: id,
          engine,
          source: engine,
          hookEvent: 'setup',
          reason: message,
          delivered: false,
        } as const
        hookDiagnostics.record(summarizeCoordinatorEvent(event))
        sendToRenderer(mainWindow, 'agent-hook:event', event)
      }
    }

    let instance
    try {
      const officecliPathDir = await officecliManager.refreshAgentPathDir()
      const officecli = await officecliManager.resolveBinary()
      const officeMcpEntry = resolve(__dirname, '..', 'office-mcp.js')
      const officeSession = buildOfficeAgentSession(engine, cwd, officecli?.path, officeMcpEntry)
      if (officeSession.limitation) {
        logTerminalDiagnostic('Office automation policy-only mode', { engine, limitation: officeSession.limitation })
      }
      hookEnv = mergeOfficeAgentEnv(hookEnv, officeSession)
      instance = terminalManager.create({
        id,
        workspaceId,
        cwd,
        shell,
        autoCommand: resolvedAutoCommand,
        env: hookEnv,
      }, officecliPathDir)
    } catch (err) {
      logTerminalDiagnostic('terminal create failed', {
        id,
        workspaceId,
        cwd,
        shell,
        preset,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
      throw err
    }

    if (engine !== 'shell') {
      hookCoordinator.registerTerminal({
        terminalId: id,
        engine,
        workspaceId,
        cwd,
      })
      agentTurnRecorder.registerTerminal({
        terminalId: id,
        engine,
        workspaceId,
        cwd,
      })

      subAgentRunRegistry.upsertRun({
        id: `terminal:${id}`,
        terminalId: id,
        rootRunId: `terminal:${id}`,
        rootTerminalId: id,
        missionId: id,
        workspaceId,
        workspacePath: cwd,
        source: 'terminal',
        engine: engine as SubAgentRunEngine,
        role: 'main',
        status: 'running',
        title: `${engine} terminal`,
        lastEvent: 'Terminal session started',
      })
    }

    terminalStates.set(id, {
      checkpointId: null,
      cwd,
      workspaceId,
      engine,
      initialized: false,
      creating: false,
      pendingSubmitTexts: [],
    })

    // PTY output: keep a bounded replay buffer so remounted terminals can recover
    // after workspace switches, then forward live data to the renderer.
    instance.pty.onData((data: string) => {
      const seq = terminalManager.appendOutput(id, data)
      sendToRenderer(mainWindow, 'terminal:data', { id, data, seq: seq ?? undefined })
    })

    // Terminal exit: finalize any pending checkpoint.
    instance.pty.onExit(({ exitCode }: { exitCode: number }) => {
      sendToRenderer(mainWindow, 'terminal:exit', { id, exitCode })
      terminalManager.kill(id)

      const state = terminalStates.get(id)
      if (state?.engine && state.engine !== 'shell') {
        subAgentRunRegistry.finishRun(
          `terminal:${id}`,
          exitCode === 0 ? 'done' : 'failed',
          exitCode === 0 ? 'Terminal completed' : `Terminal exited with code ${exitCode}`
        )
      }
      if (state?.checkpointId) {
        const cpId = state.checkpointId
        checkpointManager.finalizeCheckpoint(cpId, state.cwd).then(() => {
          sendToRenderer(mainWindow, 'checkpoint:event', {
            type: 'finalized',
            checkpointId: cpId,
          })
        }).catch(err => console.error('Checkpoint finalize failed:', err))
      }
      // Janus Analyzer runs only for AI CLI terminals.
      if (state && state.engine !== 'shell') {
        analyzer.analyzeTerminal(state.cwd, id).catch(err => console.error('[janus] terminal-close analyze failed:', err))
      }
      terminalStates.delete(id)
      hookCoordinator.unregisterTerminal(id)
      agentTurnRecorder.unregisterTerminal(id)
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

  // Input handler: forward to PTY only.
  ipcMain.on('terminal:input', (_event, { id, data }: { id: string; data: string }) => {
    terminalManager.write(id, data)
  })

  // Submit-line handler: renderer sends one complete user input transaction.
  ipcMain.on('terminal:submit-line', (_event, { id, text }: { id: string; text: string }) => {
    enqueueCheckpointFromSubmit(mainWindow, id, text)
  })

  ipcMain.on('terminal:resize', (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    terminalManager.resize(id, cols, rows)
  })

  ipcMain.handle('terminal:replay', async (_event, { id }: { id: string }) => {
    return terminalManager.getOutputReplay(id) ?? { data: '', seq: 0 }
  })

  ipcMain.handle('terminal:kill', async (_event, { id }: { id: string }) => {
    terminalManager.kill(id)
    return { success: true }
  })
}
