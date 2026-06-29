import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import type { GlobalConfig } from '../workspace/types'
import {
  DEFAULT_AGENT_NOTIFICATION_SETTINGS,
  normalizeAgentNotificationSettings,
  type AgentNotificationSettings,
} from '../../shared/notifications'

const DEFAULT_CONFIG: GlobalConfig = {
  theme: 'dark',
  defaultTerminalPreset: 'shell',
  defaultShell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
  registeredCLIs: [
    {
      id: 'claude-code',
      name: 'Claude Code',
      command: 'claude',
      args: [],
      description: 'Anthropic Claude Code CLI',
    },
    {
      id: 'codex',
      name: 'Codex',
      command: 'codex',
      args: [],
      description: 'OpenAI Codex CLI',
    },
  ],
  recentWorkspaces: [],
  notificationSettings: DEFAULT_AGENT_NOTIFICATION_SETTINGS,
}

class ConfigService {
  private configPath: string
  private config: GlobalConfig | null = null

  constructor() {
    this.configPath = join(app.getPath('userData'), 'janusx', 'config.json')
  }

  private async ensureDir(): Promise<void> {
    await mkdir(join(app.getPath('userData'), 'janusx'), { recursive: true })
  }

  async load(): Promise<GlobalConfig> {
    try {
      const data = await readFile(this.configPath, 'utf-8')
      const parsed = JSON.parse(data) as Partial<GlobalConfig>
      this.config = {
        ...DEFAULT_CONFIG,
        ...parsed,
        notificationSettings: normalizeAgentNotificationSettings(parsed.notificationSettings),
      }
    } catch {
      this.config = { ...DEFAULT_CONFIG }
      await this.save()
    }
    return this.config!
  }

  async save(): Promise<void> {
    if (!this.config) return
    await this.ensureDir()
    await writeFile(this.configPath, JSON.stringify(this.config, null, 2))
  }

  async get(): Promise<GlobalConfig> {
    if (!this.config) {
      this.config = await this.load()
    }
    return this.config
  }

  async update(partial: Partial<GlobalConfig>): Promise<GlobalConfig> {
    const current = await this.get()
    this.config = { ...current, ...partial }
    if (partial.notificationSettings) {
      this.config.notificationSettings = normalizeAgentNotificationSettings({
        ...current.notificationSettings,
        ...partial.notificationSettings,
      })
    }
    await this.save()
    return this.config
  }

  async getNotificationSettings(): Promise<AgentNotificationSettings> {
    const config = await this.get()
    return normalizeAgentNotificationSettings(config.notificationSettings)
  }

  async updateNotificationSettings(
    partial: Partial<AgentNotificationSettings>,
  ): Promise<AgentNotificationSettings> {
    const current = await this.getNotificationSettings()
    const notificationSettings = normalizeAgentNotificationSettings({ ...current, ...partial })
    await this.update({ notificationSettings })
    return notificationSettings
  }

  async addRecentWorkspace(id: string): Promise<void> {
    const config = await this.get()
    const recent = config.recentWorkspaces.filter((r) => r !== id)
    recent.unshift(id)
    if (recent.length > 10) recent.pop()
    await this.update({ recentWorkspaces: recent })
  }

  getRegisteredCLIs(): GlobalConfig['registeredCLIs'] {
    return this.config?.registeredCLIs ?? DEFAULT_CONFIG.registeredCLIs
  }
}

export const configService = new ConfigService()
