// Note: global CPA page configuration and isolated browser session — see .agents/notes/workbench/service-integrations.md
import { createHash } from 'node:crypto'
import { shell } from 'electron'
import type { BrowserSurfaceManager } from '../browser/surface-manager'
import { configService } from '../config/service'
import { SerialQueue } from '../lib/atomic-file'
import { CPA_SURFACE_ID, DEFAULT_CPA_MANAGEMENT_URL, normalizeCpaManagementUrl, type CpaSettings } from '../../shared/ipc/cpa'

export class CpaService {
  private queue = new SerialQueue()
  private surfaceUrl: string | null = null

  constructor(private surfaces: BrowserSurfaceManager) {}

  async getSettings(): Promise<CpaSettings> {
    const config = await configService.get()
    try {
      return { managementUrl: normalizeCpaManagementUrl(config.cpaSettings?.managementUrl ?? DEFAULT_CPA_MANAGEMENT_URL) }
    } catch {
      // A manually edited/stale address must not prevent repairing it in settings.
      return { managementUrl: DEFAULT_CPA_MANAGEMENT_URL }
    }
  }

  saveSettings(input: unknown): Promise<CpaSettings> {
    return this.queue.run(async () => {
      const managementUrl = normalizeCpaManagementUrl(
        typeof input === 'object' && input !== null && 'managementUrl' in input ? input.managementUrl : undefined,
      )
      const previous = await this.getSettings()
      await configService.update({ cpaSettings: { managementUrl } })
      if (previous.managementUrl !== managementUrl) this.closeSurface()
      return { managementUrl }
    })
  }

  open(): Promise<void> {
    return this.queue.run(async () => {
      const { managementUrl } = await this.getSettings()
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
    await shell.openExternal((await this.getSettings()).managementUrl)
  }

  private closeSurface(): void {
    this.surfaces.destroySurface(CPA_SURFACE_ID)
    this.surfaceUrl = null
  }
}
