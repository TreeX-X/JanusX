import { ipcMain, BrowserWindow } from 'electron'
import { terminalManager } from '../terminal/manager'
import { checkpointManager } from '../agent/checkpoint/checkpoint-manager'
import type { CheckpointEngine } from '../agent/checkpoint/types'
import { analyzer } from '../janus/analyzer'
import { isTerminalPreset, resolveTerminalLaunchProgram } from '../../shared/terminalLaunch'
import { resolveCLIPath } from '../agent/cli-resolver'
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
import { existsSync } from 'fs'
import { extname, resolve } from 'path'
import { buildOfficeAgentSession, mergeOfficeAgentEnv } from '../office/office-agent-policy'
import {
  TERMINAL_EVENT_CHANNELS,
  TERMINAL_INVOKE_CHANNELS,
  TERMINAL_SEND_CHANNELS,
  type TerminalCreateRequest,
  type TerminalInputPayload,
  type TerminalResizePayload,
  type TerminalSubmitLinePayload,
  type TerminalWarmupRequest,
} from '../../shared/ipc/terminal'
import { AGENT_CHANNELS } from '../../shared/ipc/agent'
import { CHECKPOINT_CHANNELS } from '../../shared/ipc/checkpoint'
import { companionSessionState } from '../companion/session-state'
import { rollbackTerminalCreation } from '../companion/terminal-creation-rollback'

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
let companionTerminalCreator: ((config: TerminalCreateRequest) => Promise<{ pid: number }>) | null = null

export function createCompanionTerminal(config: TerminalCreateRequest): Promise<{ pid: number }> {
  if (!companionTerminalCreator) throw new Error('Terminal lifecycle is not available')
  return companionTerminalCreator(config)
}

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
    sendToRenderer(mainWindow, CHECKPOINT_CHANNELS.event, {
      type: 'error',
      terminalId: id,
      error: 'Terminal checkpoint state not found',
    })
    return
  }

  state.pendingSubmitTexts.push(prompt)
  processCheckpointQueue(mainWindow, id)
}

/** Remote control uses the same checkpoint transaction as renderer submit-line. */
export function submitCompanionTerminalLine(mainWindow: BrowserWindow, id: string, text: string): void {
  terminalManager.write(id, `${text}\r`)
  enqueueCheckpointFromSubmit(mainWindow, id, text)
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
      sendToRenderer(mainWindow, CHECKPOINT_CHANNELS.event, {
        type: 'finalized',
        terminalId: id,
        checkpointId: previousCpId,
      })
    }
    state.checkpointId = checkpoint.id
    sendToRenderer(mainWindow, CHECKPOINT_CHANNELS.event, {
      type: 'created',
      terminalId: id,
      checkpointId: checkpoint.id,
    })
  }).catch((err) => {
    state.checkpointId = previousCpId
    const message = err instanceof Error ? err.message : String(err)
    console.error('Checkpoint lifecycle failed:', err)
    sendToRenderer(mainWindow, CHECKPOINT_CHANNELS.event, {
      type: 'error',
      terminalId: id,
      error: message,
    })
  }).finally(() => {
    state.creating = false
    processCheckpointQueue(mainWindow, id)
  })
}

const AGENT_CLI_COMMANDS = ['claude', 'codex', 'opencode'] as const
type WarmupEngine = (typeof AGENT_CLI_COMMANDS)[number]

function isWarmupEngine(value: string): value is WarmupEngine {
  return (AGENT_CLI_COMMANDS as readonly string[]).includes(value)
}

