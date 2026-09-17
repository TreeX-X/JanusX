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
    manualInstallCommand: 'npm i -g @anthropic-ai/claude-code@latest',
    latestStrategy: 'npm-dist-tags',
  },
}

export function getCcSwitchTool(toolId: string): CcSwitchToolDescriptor | undefined {
  if (toolId !== 'claude') return undefined
  return CC_SWITCH_TOOLS[toolId]
}
