import { app } from 'electron'
import { join } from 'path'
import { readFile, rename } from 'fs/promises'
import { SerialQueue, writeFileAtomic } from '../lib/atomic-file'
import type { GlobalConfig } from '../workspace/types'
import {
  DEFAULT_AGENT_NOTIFICATION_SETTINGS,
  normalizeAgentNotificationSettings,
  normalizeRemoteNotificationSettings,
  isValidFeishuGroupPrefix,
  validateFeishuControlConfig,
  type AgentNotificationSettings,
  type RemoteNotificationSettings,
} from '../../shared/notifications'
import {
  DEFAULT_KNOWLEDGE_SETTINGS,
  normalizeKnowledgeSettings,
  type KnowledgeSettings,
} from '../../shared/knowledge-settings'
import { normalizeAgentApprovalMode, type AgentApprovalMode } from '../../shared/ipc/agent-runtime'

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
  knowledgeSettings: DEFAULT_KNOWLEDGE_SETTINGS,
  agentApprovalMode: 'per-action',
}

export class ConfigService {
  private configPath: string
  private config: GlobalConfig | null = null
  private writeQueue = new SerialQueue()

  constructor() {
    this.configPath = join(app.getPath('userData'), 'janusx', 'config.json')
  }

  async load(): Promise<GlobalConfig> {
    try {
      const data = await readFile(this.configPath, 'utf-8')
      const parsed = JSON.parse(data) as Partial<GlobalConfig>
      this.config = {
        ...DEFAULT_CONFIG,
        ...parsed,
        notificationSettings: normalizeAgentNotificationSettings(parsed.notificationSettings),
        knowledgeSettings: normalizeKnowledgeSettings(parsed.knowledgeSettings),
        agentApprovalMode: normalizeAgentApprovalMode(parsed.agentApprovalMode),
      }
    } catch (error) {
      // 解析失败（文件存在但损坏）时先备份，避免默认配置覆盖后用户数据无法恢复
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await this.backupCorruptFile()
      }
      this.config = { ...DEFAULT_CONFIG }
      await this.persist()
    }
    return this.config!
  }

  private async backupCorruptFile(): Promise<void> {
    try {
      await rename(this.configPath, `${this.configPath}.corrupt-${Date.now()}`)
    } catch {
      /* 备份失败不阻塞启动 */
    }
  }

  async save(): Promise<void> {
    await this.writeQueue.run(() => this.persist())
  }

  private async persist(): Promise<void> {
    if (!this.config) return
    await writeFileAtomic(this.configPath, JSON.stringify(this.config, null, 2))
  }

  async get(): Promise<GlobalConfig> {
    if (!this.config) {
      this.config = await this.load()
    }
    return this.config
  }

  async update(partial: Partial<GlobalConfig>): Promise<GlobalConfig> {
    // merge 与写盘同队列执行，防止并发 update 交错丢字段
    return this.writeQueue.run(async () => {
      const current = await this.get()
      this.config = { ...current, ...partial }
      if (partial.notificationSettings) {
        this.config.notificationSettings = normalizeAgentNotificationSettings({
          ...current.notificationSettings,
          ...partial.notificationSettings,
        })
      }
      if (partial.knowledgeSettings) {
        this.config.knowledgeSettings = normalizeKnowledgeSettings({
          ...current.knowledgeSettings,
          ...partial.knowledgeSettings,
        })
      }
      if (partial.agentApprovalMode !== undefined) {
        this.config.agentApprovalMode = normalizeAgentApprovalMode(partial.agentApprovalMode)
      }
      await this.persist()
      return this.config
    })
  }

  async getNotificationSettings(): Promise<AgentNotificationSettings> {
    const config = await this.get()
    return normalizeAgentNotificationSettings(config.notificationSettings)
  }

  async updateNotificationSettings(
    partial: Partial<AgentNotificationSettings>,
  ): Promise<AgentNotificationSettings> {
    const current = await this.getNotificationSettings()
    const requestedSecret = partial.remote?.providers?.feishu?.appSecret
    const requestedFeishu = partial.remote?.providers?.feishu
    if (
      requestedFeishu?.groupPromptPrefix !== undefined
      && !isValidFeishuGroupPrefix(requestedFeishu.groupPromptPrefix)
    ) throw new Error('Group prompt prefix must be a non-reserved /name value')

    const notificationSettings = normalizeAgentNotificationSettings({
      ...current,
      ...partial,
      remote: normalizeRemoteNotificationSettings({
        ...current.remote,
        ...partial.remote,
        providers: {
          ...current.remote.providers,
          ...partial.remote?.providers,
          feishu: {
            ...current.remote.providers.feishu,
            ...partial.remote?.providers?.feishu,
            appSecret: requestedSecret?.trim()
              ? requestedSecret
              : current.remote.providers.feishu.appSecret,
          },
        },
      }),
    })
    const feishu = notificationSettings.remote.providers.feishu
    if (
      requestedFeishu?.enabled === false
      || requestedFeishu?.mode === 'webhook'
      || (Array.isArray(requestedFeishu?.allowedOpenIds) && feishu.allowedOpenIds.length === 0
        && current.remote.providers.feishu.inboundControlEnabled)
    ) feishu.inboundControlEnabled = false
    const validationError = validateFeishuControlConfig(feishu)
    if (validationError) throw new Error(validationError)
    await this.update({ notificationSettings })
    return notificationSettings
  }

  async getRemoteNotificationSettings(): Promise<RemoteNotificationSettings> {
    const settings = await this.getNotificationSettings()
    return normalizeRemoteNotificationSettings(settings.remote)
  }

  async getKnowledgeSettings(): Promise<KnowledgeSettings> {
    const config = await this.get()
    return normalizeKnowledgeSettings(config.knowledgeSettings)
  }

  async updateKnowledgeSettings(partial: Partial<KnowledgeSettings>): Promise<KnowledgeSettings> {
    const current = await this.getKnowledgeSettings()
    const knowledgeSettings = normalizeKnowledgeSettings({
      ...current,
      ...partial,
    })
    await this.update({ knowledgeSettings })
    return knowledgeSettings
  }

  async getAgentApprovalMode(): Promise<AgentApprovalMode> {
    return normalizeAgentApprovalMode((await this.get()).agentApprovalMode)
  }

  async updateAgentApprovalMode(mode: unknown): Promise<AgentApprovalMode> {
    const normalized = normalizeAgentApprovalMode(mode)
    await this.update({ agentApprovalMode: normalized })
    return normalized
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

  async getLanguage(): Promise<string | null> {
    const config = await this.get()
    const lang = config.language
    return lang === 'zh-CN' || lang === 'en' ? lang : null
  }

  async setLanguage(lang: string): Promise<void> {
    if (lang !== 'zh-CN' && lang !== 'en') {
      throw new Error(`Unsupported language: ${lang}`)
    }
    await this.update({ language: lang })
  }
}

export const configService = new ConfigService()
