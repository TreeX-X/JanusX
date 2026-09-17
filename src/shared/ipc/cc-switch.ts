/**
 * cc-switch 移植：外部 CLI 工具的版本检测与安装契约。
 * 主进程与渲染进程共享：通道名、结果类型、工具元数据，以及两端对称的 semver 比较。
 */
export const CC_SWITCH_CHANNELS = {
  detect: 'cc-switch:detect',
  latest: 'cc-switch:latest',
  install: 'cc-switch:install',
  applyProvider: 'cc-switch:provider:apply',
  syncState: 'cc-switch:sync-state',
  rollbackProfile: 'cc-switch:profile:rollback',
} as const

export type CcSwitchChannel = (typeof CC_SWITCH_CHANNELS)[keyof typeof CC_SWITCH_CHANNELS]

/** 受管外部终端白名单；与 JanusX 终端预设的外部 CLI 对齐（claude/codex/opencode/pi 为第三方，janus 为自有 sibling 源码构建） */
export type CcSwitchToolId = 'claude' | 'codex' | 'opencode' | 'pi' | 'janus'

export const CC_SWITCH_TOOL_ORDER: readonly CcSwitchToolId[] = ['claude', 'codex', 'opencode', 'pi', 'janus']

/** 两端共享的展示元数据：首字母徽标＋品牌色，不引入二进制图标资产。 */
export interface CcSwitchToolMeta {
  id: CcSwitchToolId
  displayName: string
  monogram: string
  color: string
}

export const CC_SWITCH_TOOL_META: Record<CcSwitchToolId, CcSwitchToolMeta> = {
  claude: { id: 'claude', displayName: 'Claude Code', monogram: 'C', color: '#d97757' },
  codex: { id: 'codex', displayName: 'Codex', monogram: 'X', color: '#6e6e6e' },
  opencode: { id: 'opencode', displayName: 'OpenCode', monogram: 'O', color: '#8b8b8b' },
  pi: { id: 'pi', displayName: 'Pi Agent', monogram: 'P', color: '#7aa2f7' },
  janus: { id: 'janus', displayName: 'Janus', monogram: 'J', color: '#9ece6a' },
}

export type CcSwitchBinarySource = 'path' | 'known-location'

export interface CcSwitchDetectResult {
  toolId: CcSwitchToolId
  /** false = 未安装；true 但 runnable=false = 装了但跑不起来（与 cc-switch installed_but_broken 同义）。 */
  installed: boolean
  runnable: boolean
  version?: string
  path?: string
  source?: CcSwitchBinarySource
  /** 未安装时给出可复制的手动安装命令；跑不起来时给出诊断摘要。 */
  hint?: string
  existingTerminalNotice?: string
}

export interface CcSwitchLatestResult {
  toolId: CcSwitchToolId
  /** 查不到（离线/超时/注册表异常）时为 undefined，调用方展示 unknown 且不阻塞卡片。 */
  latestVersion?: string
}

export interface CcSwitchInstallResult {
  toolId: CcSwitchToolId
  success: boolean
  /** 成功时为安装后重探到的版本号。 */
  version?: string
  /** 实际执行的命令（回显用，执行侧重算，绝不信任渲染端回传）。 */
  command?: string
  error?: string
}

export interface CcSwitchAPI {
  detect(toolId: CcSwitchToolId): Promise<CcSwitchDetectResult>
  latest(toolId: CcSwitchToolId): Promise<CcSwitchLatestResult>
  install(toolId: CcSwitchToolId): Promise<CcSwitchInstallResult>
  applyProvider(request: CcSwitchApplyProviderRequest): Promise<CcSwitchApplyResult>
  syncState(): Promise<CcSwitchSyncState>
  rollbackProfile(): Promise<CcSwitchRollbackResult>
}

/** 同步凭证输入：调用方只给三元组，绝不经过画像存储。 */
export interface CcSwitchApplyInput {
  baseURL: string
  authToken: string
  model?: string
}

export interface CcSwitchApplyResult {
  success: boolean
  providerName?: string
  backupPath?: string | null
  /** 'NO_LLM_PROVIDER' 由渲染端映射为本地化文案，其余为原文透出。 */
  error?: string
}

export interface CcSwitchApplyProviderRequest {
  toolId: CcSwitchToolId
  /** null 表示沿用 LLM 引擎默认配置。 */
  providerId: string | null
}

export interface ClaudeSyncRecordState {
  providerId: string
  providerName: string
  baseURL: string
  model?: string
  syncedAt: number
  backupPath: string | null
}

export interface CcSwitchSyncState {
  claude: ClaudeSyncRecordState | null
}

export interface CcSwitchRollbackResult {
  success: boolean
  backupPath?: string
  error?: string
}

interface ParsedCliVersion {
  core: number[]
  prerelease: string[]
}

function parseCliVersion(version: string): ParsedCliVersion | undefined {
  const match = version.trim().match(/^(\d+(?:\.\d+){0,2})(?:-([\w.]+))?/)
  if (!match) return undefined
  return {
    core: match[1].split('.').map(Number),
    prerelease: match[2] ? match[2].split('.') : [],
  }
}

/**
 * 两端对称的 semver 比较：>0 表示 a 更新，<0 表示 b 更新，0 表示相等或不可比。
 * 正式版高于预发布版；预发布标识中纯数字段按数值比，其余按字典序。
 */
export function compareCliVersions(a: string, b: string): number {
  const parsedA = parseCliVersion(a)
  const parsedB = parseCliVersion(b)
  if (!parsedA || !parsedB) return 0
  for (let index = 0; index < Math.max(parsedA.core.length, parsedB.core.length); index += 1) {
    const diff = (parsedA.core[index] ?? 0) - (parsedB.core[index] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  if (parsedA.prerelease.length === 0 && parsedB.prerelease.length === 0) return 0
  if (parsedA.prerelease.length === 0) return 1
  if (parsedB.prerelease.length === 0) return -1
  for (let index = 0; index < Math.max(parsedA.prerelease.length, parsedB.prerelease.length); index += 1) {
    const idA = parsedA.prerelease[index]
    const idB = parsedB.prerelease[index]
    if (idA === undefined) return -1
    if (idB === undefined) return 1
    if (idA === idB) continue
    const numA = /^\d+$/.test(idA) ? Number(idA) : undefined
    const numB = /^\d+$/.test(idB) ? Number(idB) : undefined
    if (numA !== undefined && numB !== undefined) return numA > numB ? 1 : -1
    if (numA !== undefined) return -1
    if (numB !== undefined) return 1
    return idA > idB ? 1 : -1
  }
  return 0
}

/** 仅 latest 严格大于 current 才提示升级；相等、落后或不可解析一律不打扰。 */
export function isCliUpdateAvailable(current: string | undefined, latest: string | undefined): boolean {
  if (!current || !latest) return false
  return compareCliVersions(latest, current) > 0
}
