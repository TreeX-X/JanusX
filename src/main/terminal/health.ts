import type { terminalManager as TerminalManagerType } from './manager'

interface HealthStatus {
  alive: boolean
  uptime: number
  lastCheck: number
}

type Manager = typeof TerminalManagerType

export class HealthChecker {
  private interval: ReturnType<typeof setInterval> | null = null
  private manager: Manager | null = null
  private onCrash: ((id: string) => void) | null = null

  start(manager: Manager, onCrash?: (id: string) => void): void {
    this.manager = manager
    this.onCrash = onCrash ?? null
    this.interval = setInterval(() => this.checkAll(), 5000)
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.manager = null
    this.onCrash = null
  }

  check(id: string): HealthStatus {
    const instance = this.manager?.getInstance(id)
    if (!instance) {
      return { alive: false, uptime: 0, lastCheck: Date.now() }
    }
    return {
      alive: instance.status === 'running',
      uptime: Date.now() - instance.createdAt,
      lastCheck: Date.now(),
    }
  }

  private checkAll(): void {
    if (!this.manager) return
    const instances = this.manager.listInstances()
    for (const instance of instances) {
      if (instance.status === 'exited') {
        this.onCrash?.(instance.id)
        this.manager.kill(instance.id)
      }
    }
  }
}

export const healthChecker = new HealthChecker()
