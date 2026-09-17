import { stat } from 'fs/promises'
import { homedir } from 'os'
import { delimiter } from 'path'
import { execa } from 'execa'
import type {
  CcSwitchDetectResult,
  CcSwitchInstallResult,
  CcSwitchLatestResult,
  CcSwitchToolId,
} from '../../shared/ipc/cc-switch'
import { getCcSwitchTool } from './tool-registry'
import { ClaudeDetector, claudeDetector } from './claude-detector'
import { ClaudeInstaller } from './installer'
import { fetchLatestVersion } from './latest'

// Note: cc-switch 移植的外部 CLI 版本检测与安装编排入口 —— 见 .agents/notes/implemented/feature/2026-09-17-cc-switch-cli-detect-install.md
export interface CcSwitchService {
  detect(toolId: CcSwitchToolId): Promise<CcSwitchDetectResult>
  latest(toolId: CcSwitchToolId): Promise<CcSwitchLatestResult>
  install(toolId: CcSwitchToolId): Promise<CcSwitchInstallResult>
}

function notInstalled(toolId: CcSwitchToolId, error: string): CcSwitchDetectResult {
  return { toolId, installed: false, runnable: false, hint: error }
}

class DefaultCcSwitchService implements CcSwitchService {
  private readonly installer = new ClaudeInstaller({
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

  constructor(private readonly detector: ClaudeDetector = claudeDetector) {}

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
}

export const ccSwitchService: CcSwitchService = new DefaultCcSwitchService()
