import type { Terminal, TerminalPreset } from '@/types'
import { useAppStore } from '@/stores/app'
import { useWorkspaceStore } from '@/stores/workspace'
import {
  requestTerminalForceFit,
  waitForTerminalGeometry,
} from '@/lib/terminal-geometry'
import {
  getTerminalPresetMeta,
  resolveTerminalLaunchCommand,
  resolveTerminalLaunchProgram,
} from '../../../shared/terminalLaunch'

let cachedDefaultShell: string | null = null
let shellFetchPromise: Promise<string> | null = null

function fallbackShell(): string {
  return window.electron?.platform === 'win32' ? 'powershell.exe' : 'bash'
}

export function getCachedDefaultShell(): string | null {
  return cachedDefaultShell
}

/** Test helper — not used by production call sites. */
export function __resetDefaultShellCacheForTests(): void {
  cachedDefaultShell = null
  shellFetchPromise = null
}

export function ensureDefaultShell(): Promise<string> {
  if (cachedDefaultShell) return Promise.resolve(cachedDefaultShell)
  if (shellFetchPromise) return shellFetchPromise

  shellFetchPromise = window.electron.system
    .getDefaultShell()
    .then((shell) => {
      cachedDefaultShell = typeof shell === 'string' && shell.length > 0 ? shell : fallbackShell()
      return cachedDefaultShell
    })
    .catch(() => {
      cachedDefaultShell = fallbackShell()
      return cachedDefaultShell
    })
    .finally(() => {
      shellFetchPromise = null
    })

  return shellFetchPromise
}

/** Fire-and-forget warm of the default-shell cache. */
export function warmDefaultShellCache(): void {
  void ensureDefaultShell()
}

/**
 * Waits for the main-process `terminal:created` event for one terminal.
 * Resolves false on timeout or when the event API is unavailable (e.g. tests).
 */
function waitForTerminalCreated(terminalId: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const onCreated = window.electron?.terminal?.onCreated
    if (!onCreated) {
      resolve(false)
      return
    }
    const timer = setTimeout(() => {
      off()
      resolve(false)
    }, timeoutMs)
    const off = onCreated((event) => {
      if (event?.id === terminalId) {
        clearTimeout(timer)
        off()
        resolve(true)
      }
    })
  })
}

/**
 * Fire-and-forget main-process prewarm for terminal creation:
 * CLI path cache, optional engine hook install, officecli binary cache.
 */
export function warmTerminalCreatePath(
  engines?: Array<Exclude<TerminalPreset, 'shell'> | 'shell'>,
): void {
  if (!window.electron?.terminal) return
  const list = engines
    ?.filter((engine): engine is Exclude<TerminalPreset, 'shell'> => engine !== 'shell')
  void window.electron.terminal.warmup({ engines: list ?? [] }).catch(() => undefined)
}

