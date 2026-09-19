import { stat } from 'fs/promises'
import { homedir } from 'os'
import { delimiter } from 'path'
import { execa } from 'execa'
import type {
  ExternalCliApplyResult,
  ExternalCliDetectResult,
  ExternalCliInstallResult,
  ExternalCliLatestResult,
  ExternalCliSyncState,
  ExternalCliToolId,
  TerminalApplyModelRequest,
  TerminalApplyModelResult,
  TerminalModelState,
  TerminalRollbackResult,
} from '../../shared/ipc/external-cli'
import type { ExternalCliRollbackResult } from '../../shared/ipc/external-cli'
import { AuthType } from '@janusx/llm-core'
import { llmConfigStore } from '../llm/ConfigStore'
import { getExternalCliTool } from './tool-registry'
import type { ExternalCliToolDescriptor } from './tool-registry'
import { CliDetector } from './cli-detector'
import { CliInstaller } from './installer'
import { fetchLatestVersion } from './latest'
import { ClaudeSettingsApplier, claudeSettingsApplier } from './settings-applier'
import { isModelTerminal, terminalModelUnsupported, terminalProjectors, type TerminalProjectors } from './terminal-projectors'
import { ExternalCliSyncStateStore, externalCliSyncStateStore } from './sync-state'

// Note: 外部 CLI 版本检测与安装编排入口 —— 见 .agents/notes/implemented/feature/2026-09-17-cc-switch-cli-detect-install.md
// Note: LLM 多 CLI 管理（现有 LLM Provider 借给外部 CLI，含同步状态）走同一门面，原子备份与重读校验是硬性要求 —— 见 .agents/notes/implemented/feature/2026-09-17-cc-switch-cli-matrix.md
export interface ExternalCliService {
  detect(toolId: ExternalCliToolId): Promise<ExternalCliDetectResult>
  latest(toolId: ExternalCliToolId): Promise<ExternalCliLatestResult>
  install(toolId: ExternalCliToolId): Promise<ExternalCliInstallResult>
  applyProvider(toolId: ExternalCliToolId, providerId: string | null): Promise<ExternalCliApplyResult>
  syncState(): Promise<ExternalCliSyncState>
  rollbackProfile(): Promise<ExternalCliRollbackResult>
  readTerminalModel(toolId: ExternalCliToolId): Promise<TerminalModelState>
  applyTerminalModel(request: TerminalApplyModelRequest): Promise<TerminalApplyModelResult>
  rollbackTerminal(toolId: ExternalCliToolId): Promise<TerminalRollbackResult>
}

/** 从现有 LLM 引擎解析出的可同步凭证；null 表示没有可用配置。 */
export interface ExternalCliLlmCredentials {
  providerId: string
  providerName: string
  baseURL: string
  authToken: string
  model?: string
}

async function defaultResolveLlmCredentials(providerId: string | null): Promise<ExternalCliLlmCredentials | null> {
  // 凭证唯一来源是 Claude 终端的自有集合；显式 id 与终端默认都只在该集合内解析。
  const provider = providerId === null
    ? await llmConfigStore.getTerminalDefaultSettings('claude')
    : await llmConfigStore.getTerminalProvider('claude', providerId)
  if (!provider || provider.enabled === false) return null
  if (provider.authType !== AuthType.API_KEY && provider.authType !== AuthType.ANTHROPIC) return null
  const baseURL = provider.baseURL?.trim() ?? ''
  const authToken = provider.apiKey?.trim() ?? ''
  if (!baseURL || !authToken) return null
  const model = provider.modelId?.trim() || provider.defaultModelId?.trim() || undefined
  return { providerId: provider.id, providerName: provider.name, baseURL, authToken, ...(model ? { model } : {}) }
}

function notInstalled(toolId: ExternalCliToolId, error: string): ExternalCliDetectResult {
  return { toolId, installed: false, runnable: false, hint: error }
}

