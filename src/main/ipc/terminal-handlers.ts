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
  // AC6: per-id creation lock. True while a terminal:create for this id is
  // in flight; concurrent create requests with the same id are rejected.
  creationLocked: boolean
  pendingSubmitTexts: string[]
  // Output-flow heuristic for AI CLI display status (engine !== 'shell').
  // flowStatus mirrors the last status pushed to the renderer so we only
  // emit events on transitions, not on every data chunk.
  flowStatus: 'wait' | 'running'
  flowTimer: ReturnType<typeof setTimeout> | null
  lastDataAt: number
}

const terminalStates = new Map<string, TerminalCpState>()

// Idle debounce for AI CLI output streams. When no pty data arrives for this
// window, the terminal is considered back at an input prompt (wait). Spinner
// / token output keeps the timer reset, holding the state at running.
const TERMINAL_FLOW_IDLE_MS = 1200
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
  try {
    mainWindow.webContents.send(channel, payload)
  } catch (err) {
    // AC2: webContents.send can throw synchronously when the window is torn down
    // between the liveness check and the send (TOCTOU). Swallow so a native
    // pty callback cannot crash the main process.
    console.error(`[terminal] sendToRenderer(${channel}) failed:`, err)
  }
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
    // AC8: synchronously kill all ptys first so no native pty callback can
    // reach a destroyed webContents during the finalize window. Final state
    // cleanup still runs in AppShutdown.
    if (process.platform !== 'darwin') {
      try {
        terminalManager.killAll()
      } catch (err) {
        console.error('[terminal] killAll on window close failed:', err)
      }
      return
    }

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

    // AC6: per-id creation lock. Concurrent terminal:create with the same id
    // (e.g. double-click preset, retry during launch) is rejected so the
    // second caller does not race checkpointManager.initialize on the same
    // cwd or collide with the first pty spawn (Vector B/F).
    const priorState = terminalStates.get(id)
    if (priorState?.creationLocked) {
      const existingInstance = terminalManager.getInstance(id)
      if (existingInstance) return { pid: existingInstance.pty.pid }
      throw new Error(`Terminal ${id} is already being created`)
    }

    // AC5: replacing an existing terminal with the same id. Tear down the
    // old pty and clear stale flow timer / run registry so the old onExit
    // callback cannot kill the new pty and the old flowTimer cannot push
    // status events into the new terminal (Vector A/D/E).
    if (priorState) {
      if (priorState.flowTimer) {
        clearTimeout(priorState.flowTimer)
        priorState.flowTimer = null
      }
      if (priorState.engine && priorState.engine !== 'shell') {
        try {
          subAgentRunRegistry.finishRun(
            `terminal:${id}`,
            'cancelled',
            'Replaced by new terminal with same id',
          )
        } catch (err) {
          console.error(`[terminal] finishRun on replace failed for ${id}:`, err)
        }
      }
    }
    try {
      terminalManager.kill(id)
    } catch (err) {
      console.error(`[terminal] kill-on-replace failed for ${id}:`, err)
    }

    // Pre-stub a locked state so concurrent callers see the lock immediately.
    // This is replaced by the full state below once the pty is spawned.
    terminalStates.set(id, {
      checkpointId: null,
      cwd,
      workspaceId,
      engine,
      initialized: false,
      creating: false,
      creationLocked: true,
      pendingSubmitTexts: [],
      flowStatus: 'wait',
      flowTimer: null,
      lastDataAt: 0,
    })

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

    // I-1 [P1] AC6: resolveOfficecliLaunchAssets() can reject when
    // officecliManager.resolveBinary() -> detect() -> run() fails (no
    // internal catch; see line 251's own .catch(() => undefined) proof).
    // Without this guard, Promise.all below rejects between the pre-stub
    // set (creationLocked: true) and the inner try that would release it,
    // leaking the lock and permanently deadlocking same-id creates.
    // Mirror the resolveProgramPromise/hookEnvPromise internal guard so
    // all three legs of Promise.all are non-rejecting.
    const officePromise = resolveOfficecliLaunchAssets().catch(() => ({
      pathDir: undefined as string | undefined,
      binaryPath: undefined as string | undefined,
    }))

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
      // Release the creation lock stub so a later retry is not blocked.
      terminalStates.delete(id)
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
      creationLocked: false,
      pendingSubmitTexts: [],
      flowStatus: 'wait',
      flowTimer: null,
      lastDataAt: 0,
    })

    // AC5/AC6: capture the pid of the pty we are about to register callbacks
    // on. If this terminal is later replaced by a new pty with the same id
    // (AC5 cleanup path), the old pty's native onData/onExit callbacks can
    // still fire asynchronously and would otherwise mutate the new terminal's
    // state (Vector A/E). The guard skips stale callbacks whose pty no longer
    // matches the current instance for this id.
    const registeredPid = instance.pty.pid

    // PTY output: keep a bounded replay buffer so remounted terminals can recover
    // after workspace switches, then forward live data to the renderer.
    instance.pty.onData((data: string) => {
      // AC3: isolate native pty callback exceptions so a single terminal's
      // failure cannot crash the main process or other terminals.
      try {
        // AC5: skip stale callbacks from a replaced pty.
        const current = terminalManager.getInstance(id)
        if (current && current.pty.pid !== registeredPid) return

        const seq = terminalManager.appendOutput(id, data)
        // kill 后窗口期实例已移除，appendOutput 返回 null：跳过转发，避免 seq undefined 的乱序数据。
        if (seq === null) return
        sendToRenderer(mainWindow, TERMINAL_EVENT_CHANNELS.data, { id, data, seq })

        // AI CLI output-flow heuristic: emit running on first chunk of a burst,
        // debounce back to wait after IDLE_MS of silence. Shell terminals opt out
        // entirely and never receive a status event from this path.
        if (engine !== 'shell') {
          const st = terminalStates.get(id)
          if (st) {
            const now = Date.now()
            if (st.flowStatus !== 'running') {
              st.flowStatus = 'running'
              sendToRenderer(mainWindow, TERMINAL_EVENT_CHANNELS.status, { id, status: 'running' })
            }
            st.lastDataAt = now
            if (st.flowTimer) clearTimeout(st.flowTimer)
            st.flowTimer = setTimeout(() => {
              try {
                const current = terminalStates.get(id)
                if (!current) return
                current.flowStatus = 'wait'
                current.flowTimer = null
                sendToRenderer(mainWindow, TERMINAL_EVENT_CHANNELS.status, { id, status: 'wait' })
              } catch (timerErr) {
                console.error(`[terminal ${id}] flow timer error:`, timerErr)
              }
            }, TERMINAL_FLOW_IDLE_MS)
          }
        }
      } catch (err) {
        console.error(`[terminal ${id}] onData error:`, err)
      }
    })

    // Terminal exit: finalize any pending checkpoint.
    instance.pty.onExit(({ exitCode }: { exitCode: number }) => {
      // AC3: isolate onExit callback exceptions; a throw here must not crash
      // the main process or leave the terminal in a half-cleaned state.
      try {
        // AC5: if this onExit is from a replaced pty (a new pty with the same
        // id now lives in the manager), skip all cleanup — the new terminal
        // owns the state now. A missing instance means the pty was killed
        // without replacement (user close / shutdown), so cleanup proceeds.
        const current = terminalManager.getInstance(id)
        if (current && current.pty.pid !== registeredPid) return

        // I-3 [P2] AC5: a replacement create is in flight (pre-stub locked).
        // The old pty's onExit was scheduled asynchronously by the AC5
        // kill-old step and can fire during the new create's `await
        // Promise.all` window, after the pre-stub state has been set but
        // before the new pty is spawned (getInstance is undefined in this
        // gap, so the registeredPid guard above does not return). Skip
        // cleanup so the new create's pre-stub state (incl. creationLocked)
        // is not deleted out from under it — otherwise AC6's lock is
        // dropped early and a concurrent same-id create can race
        // checkpointManager.initialize (Vector B/F). This also subsumes
        // the I-4 double-finishRun noise: the early return skips the
        // stale finishRun call entirely.
        const state0 = terminalStates.get(id)
        if (state0?.creationLocked) return

        sendToRenderer(mainWindow, TERMINAL_EVENT_CHANNELS.exit, { id, exitCode })
        terminalManager.kill(id)

        const state = terminalStates.get(id)
        if (state?.flowTimer) {
          clearTimeout(state.flowTimer)
          state.flowTimer = null
        }
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
      } catch (err) {
        console.error(`[terminal ${id}] onExit error:`, err)
        // Best-effort cleanup so a partial failure does not leak state.
        try { terminalStates.delete(id) } catch {}
        try { companionSessionState.unregisterTerminal(id) } catch {}
        try { hookCoordinator.unregisterTerminal(id) } catch {}
        try { agentTurnRecorder.unregisterTerminal(id) } catch {}
      }
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
    const st = terminalStates.get(id)
    if (st?.flowTimer) {
      clearTimeout(st.flowTimer)
      st.flowTimer = null
    }
    terminalManager.kill(id)
    return { success: true }
  })
}
