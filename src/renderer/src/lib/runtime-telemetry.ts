import type { TerminalPreset } from '@/types'
import { matchAiModel } from '@janusx/llm-core/model-registry'

export interface RuntimeTelemetryPatch {
  detectedModel?: string
  contextTokens?: number
  contextWindowTokens?: number
  inputTokens?: number
  outputTokens?: number
}

const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
const MODEL_FIELD_PATTERN =
  /(?:^|[\s{,])(?:model|model_id|modelId|model_name|modelName|selected model|using model)\s*[:=]\s*["'`]?([a-z0-9][a-z0-9_.:/+-]{1,80})/i
const MODEL_FLAG_PATTERN = /(?:^|\s)(?:--model|-m|\/model)\s+["'`]?([a-z0-9][a-z0-9_.:/+-]{1,80})/i

const MODEL_PATTERNS: RegExp[] = [
  /\bclaude-(?:opus|sonnet|haiku|3(?:\.\d)?)[a-z0-9_.-]*\b/i,
  /\b(?:opus|sonnet|haiku)\s*(?:3(?:\.\d)?|4(?:\.\d)?)?(?:[-\s][a-z0-9_.-]+)?\b/i,
  /\b(?:gpt|chatgpt)-(?:5|4(?:o|\.\d)?|oss)[a-z0-9_.-]*\b/i,
  /\bo[134](?:-[a-z0-9_.]+)*\b/i,
  /\bgemini-[a-z0-9_.-]+\b/i,
  /\b(?:deepseek|qwen|kimi|llama|mistral|mixtral|grok|glm|yi)[a-z0-9_.-]*\b/i,
  /\b(?:codex|gpt-5-codex)[a-z0-9_.-]*\b/i,
]

export function detectModelFromText(text: string): string | undefined {
  const normalized = stripAnsi(text)
  const explicit = normalized.match(MODEL_FIELD_PATTERN) ?? normalized.match(MODEL_FLAG_PATTERN)
  if (explicit?.[1]) return normalizeModelName(explicit[1])

  for (const pattern of MODEL_PATTERNS) {
    const match = normalized.match(pattern)
    if (match?.[0]) return normalizeModelName(match[0])
  }
  return undefined
}

export function getEstimatedContextWindow(preset: TerminalPreset, model?: string): number | undefined {
  const registryWindow = getRegistryContextWindow(model)
  if (registryWindow !== undefined) return registryWindow

  const normalized = model?.toLowerCase() ?? ''

  if (/\[1m\]|\b1m\b/.test(normalized)) return 1_000_000
  if (normalized.includes('gemini')) return 1_000_000
  if (normalized.includes('claude') || normalized.includes('sonnet') || normalized.includes('opus') || normalized.includes('haiku')) {
    return 200_000
  }
  if (normalized.includes('gpt-5')) return 400_000
  if (normalized.includes('o3') || normalized.includes('o4')) return 200_000
  if (normalized.includes('gpt-4.1') || normalized.includes('gpt-4o')) return 128_000
  if (normalized.includes('qwen') || normalized.includes('deepseek') || normalized.includes('kimi') || normalized.includes('llama')) return 128_000

  switch (preset) {
    case 'claude':
      return 200_000
    case 'codex':
      return 200_000
    case 'opencode':
      return 128_000
    case 'shell':
      return undefined
  }
}

export function getRegistryContextWindow(model?: string): number | undefined {
  if (!model) return undefined

  const result = matchAiModel(model)
  if (
    result.match &&
    result.confidence !== 'low' &&
    result.confidence !== 'none'
  ) {
    return result.match.effectiveContextWindow
  }

  return undefined
}

export function stabilizeContextTokens(
  current: number | undefined,
  next: number | undefined
): number | undefined {
  if (next === undefined) return undefined
  if (current === undefined || current <= 0) return next
  if (next >= current) return next

  return current
}

export function extractRuntimeTelemetry(text: string): RuntimeTelemetryPatch {
  const normalized = stripAnsi(text)
  const fromJson = extractStructuredTelemetry(normalized)
  const detectedModel = fromJson.detectedModel ?? detectModelFromText(normalized)
  const explicitContext = extractExplicitContext(normalized)

  return {
    detectedModel,
    inputTokens: fromJson.inputTokens,
    outputTokens: fromJson.outputTokens,
    contextTokens: fromJson.contextTokens ?? explicitContext.contextTokens,
    contextWindowTokens: fromJson.contextWindowTokens ?? explicitContext.contextWindowTokens,
  }
}

function extractStructuredTelemetry(text: string): RuntimeTelemetryPatch {
  const patch: RuntimeTelemetryPatch = {}

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line.startsWith('{') || !line.endsWith('}')) continue

    try {
      mergeTelemetryPatch(patch, extractTelemetryFromJson(JSON.parse(line) as Record<string, unknown>))
    } catch {
      // Ignore ordinary terminal output that only looks like partial JSON.
    }
  }

  return patch
}

function extractTelemetryFromJson(value: Record<string, unknown>): RuntimeTelemetryPatch {
  const patch: RuntimeTelemetryPatch = {}
  const payload = asRecord(value.payload)
  const info = asRecord(payload?.info)
  const message = asRecord(value.message)
  const usage = asRecord(value.usage) ?? asRecord(message?.usage) ?? asRecord(payload?.usage)

  const model =
    readString(value.model) ??
    readString(message?.model) ??
    readString(payload?.model) ??
    readString(info?.model)
  if (model) patch.detectedModel = normalizeModelName(model)

  if (payload?.type === 'token_count' && info) {
    const lastUsage = asRecord(info.last_token_usage) ?? asRecord(info.lastTokenUsage)
    const totalUsage = asRecord(info.total_token_usage) ?? asRecord(info.totalTokenUsage)
    patch.contextTokens = readPositiveNumber(lastUsage?.total_tokens ?? lastUsage?.totalTokens)
    patch.contextWindowTokens = readPositiveNumber(info.model_context_window ?? info.modelContextWindow)
    const inputTokens = readPositiveNumber(totalUsage?.input_tokens ?? totalUsage?.inputTokens)
    const cachedInputTokens = readPositiveNumber(totalUsage?.cached_input_tokens ?? totalUsage?.cachedInputTokens) ?? 0
    if (inputTokens !== undefined) patch.inputTokens = Math.max(0, inputTokens - cachedInputTokens)
    patch.outputTokens = readPositiveNumber(totalUsage?.output_tokens ?? totalUsage?.outputTokens)
  }

  if (usage) {
    const inputTokens = readPositiveNumber(usage.input_tokens ?? usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens)
    const cacheReadTokens =
      readPositiveNumber(usage.cache_read_input_tokens ?? usage.cache_read_tokens ?? usage.cacheReadTokens) ?? 0
    const cacheCreationTokens =
      readPositiveNumber(usage.cache_creation_input_tokens ?? usage.cache_creation_tokens ?? usage.cacheCreationTokens) ?? 0
    const outputTokens =
      readPositiveNumber(usage.output_tokens ?? usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens)
    const contextTokens = (inputTokens ?? 0) + cacheReadTokens + cacheCreationTokens

    if (inputTokens !== undefined) patch.inputTokens = inputTokens
    if (outputTokens !== undefined) patch.outputTokens = outputTokens
    if (contextTokens > 0) patch.contextTokens = contextTokens
  }

  return patch
}

function extractExplicitContext(text: string): Pick<RuntimeTelemetryPatch, 'contextTokens' | 'contextWindowTokens'> {
  const normalized = text.replace(/,/g, '')
  const fraction = normalized.match(
    /\b(?:ctx|context|tokens?)\b[^\d]{0,24}(\d+(?:\.\d+)?\s*[kKmM]?)[^\d]{1,12}(?:\/|of)[^\d]{0,8}(\d+(?:\.\d+)?\s*[kKmM]?)/i
  )

  if (fraction?.[1] && fraction[2]) {
    return {
      contextTokens: parseTokenAmount(fraction[1]),
      contextWindowTokens: parseTokenAmount(fraction[2]),
    }
  }

  const usedOnly = normalized.match(/\b(?:ctx|context)\b[^\d]{0,24}(\d+(?:\.\d+)?\s*[kKmM]?)\s*(?:tokens?)?\b/i)
  return {
    contextTokens: usedOnly?.[1] ? parseTokenAmount(usedOnly[1]) : undefined,
  }
}

function mergeTelemetryPatch(target: RuntimeTelemetryPatch, source: RuntimeTelemetryPatch): void {
  if (source.detectedModel) target.detectedModel = source.detectedModel
  if (source.contextTokens !== undefined) target.contextTokens = source.contextTokens
  if (source.contextWindowTokens !== undefined) target.contextWindowTokens = source.contextWindowTokens
  if (source.inputTokens !== undefined) target.inputTokens = source.inputTokens
  if (source.outputTokens !== undefined) target.outputTokens = source.outputTokens
}

function parseTokenAmount(raw: string): number | undefined {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)\s*([kKmM])?$/)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return undefined
  const suffix = match[2]?.toLowerCase()
  if (suffix === 'm') return Math.round(value * 1_000_000)
  if (suffix === 'k') return Math.round(value * 1_000)
  return Math.round(value)
}

function readPositiveNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined
  return Math.round(numeric)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, ' ')
}

function normalizeModelName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bsonnet\b/i, 'Sonnet')
    .replace(/\bopus\b/i, 'Opus')
    .replace(/\bhaiku\b/i, 'Haiku')
    .replace(/\bclaude\b/i, 'Claude')
    .replace(/\bgpt\b/i, 'GPT')
    .replace(/\bcodex\b/i, 'Codex')
    .replace(/\bgemini\b/i, 'Gemini')
    .replace(/\bdeepseek\b/i, 'DeepSeek')
    .replace(/\bqwen\b/i, 'Qwen')
    .replace(/\bkimi\b/i, 'Kimi')
    .replace(/\bllama\b/i, 'Llama')
}