export class DefaultExternalCliService implements ExternalCliService {
  private readonly installer = new CliInstaller({
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
          cwd: options.cwd,
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
    private readonly detectors: Partial<Record<ExternalCliToolId, CliDetector>> = {},
    private readonly applier: ClaudeSettingsApplier = claudeSettingsApplier,
    private readonly syncStore: ExternalCliSyncStateStore = externalCliSyncStateStore,
    private readonly resolveLlmCredentials: (providerId: string | null) => Promise<ExternalCliLlmCredentials | null> = defaultResolveLlmCredentials,
    installer?: CliInstaller,
    private readonly projectors: TerminalProjectors = terminalProjectors,
  ) {
    if (installer) this.installer = installer
  }

  private detectorFor(toolId: ExternalCliToolId): CliDetector {
    const existing = this.detectors[toolId]
    if (existing) return existing
    const created = new CliDetector(toolId)
    this.detectors[toolId] = created
    return created
  }

  async detect(toolId: ExternalCliToolId): Promise<ExternalCliDetectResult> {
    if (!getExternalCliTool(toolId)) return notInstalled(toolId, 'Unsupported tool.')
    return this.detectorFor(toolId).detect()
  }

  async latest(toolId: ExternalCliToolId): Promise<ExternalCliLatestResult> {
    const tool = getExternalCliTool(toolId)
    if (!tool) return { toolId }
    // 自有工具的“最新”即 sibling 源码版本号；取不到（打包后）则未知，不阻塞卡片。
    if (tool.latestStrategy === 'local-source') {
      const source = await this.installer.locateLocalSource(tool)
      return { toolId, latestVersion: source?.version }
    }
    if (!tool.npmPackage) return { toolId }
    return { toolId, latestVersion: await fetchLatestVersion(tool.npmPackage) }
  }

  /**
   * Codex self-heal (`uninstall || install`): Codex ships no official
   * self-update and a zero exit can mask a missing binary, so a broken
   * install is removed before the reinstall runs. The removal is best
   * effort: a failed uninstall still falls through to install, whose
   * post-install re-probe owns the success verdict. Codex-only by design;
   * other tools keep their anchor-aware upgrade path when it lands.
   */
  private async healBrokenCodex(tool: ExternalCliToolDescriptor): Promise<void> {
    const probe = await this.detectorFor('codex').detect().catch(() => null)
    if (probe && probe.installed && !probe.runnable) {
      await this.installer.uninstall(tool)
    }
  }

  async install(toolId: ExternalCliToolId): Promise<ExternalCliInstallResult> {
    const tool = getExternalCliTool(toolId)
    if (!tool) return { toolId, success: false, error: 'Unsupported tool.' }
    // 全局忙守卫：npm -g 并发写会互相破坏，串行是硬性要求。
    if (this.installer.isBusy()) return { toolId, success: false, error: 'Another install is already running.' }
    if (toolId === 'codex') await this.healBrokenCodex(tool)
    const outcome = await this.installer.install(tool)
    if (!outcome.success) return { toolId, success: false, command: outcome.command, error: outcome.error }
    // 安装后重探：展示=实际运行，绝不凭 exit 0 断言成功。
    const probe = await this.detectorFor(toolId).detect()
    if (!probe.runnable || !probe.version) {
      return { toolId, success: false, command: outcome.command, error: probe.hint ?? `Install finished but ${tool.displayName} is not runnable.` }
    }
    return { toolId, success: true, command: outcome.command, version: probe.version }
  }

  async applyProvider(toolId: ExternalCliToolId, providerId: string | null): Promise<ExternalCliApplyResult> {
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

  async syncState(): Promise<ExternalCliSyncState> {
    return this.syncStore.get()
  }

  async rollbackProfile(): Promise<ExternalCliRollbackResult> {
    try {
      const outcome = await this.applier.rollback()
      // 回滚后 Live 已不再是同步记录的内容，诚实地清空同步态。
      await this.syncStore.clear()
      return { success: true, backupPath: outcome.backupPath }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async readTerminalModel(toolId: ExternalCliToolId): Promise<TerminalModelState> {
    if (!isModelTerminal(toolId)) {
      return { toolId, configPath: null, exists: false, error: terminalModelUnsupported(toolId) }
    }
    try {
      return await this.projectors.read(toolId)
    } catch (error) {
      const configPath = await this.projectors.configPathFor(toolId).catch(() => null as string | null)
      return { toolId, configPath, exists: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async applyTerminalModel(request: TerminalApplyModelRequest): Promise<TerminalApplyModelResult> {
    if (!isModelTerminal(request.toolId)) return { success: false, error: terminalModelUnsupported(request.toolId) }
    try {
      return await this.projectors.apply(request.toolId, request.model)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async rollbackTerminal(toolId: ExternalCliToolId): Promise<TerminalRollbackResult> {
    if (!isModelTerminal(toolId)) return { success: false, error: terminalModelUnsupported(toolId) }
    try {
      const outcome = await this.projectors.rollback(toolId)
      return { success: true, backupPath: outcome.backupPath }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

export const externalCliService: ExternalCliService = new DefaultExternalCliService()
