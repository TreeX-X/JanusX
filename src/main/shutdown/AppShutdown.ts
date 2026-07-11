import { app } from 'electron'

export type ShutdownStep = () => void | Promise<void>

export interface AppShutdownDeps {
  abortChatStreams?: ShutdownStep
  cancelAnalyzer?: ShutdownStep
  finalizePendingCheckpoints?: ShutdownStep
  stopHookBridge?: ShutdownStep
  killTerminals?: ShutdownStep
  killAgents?: ShutdownStep
  stopProjects?: ShutdownStep
  disposeWatchers?: ShutdownStep
  destroyToast?: ShutdownStep
  closeEditors?: ShutdownStep
  disposeTerminalSession?: ShutdownStep
}

export interface BeginQuitOptions {
  reason?: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 2500
const STEP_TIMEOUT_MS = 800

/**
 * Single-flight app exit coordinator.
 * Never wipes checkpoint history (no clearAllLoaded).
 */
export class AppShutdown {
  private quitting = false
  private flight: Promise<void> | null = null
  private deps: AppShutdownDeps = {}

  get isQuitting(): boolean {
    return this.quitting
  }

  configure(partial: AppShutdownDeps): void {
    Object.assign(this.deps, partial)
  }

  beginQuit(options: BeginQuitOptions = {}): Promise<void> {
    if (this.flight) return this.flight
    this.quitting = true
    this.flight = this.execute(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.reason)
    return this.flight
  }

  private async execute(timeoutMs: number, reason?: string): Promise<void> {
    if (reason) {
      console.info(`[AppShutdown] beginQuit reason=${reason} timeoutMs=${timeoutMs}`)
    }

    let timedOut = false
    let forceTimer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<void>((resolve) => {
      forceTimer = setTimeout(() => {
        timedOut = true
        console.error('[AppShutdown] timeout reached, forcing exit')
        resolve()
      }, timeoutMs)
      forceTimer.unref?.()
    })

    try {
      await Promise.race([this.runSteps(), timeout])
    } catch (error) {
      console.error('[AppShutdown] unexpected failure:', error)
    } finally {
      if (forceTimer) clearTimeout(forceTimer)
      try {
        app.exit(timedOut ? 1 : 0)
      } catch (error) {
        console.error('[AppShutdown] app.exit failed:', error)
      }
    }
  }

  private async runSteps(): Promise<void> {
    // Order matters:
    // 1) kill keep-alive windows first (toast/editor)
    // 2) finalize pending checkpoints before killing terminals/session state
    const ordered: Array<[keyof AppShutdownDeps, ShutdownStep | undefined]> = [
      ['destroyToast', this.deps.destroyToast],
      ['closeEditors', this.deps.closeEditors],
      ['abortChatStreams', this.deps.abortChatStreams],
      ['cancelAnalyzer', this.deps.cancelAnalyzer],
      ['stopHookBridge', this.deps.stopHookBridge],
      ['finalizePendingCheckpoints', this.deps.finalizePendingCheckpoints],
      ['killTerminals', this.deps.killTerminals],
      ['killAgents', this.deps.killAgents],
      ['stopProjects', this.deps.stopProjects],
      ['disposeWatchers', this.deps.disposeWatchers],
      ['disposeTerminalSession', this.deps.disposeTerminalSession],
    ]

    for (const [name, step] of ordered) {
      await this.runStep(name, step)
    }
  }

  private async runStep(name: string, step?: ShutdownStep): Promise<void> {
    if (!step) return

    let stepTimer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.resolve().then(step),
        new Promise<void>((_, reject) => {
          stepTimer = setTimeout(() => reject(new Error(`step timeout: ${name}`)), STEP_TIMEOUT_MS)
          stepTimer.unref?.()
        }),
      ])
    } catch (error) {
      console.error(`[AppShutdown] step "${name}" failed:`, error)
    } finally {
      if (stepTimer) clearTimeout(stepTimer)
    }
  }
}

export const appShutdown = new AppShutdown()