async function resolveOfficecliLaunchAssets(): Promise<{
  pathDir: string | undefined
  binaryPath: string | undefined
}> {
  // Prefer session cache (resolveBinary only detect()s when verifiedBinary is empty).
  // Do not call refreshAgentPathDir() on every create — full capability probes are expensive.
  const binary = await officecliManager.resolveBinary()
  return {
    pathDir: officecliManager.resolveAgentPathDir(),
    binaryPath: binary?.path,
  }
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
      sendToRenderer(mainWindow, AGENT_CHANNELS.hookEvent, event)
    },
    onResolvedPayload: (payload) => {
      companionSessionState.handleHookPayload(payload)
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
  /** Per-session gate so second+ Claude/Codex/OpenCode creates skip hook file IO. */
  const hooksInstalledThisSession = new Set<Exclude<CheckpointEngine, 'shell' | 'manual'>>()

  async function ensureHooksInstalled(engine: Exclude<CheckpointEngine, 'shell' | 'manual'>): Promise<void> {
    if (hooksInstalledThisSession.has(engine)) return
    await hookConfigManager.ensureInstalled(engine)
    hooksInstalledThisSession.add(engine)
  }

  // Fire-and-forget: first create should not wait on listen() or cold where.exe.
  void hookBridge.start().catch((err) => {
    console.error('Agent hook bridge prestart failed:', err)
  })
  for (const command of AGENT_CLI_COMMANDS) {
    void resolveCLIPath(command).catch(() => undefined)
  }
  void officecliManager.resolveBinary().catch(() => undefined)

  // Register terminal/hook cleanup into the unified shutdown path.
  // Window close without full quit still needs local cleanup.
  appShutdown.configure({
    finalizePendingCheckpoints: () => finalizePendingTerminalCheckpoints(),
    stopHookBridge: () => hookBridge.stop(),
    disposeTerminalSession: () => {
      terminalStates.clear()
      hooksInstalledThisSession.clear()
      hookCoordinator.dispose()
      companionSessionState.clear()
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
        hooksInstalledThisSession.clear()
        hookCoordinator.dispose()
        companionSessionState.clear()
        agentTurnRecorder.dispose()
        agentTurnRecorder.setEventSink(undefined)
        void hookBridge.stop()
      })
  })

  ipcMain.handle(TERMINAL_INVOKE_CHANNELS.warmup, async (_event, payload?: TerminalWarmupRequest) => {
    const requested = Array.isArray(payload?.engines)
      ? payload.engines.filter((engine): engine is WarmupEngine => typeof engine === 'string' && isWarmupEngine(engine))
      : [...AGENT_CLI_COMMANDS]

    await Promise.all([
      hookBridge.start().catch(() => undefined),
      officecliManager.resolveBinary().catch(() => undefined),
      ...requested.map((engine) => resolveCLIPath(engine).catch(() => null)),
      ...requested.map(async (engine) => {
        try {
          await ensureHooksInstalled(engine)
        } catch {
          // Warmup is best-effort; create path still retries setup.
        }
      }),
    ])

    return { ok: true as const }
  })

  const createTerminalLifecycle = async (config: TerminalCreateRequest) => {
    const { id, cwd, shell, preset, command, args, cols, rows } = config

    const workspaceId = typeof config.workspaceId === 'string' ? config.workspaceId : ''
    const engine: CheckpointEngine =
      isTerminalPreset(preset) && preset !== 'shell' ? preset : 'shell'
    const launchProgram = resolveTerminalLaunchProgram(
      isTerminalPreset(preset) ? preset : { command, args },
    )

    const resolveProgramPromise = (async () => {
      if (!launchProgram) return undefined
      try {
        const resolved = await resolveCLIPath(launchProgram.command)
        // Never pass a non-existent or extensionless Windows path to node-pty.
        // Fall back to the bare command so CreateProcess can still search PATHEXT.
        if (
          resolved &&
          (process.platform !== 'win32' ||
            (existsSync(resolved) && Boolean(extname(resolved))))
        ) {
          return { command: resolved, args: launchProgram.args }
        }
      } catch {
        // Fall back to bare command; PATH-based spawn may still succeed.
      }
      return launchProgram
    })()

    const hookEnvPromise = (async (): Promise<Record<string, string> | undefined> => {
      if (engine === 'shell') return undefined
      try {
        await hookBridge.start()
        await ensureHooksInstalled(engine)
        return hookConfigManager.buildTerminalEnv(
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
        sendToRenderer(mainWindow, AGENT_CHANNELS.hookEvent, event)
        return undefined
      }
    })()

    const officePromise = resolveOfficecliLaunchAssets()

    const [resolvedProgram, hookEnvBase, office] = await Promise.all([
      resolveProgramPromise,
      hookEnvPromise,
      officePromise,
    ])

    logTerminalDiagnostic('terminal create requested', {
      id,
      workspaceId,
      cwd,
      shell,
      preset,
      engine,
      program: resolvedProgram?.command,
      programArgs: resolvedProgram?.args,
    })

    let instance
    try {
      const officeMcpEntry = resolve(__dirname, '..', 'office-mcp.js')
      const officeSession = buildOfficeAgentSession(engine, cwd, office.binaryPath, officeMcpEntry)
      if (officeSession.limitation) {
        logTerminalDiagnostic('Office automation policy-only mode', { engine, limitation: officeSession.limitation })
      }
      const hookEnv = mergeOfficeAgentEnv(hookEnvBase, officeSession)
      instance = terminalManager.create({
        id,
        workspaceId,
        cwd,
        shell,
        program: resolvedProgram?.command,
        programArgs: resolvedProgram?.args,
        cols: typeof cols === 'number' ? cols : undefined,
        rows: typeof rows === 'number' ? rows : undefined,
        env: hookEnv,
      }, office.pathDir)
      // Only soft-revalidate when create had no officecli cache; avoid clearing a warm cache mid-flight.
      if (!office.pathDir && !office.binaryPath) {
        void officecliManager.refreshAgentPathDir().catch(() => undefined)
      }
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

    try {
    if (engine !== 'shell') {
      hookCoordinator.registerTerminal({
        terminalId: id,
        engine,
        workspaceId,
        cwd,
      })
      companionSessionState.registerTerminal({
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
      sendToRenderer(mainWindow, TERMINAL_EVENT_CHANNELS.data, { id, data, seq: seq ?? undefined })
    })

    // Terminal exit: finalize any pending checkpoint.
    instance.pty.onExit(({ exitCode }: { exitCode: number }) => {
      sendToRenderer(mainWindow, TERMINAL_EVENT_CHANNELS.exit, { id, exitCode })
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
          sendToRenderer(mainWindow, CHECKPOINT_CHANNELS.event, {
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
      companionSessionState.unregisterTerminal(id)
      hookCoordinator.unregisterTerminal(id)
      agentTurnRecorder.unregisterTerminal(id)
    })

    checkpointManager.initialize(cwd).then(() => {
      const state = terminalStates.get(id)
      if (state) {
        state.initialized = true
        processCheckpointQueue(mainWindow, id)
      }
      sendToRenderer(mainWindow, CHECKPOINT_CHANNELS.ready, { terminalId: id, success: true })
    }).catch((err) => {
      console.error('Checkpoint init failed:', err)
      sendToRenderer(mainWindow, CHECKPOINT_CHANNELS.ready, { terminalId: id, success: false, error: String(err) })
    })

    sendToRenderer(mainWindow, TERMINAL_EVENT_CHANNELS.created, {
      id, workspaceId, cwd, preset: engine, shell, pid: instance.pty.pid,
    })
    return { pid: instance.pty.pid }
    } catch (error) {
      rollbackTerminalCreation({
        clearState: () => { terminalStates.delete(id) },
        unregisterCompanion: () => companionSessionState.unregisterTerminal(id),
        unregisterHook: () => hookCoordinator.unregisterTerminal(id),
        unregisterRecorder: () => agentTurnRecorder.unregisterTerminal(id),
        removeRun: () => subAgentRunRegistry.removeRun(`terminal:${id}`),
        killPty: () => terminalManager.kill(id),
      })
      throw error
    }
  }
  companionTerminalCreator = createTerminalLifecycle
  ipcMain.handle(TERMINAL_INVOKE_CHANNELS.create, async (_event, config: TerminalCreateRequest) => (
    createTerminalLifecycle(config)
  ))

  // Input handler: forward to PTY only.
  ipcMain.on(TERMINAL_SEND_CHANNELS.input, (_event, { id, data }: TerminalInputPayload) => {
    terminalManager.write(id, data)
  })

  // Submit-line handler: renderer sends one complete user input transaction.
  ipcMain.on(TERMINAL_SEND_CHANNELS.submitLine, (_event, { id, text }: TerminalSubmitLinePayload) => {
    enqueueCheckpointFromSubmit(mainWindow, id, text)
  })

  ipcMain.on(TERMINAL_SEND_CHANNELS.resize, (_event, { id, cols, rows }: TerminalResizePayload) => {
    terminalManager.resize(id, cols, rows)
  })

  ipcMain.handle(TERMINAL_INVOKE_CHANNELS.replay, async (_event, { id }: { id: string }) => {
    return terminalManager.getOutputReplay(id) ?? { data: '', seq: 0 }
  })

  ipcMain.handle(TERMINAL_INVOKE_CHANNELS.kill, async (_event, { id }: { id: string }) => {
    terminalManager.kill(id)
    return { success: true }
  })
}