export function waitForTerminalMount(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

export function terminalBootLabel(preset: TerminalPreset): string {
  switch (preset) {
    case 'claude':
      return 'Starting Claude Code…'
    case 'codex':
      return 'Starting Codex…'
    case 'opencode':
      return 'Starting OpenCode…'
    case 'janus':
      return 'Starting Janus…'
    case 'pi':
      return 'Starting Pi…'
    case 'shell':
      return 'Starting shell…'
  }
}

export interface LaunchTerminalPresetOptions {
  preset: TerminalPreset
  workspaceId: string
  workspacePath: string
  /** Working directory; defaults to the workspace root (active worktree when set by callers). */
  cwd?: string
  /** Defaults to preset meta name. */
  name?: string
  /** Defaults true — enter terminal UI immediately after addTerminal. */
  enterTerminalUi?: boolean
  /**
   * Prefill text written to the PTY after spawn WITHOUT submitting (no trailing
   * newline is appended): the user reviews and sends it manually. Blueprint
   * "implement in terminal" passes the Goal/AC prompt here.
   */
  initialInput?: string
}

export type LaunchTerminalResult =
  | { ok: true; terminalId: string; pid: number; prefilled: boolean }
  | { ok: false; terminalId: string; error: string }

/**
 * Optimistic terminal launch:
 * 1. Enter terminal UI with status `starting` immediately
 * 2. Micro-await mount so CLITerminal can register listeners
 * 3. Create PTY; on failure keep terminal with recoverable error state
 */
export async function launchTerminalPreset(
  options: LaunchTerminalPresetOptions
): Promise<LaunchTerminalResult | null> {
  const {
    preset,
    workspaceId,
    workspacePath,
    cwd: cwdOverride,
    name,
    enterTerminalUi = true,
    initialInput,
  } = options

  if (!workspaceId || !workspacePath) return null

  const cwd = cwdOverride ?? workspacePath

  // Enter UI immediately with a warm cache or instant platform fallback.
  // Resolve the real default shell in parallel so create still gets the correct value.
  const shellPromise = ensureDefaultShell()
  const shell = cachedDefaultShell ?? fallbackShell()

  const terminalId = crypto.randomUUID()
  // Subscribe before spawn: the created event may arrive before create resolves.
  const createdPromise = initialInput ? waitForTerminalCreated(terminalId) : null
  const presetMeta = getTerminalPresetMeta(preset)
  const autoCommand = resolveTerminalLaunchCommand(preset)
  const telemetryStartedAt = Date.now()

  const terminal: Terminal = {
    id: terminalId,
    workspaceId,
    name: name ?? presetMeta.name,
    preset,
    cwd,
    shell,
    autoCommand,
    pid: null,
    status: 'wait',
    updatedAt: telemetryStartedAt,
    telemetryStartedAt,
  }

  useWorkspaceStore.getState().addTerminal(terminal)

  if (enterTerminalUi) {
    useAppStore.getState().setBlueprintMode(false)
    useAppStore.getState().setLoadState('terminal-active')
  }

  // Parallel: mount listeners + resolve shell (no UI gate on either alone).
  const [, resolvedShell] = await Promise.all([waitForTerminalMount(), shellPromise])
  if (resolvedShell !== shell) {
    useWorkspaceStore.getState().updateTerminal(terminalId, { shell: resolvedShell })
  }

  // Measure pane via FitAddon before spawning so TUI first-paint matches the host.
  const geometry = await waitForTerminalGeometry(terminalId)

  try {
    const launchProgram = resolveTerminalLaunchProgram(preset)
    const result = await window.electron.terminal.create({
      id: terminalId,
      workspaceId,
      cwd,
      shell: resolvedShell,
      autoCommand,
      preset,
      command: launchProgram?.command,
      args: launchProgram?.args,
      ...(geometry ? { cols: geometry.cols, rows: geometry.rows } : {}),
    })

    useWorkspaceStore.getState().updateTerminal(terminalId, {
      pid: result.pid,
      status: 'wait',
      updatedAt: Date.now(),
    })

    // Correct any residual mismatch after PTY spawn (TUI reflow via resize).
    requestTerminalForceFit(terminalId)

    let prefilled = false
    if (initialInput && createdPromise && (await createdPromise)) {
      window.electron.terminal.input(terminalId, initialInput)
      prefilled = true
    }
    return { ok: true, terminalId, pid: result.pid, prefilled }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Failed to create terminal:', err)
    useWorkspaceStore.getState().updateTerminal(terminalId, {
      status: 'error',
      errorMessage: message,
      updatedAt: Date.now(),
    })
    return { ok: false, terminalId, error: message }
  }
}

/** Retry creation for a failed/starting terminal without leaving the pane. */
// AC7: per-id debounce set. Prevents concurrent retryTerminalCreate calls for
// the same terminalId from racing terminal:create with an identical id.
const retryingTerminalIds = new Set<string>()

export async function retryTerminalCreate(terminalId: string): Promise<boolean> {
  if (retryingTerminalIds.has(terminalId)) return false
  retryingTerminalIds.add(terminalId)
  try {
    return await runRetryTerminalCreate(terminalId)
  } finally {
    retryingTerminalIds.delete(terminalId)
  }
}

async function runRetryTerminalCreate(terminalId: string): Promise<boolean> {
  const terminal = useWorkspaceStore.getState().terminals.find((item) => item.id === terminalId)
  if (!terminal) return false

  useWorkspaceStore.getState().updateTerminal(terminalId, {
    status: 'wait',
    errorMessage: undefined,
    updatedAt: Date.now(),
  })

  const [shell, geometry] = await Promise.all([
    ensureDefaultShell(),
    waitForTerminalGeometry(terminalId),
  ])

  try {
    const launchProgram = resolveTerminalLaunchProgram(terminal.preset)
    const result = await window.electron.terminal.create({
      id: terminalId,
      workspaceId: terminal.workspaceId,
      cwd: terminal.cwd,
      shell,
      autoCommand: terminal.autoCommand,
      preset: terminal.preset,
      command: launchProgram?.command,
      args: launchProgram?.args,
      ...(geometry ? { cols: geometry.cols, rows: geometry.rows } : {}),
    })

    useWorkspaceStore.getState().updateTerminal(terminalId, {
      pid: result.pid,
      status: 'wait',
      shell,
      errorMessage: undefined,
      updatedAt: Date.now(),
    })
    requestTerminalForceFit(terminalId)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('Failed to retry terminal create:', err)
    useWorkspaceStore.getState().updateTerminal(terminalId, {
      status: 'error',
      errorMessage: message,
      updatedAt: Date.now(),
    })
    return false
  }
}
