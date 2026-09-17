import type { CcSwitchToolId } from '../../shared/ipc/cc-switch'

export interface CcSwitchToolDescriptor {
  id: CcSwitchToolId
  displayName: string
  /** PATH 与已知位置中查找的可执行文件名（win32 含 .cmd/.exe 变体）。 */
  binaryNames: readonly string[]
  npmPackage: string
  /** 手动安装命令（展示与复制用，静默执行侧按平台重算）。 */
  manualInstallCommand: string
  latestStrategy: 'npm-dist-tags'
  /** 各工具原生安装器遗留的额外目录（win32），与 npm 全局目录并列探测。 */
  extraKnownDirs?: {
    win32?: readonly string[]
  }
}

function npmInstallCommand(npmPackage: string): string {
  return `npm i -g ${npmPackage}@latest`
}

/**
 * 工具声明单表：展示名、包名、安装命令、最新版策略收敛在一处，
 * 前后端不再各维护一份映射（cc-switch 三张小表拼凑的教训）。
 */
export const CC_SWITCH_TOOLS: Record<CcSwitchToolId, CcSwitchToolDescriptor> = {
  claude: {
    id: 'claude',
    displayName: 'Claude Code',
    binaryNames: ['claude'],
    npmPackage: '@anthropic-ai/claude-code',
    manualInstallCommand: npmInstallCommand('@anthropic-ai/claude-code'),
    latestStrategy: 'npm-dist-tags',
    extraKnownDirs: {
      // 原生安装器位置（cc-switch build_tool_search_paths 同源）。
      win32: ['%LOCALAPPDATA%\\Programs\\claude'],
    },
  },
  codex: {
    id: 'codex',
    displayName: 'Codex',
    binaryNames: ['codex'],
    npmPackage: '@openai/codex',
    manualInstallCommand: npmInstallCommand('@openai/codex'),
    latestStrategy: 'npm-dist-tags',
    extraKnownDirs: {
      win32: ['%LOCALAPPDATA%\\Programs\\OpenAI\\Codex\\bin'],
    },
  },
  gemini: {
    id: 'gemini',
    displayName: 'Gemini CLI',
    binaryNames: ['gemini'],
    npmPackage: '@google/gemini-cli',
    manualInstallCommand: npmInstallCommand('@google/gemini-cli'),
    latestStrategy: 'npm-dist-tags',
  },
  opencode: {
    id: 'opencode',
    displayName: 'OpenCode',
    binaryNames: ['opencode'],
    npmPackage: 'opencode-ai',
    manualInstallCommand: npmInstallCommand('opencode-ai'),
    latestStrategy: 'npm-dist-tags',
  },
}

export function getCcSwitchTool(toolId: string): CcSwitchToolDescriptor | undefined {
  if (toolId !== 'claude' && toolId !== 'codex' && toolId !== 'gemini' && toolId !== 'opencode') return undefined
  return CC_SWITCH_TOOLS[toolId]
}
