import { stat } from 'fs/promises'
import { homedir } from 'os'
import { delimiter } from 'path'
import { execa } from 'execa'
import type {
  CcSwitchApplyResult,
  CcSwitchDetectResult,
  CcSwitchInstallResult,
  CcSwitchLatestResult,
  CcSwitchSyncState,
  CcSwitchToolId,
} from '../../shared/ipc/cc-switch'
import type { CcSwitchRollbackResult } from '../../shared/ipc/cc-switch'
import { AuthType } from '@janusx/llm-core'
import { llmConfigStore } from '../llm/ConfigStore'
import { getCcSwitchTool } from './tool-registry'
import { ClaudeDetector, claudeDetector } from './claude-detector'
import { ClaudeInstaller } from './installer'
import { fetchLatestVersion } from './latest'
import { ClaudeSettingsApplier, claudeSettingsApplier } from './settings-applier'
import { CcSwitchSyncStateStore, ccSwitchSyncStateStore } from './sync-state'

// Note: cc-switch 移植的外部 CLI 版本检测与安装编排入口 —— 见 .agents/notes/implemented/feature/2026-09-17-cc-switch-cli-detect-install.md
// Note: LLM 多 CLI 管理（现有 LLM Provider 借给外部 CLI，含同步状态）走同一门面，原子备份与重读校验是硬性要求 —— 见 .agents/notes/implemented/feature/2026-09-17-cc-switch-cli-matrix.md
export interface CcSwitchService {
  detect(toolId: CcSwitchToolId): Promise<CcSwitchDetectResult>
  latest(toolId: CcSwitchToolId): Promise<CcSwitchLatestResult>
  install(toolId: CcSwitchToolId): Promise<CcSwitchInstallResult>
  applyProvider(toolId: CcSwitchToolId, providerId: string | null): Promise<CcSwitchApplyResult>
  syncState(): Promise<CcSwitchSyncState>
  rollbackProfile(): Promise<CcSwitchRollbackResult>
}

/** 从现有 LLM 引擎解析出的可同步凭证；null 表示没有可用配置。 */
export interface CcSwitchLlmCredentials {
  providerId: string
  providerName: string
  baseURL: string
  authToken: string
  model?: string
}

async function defaultResolveLlmCredentials(providerId: string | null): Promise<CcSwitchLlmCredentials | null> {
  const provider = providerId === null
    ? await llmConfigStore.getDefaultProvider()
    : await llmConfigStore.getProviderSettings(providerId)
  if (!provider || provider.enabled === false) return null
  if (provider.authType !== AuthType.API_KEY) return null
  const baseURL = provider.baseURL?.trim() ?? ''
  const authToken = provider.apiKey?.trim() ?? ''
  if (!baseURL || !authToken) return null
  const model = provider.modelId?.trim() || provider.defaultModelId?.trim() || undefined
  return { providerId: provider.id, providerName: provider.name, baseURL, authToken, ...(model ? { model } : {}) }
}

function notInstalled(toolId: CcSwitchToolId, error: string): CcSwitchDetectResult {
  return { toolId, installed: false, runnable: false, hint: error }
}

export class DefaultCcSwitchService implements CcSwitchService {  private readonly installer = new ClaudeInstaller({
    platform: process.platform,
    env: process.env,
    homeDir: homedir(),
    isRegularFile: async path => (await stat(path)).isFile(),
    run: async (file, args, options) => {
      const pathValue = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? ''
      const mergedPath = [...options.pathDirs, ...pathValue.split(delimiter).filter(Boolean)]
        .filter((dir, index, all) => dir && all.indexOf(dir) === index)
        .join(delimiter)
      try {
        const result = await execa(file, args, {
          timeout: options.timeout,
          reject: false,
          windowsHide: true,
          env: { ...process.env, PATH: mergedPath },
        })
        return { exitCode: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr }
      } catch (error) {
        const failure = error as { exitCode?: number; stdout?: string; stderr?: string }
        return { exitCode: failure.exitCode ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
      }
    },
  })

  constructor(
    private readonly detector: ClaudeDetector = claudeDetector,
    private readonly applier: ClaudeSettingsApplier = claudeSettingsApplier,
    private readonly syncStore: CcSwitchSyncStateStore = ccSwitchSyncStateStore,
    private readonly resolveLlmCredentials: (providerId: string | null) => Promise<CcSwitchLlmCredentials | null> = defaultResolveLlmCredentials,
  ) {}

  async detect(toolId: CcSwitchToolId): Promise<CcSwitchDetectResult> {
    if (toolId !== 'claude') return notInstalled(toolId, 'Unsupported tool.')
    return this.detector.detect()
  }

  async latest(toolId: CcSwitchToolId): Promise<CcSwitchLatestResult> {
    const tool = getCcSwitchTool(toolId)
    if (!tool) return { toolId }
    return { toolId, latestVersion: await fetchLatestVersion(tool) }
  }

  async install(toolId: CcSwitchToolId): Promise<CcSwitchInstallResult> {
    const tool = getCcSwitchTool(toolId)
    if (!tool) return { toolId, success: false, error: 'Unsupported tool.' }
    // 全局忙守卫：npm -g 并发写会互相破坏，串行是硬性要求。
    if (this.installer.isBusy()) return { toolId, success: false, error: 'Another install is already running.' }
    const outcome = await this.installer.install(tool)
    if (!outcome.success) return { toolId, success: false, command: outcome.command, error: outcome.error }
    // 安装后重探：展示=实际运行，绝不凭 exit 0 断言成功。
    const probe = await this.detector.detect()
    if (!probe.runnable || !probe.version) {
      return { toolId, success: false, command: outcome.command, error: probe.hint ?? 'Install finished but Claude Code is not runnable.' }
    }
    return { toolId, success: true, command: outcome.command, version: probe.version }
  }

  async applyProvider(toolId: CcSwitchToolId, providerId: string | null): Promise<CcSwitchApplyResult> {
    if (toolId !== 'claude') return { success: false, error: 'Unsupported tool.' }
    // 凭证唯一来源是现有 LLM 引擎的 Provider；本域不存任何密钥，只记同步来源。
    const credentials = await this.resolveLlmCredentials(providerId)
    if (!credentials) return { success: false, error: 'NO_LLM_PROVIDER' }
    try {
      const outcome = await this.applier.apply(credentials)
      await this.syncStore.record({
        providerId: credentials.providerId,
        providerName: credentials.providerName,
        baseURL: outcome.applied.baseURL,
        ...(outcome.applied.model ? { model: outcome.applied.model } : {}),
        syncedAt: Date.now(),
        backupPath: outcome.backupPath,
      })
      return { success: true, providerName: credentials.providerName, backupPath: outcome.backupPath }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async syncState(): Promise<CcSwitchSyncState> {
    return this.syncStore.get()
  }

  async rollbackProfile(): Promise<CcSwitchRollbackResult> {
    try {
      const outcome = await this.applier.rollback()
      // 回滚后 Live 已不再是同步记录的内容，诚实地清空同步态。
      await this.syncStore.clear()
      return { success: true, backupPath: outcome.backupPath }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

export const ccSwitchService: CcSwitchService = new DefaultCcSwitchService()
