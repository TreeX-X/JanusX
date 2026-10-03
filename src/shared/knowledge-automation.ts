export const KNOWLEDGE_STAGES = ['extraction', 'entryReview', 'wikiGeneration', 'wikiReview'] as const
export type KnowledgeStage = typeof KNOWLEDGE_STAGES[number]
export type KnowledgeProvider = 'off' | 'local' | 'external' | 'jev'
export interface KnowledgeStageModel {
  provider: KnowledgeProvider
  providerId: string
  model: string
  thinking: boolean
}
export interface KnowledgeAutomationSettings {
  enabled: boolean
  enabledSince?: string
  stages: Record<KnowledgeStage, KnowledgeStageModel>
  local: KnowledgeLocalSettings
  jev: { endpoint: string; model: string }
}
export interface KnowledgeLocalSettings {
  enabled: boolean
  endpoint: string
  serverPath: string
  modelPath: string
  /** Zero selects a fresh resource-based recommendation at each cold start. */
  contextTokens: number
}
export interface KnowledgeLocalEnvironment {
  ok: boolean
  reason?: string
  mode: 'gpu' | 'cpu' | 'service'
  device?: string
  deviceName?: string
  availableMemoryMiB: number
  availableVramMiB?: number
  modelContextTokens: number
  recommendedContextTokens: number
  selectedContextTokens: number
  supportedContextTokens: number[]
}
export const LOCAL_CONTEXT_OPTIONS = [32768, 65536, 131072, 262144] as const
export function defaultKnowledgeAutomation(): KnowledgeAutomationSettings {
  const model = (thinking = false): KnowledgeStageModel => ({ provider: 'off', providerId: '', model: 'Qwen3.5-4B', thinking })
  return { enabled: false, stages: {
    extraction: { ...model(), provider: 'off' }, entryReview: model(), wikiGeneration: model(true), wikiReview: model(),
  }, local: { enabled: false, contextTokens: 0, endpoint: 'http://127.0.0.1:18791/v1', serverPath: '', modelPath: '' },
  jev: { endpoint: 'https://api.typesafe.ai/v1/systemone', model: 'jev-1.13.0' } }
}
export function normalizeKnowledgeAutomation(value: unknown): KnowledgeAutomationSettings {
  const defaults = defaultKnowledgeAutomation()
  if (!value || typeof value !== 'object') return defaults
  const raw = value as Partial<KnowledgeAutomationSettings>
  const text = (value: unknown, fallback = '') => typeof value === 'string' ? value.trim() : fallback
  const stages = { ...defaults.stages }
  for (const stage of KNOWLEDGE_STAGES) {
    const config = raw.stages?.[stage]
    if (!config) continue
    const provider = config.provider === 'local' && raw.local?.enabled !== true ? 'off'
      : ['off', 'local', 'external', 'jev'].includes(config.provider) ? config.provider : 'off'
    stages[stage] = { provider: provider === 'jev' && (stage === 'extraction' || stage === 'wikiGeneration') ? 'off' : provider,
      providerId: text(config.providerId), model: text(config.model), thinking: provider === 'local' && config.thinking === true }
  }
  return { enabled: raw.enabled === true, stages,
    ...(typeof raw.enabledSince === 'string' && Number.isFinite(Date.parse(raw.enabledSince)) ? { enabledSince: raw.enabledSince } : {}),
    local: { enabled: raw.local?.enabled === true, contextTokens: Number.isSafeInteger(raw.local?.contextTokens) && Number(raw.local?.contextTokens) > 0 ? Number(raw.local?.contextTokens) : 0,
      endpoint: text(raw.local?.endpoint, defaults.local.endpoint), serverPath: text(raw.local?.serverPath), modelPath: text(raw.local?.modelPath) },
    jev: { endpoint: text(raw.jev?.endpoint, defaults.jev.endpoint), model: text(raw.jev?.model, defaults.jev.model) } }
}

export type AutomationTaskStatus = 'pending' | 'running' | 'succeeded' | 'needs-review' | 'failed' | 'cancelled'
export interface KnowledgeAutomationTask {
  id: string
  stage: KnowledgeStage
  workspaceId: string
  subject: string
  inputHash: string
  dependencyHash?: string
  configHash: string
  status: AutomationTaskStatus
  attempts: number
  nextRunAt: number
  createdAt: string
  updatedAt: string
  reason?: string
  model: KnowledgeStageModel
}
export interface KnowledgeAutomationStatus {
  running: boolean
  enabled: boolean
  tasks: KnowledgeAutomationTask[]
  total: number
  counts: Record<AutomationTaskStatus, number>
}

export interface KnowledgeModelReview {
  verdict: 'supported' | 'unsupported' | 'uncertain'
  reason: string
  complete: boolean
  conflict: boolean
  coveredIds: string[]
}
