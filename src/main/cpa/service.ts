// Note: global CPA page configuration and isolated browser session — see .agents/notes/workbench/service-integrations.md
import { createHash } from 'node:crypto'
import { shell } from 'electron'
import type { BrowserSurfaceManager } from '../browser/surface-manager'
import { configService } from '../config/service'
import { SerialQueue } from '../lib/atomic-file'
import { CPA_SURFACE_ID, normalizeCpaSettings, type CpaSettings, type CpaStatus } from '../../shared/ipc/cpa'
import { CpaRuntime, type CpaRuntimeControl } from './runtime'

export class CpaService {
  private queue = new SerialQueue()
  private surfaceUrl: string | null = null
  private generation = 0
  private disposed = false

  private runtimeValue?: CpaRuntimeControl
  private get runtime(): CpaRuntimeControl { return this.runtimeValue ??= new CpaRuntime() }

  constructor(private surfaces: BrowserSurfaceManager, runtime?: CpaRuntimeControl) { this.runtimeValue = runtime }

  async getSettings(): Promise<CpaSettings> {
    const config = await configService.get()
    try {
      return normalizeCpaSettings(config.cpaSettings)
    } catch {
      // A manually edited/stale address must not prevent repairing it in settings.
      return normalizeCpaSettings(null)
    }
  }

  saveSettings(input: unknown): Promise<CpaSettings> {
    const generation = this.generation
    return this.queue.run(async () => {
      this.assertActive(generation)
      if (!input || typeof input !== 'object') throw new Error('cpa-invalid-settings')
      const settings = normalizeCpaSettings(input)
      const previous = await this.getSettings()
      const restart = previous.mode === 'managed' && (settings.mode !== 'managed' || !settings.enabled || previous.port !== settings.port)
      if (restart) await this.runtime.stop()
      await configService.update({ cpaSettings: settings })
      if (previous.managementUrl !== settings.managementUrl || previous.mode !== settings.mode || !settings.enabled && settings.mode === 'managed') this.closeSurface()
      this.assertActive(generation)
      if (settings.mode === 'managed' && settings.enabled) await this.runtime.start(settings)
      return settings
    })
  }

  open(): Promise<void> {
    const generation = this.generation
    return this.queue.run(async () => {
      const settings = await this.getSettings()
      this.assertActive(generation)
      if (settings.mode === 'managed') {
        if (!settings.enabled) throw new Error('cpa-not-enabled')
        await this.runtime.start(settings)
      }
      this.assertActive(generation)
      const { managementUrl } = settings
      if (this.surfaceUrl === managementUrl && this.surfaces.getState(CPA_SURFACE_ID)) return
      this.closeSurface()
      // Separate from the ordinary browser and from other CPA instances.
      const instance = createHash('sha256').update(new URL(managementUrl).origin).digest('hex').slice(0, 24)
      const result = this.surfaces.createSurface({ surfaceId: CPA_SURFACE_ID, carrier: 'pane', url: managementUrl }, {
        partition: `persist:janusx-cpa-${instance}`, httpOnly: true,
      })
      if (!result.success) throw new Error('cpa-open-failed')
      this.surfaceUrl = managementUrl
    })
  }

  close(): Promise<void> {
    return this.queue.run(async () => { this.closeSurface() })
  }

  async openExternal(): Promise<void> {
    await this.start()
    await shell.openExternal((await this.getSettings()).managementUrl)
  }

  async status(): Promise<CpaStatus> { return this.runtime.status() }
  start(): Promise<void> {
    const generation = this.generation
    return this.queue.run(async () => {
      const settings = await this.getSettings()
      this.assertActive(generation)
      if (settings.mode !== 'managed') return
      if (!settings.enabled) throw new Error('cpa-not-enabled')
      await this.runtime.start(settings)
    })
  }
  async stop(): Promise<void> {
    this.generation++
    // Abort immediately, even if an open operation is downloading.
    const stopped = this.runtime.stop()
    await this.queue.run(async () => { await stopped; this.closeSurface() })
  }
  async restart(): Promise<void> { await this.stop(); await this.start() }
  async update(): Promise<void> {
    const settings = await this.getSettings()
    if (settings.mode !== 'managed' || !settings.enabled) throw new Error('cpa-not-enabled')
    await this.runtime.stageUpdate()
    await this.restart()
  }
  async copyManagementKey(): Promise<void> {
    if ((await this.getSettings()).mode !== 'managed') throw new Error('cpa-not-managed')
    await this.runtime.copyKey()
  }
  async openLogs(): Promise<void> { await this.runtime.openLogs() }
  async dispose(): Promise<void> {
    this.disposed = true; this.generation++
    await this.runtimeValue?.dispose(); this.closeSurface()
  }

  private assertActive(generation: number): void {
    if (this.disposed || this.generation !== generation) throw new Error('cpa-stopped')
  }

  private closeSurface(): void {
    this.surfaces.destroySurface(CPA_SURFACE_ID)
    this.surfaceUrl = null
  }
}
