// Note: configuration tests use synthetic data without publishing knowledge — see .agents/notes/2026-10-03-knowledge-accumulate-review-wiki-rereview--3944b368.md
import { z } from 'zod'
import { defaultKnowledgeAutomation, KNOWLEDGE_STAGES, type KnowledgeConfigurationTestResult,
  type KnowledgeConfigurationTestReason } from '../../shared/knowledge-automation'
import { configService } from '../config/service'
import { getJevKey } from './knowledge-credentials'
import { knowledgeModelEndpoint, knowledgeModelJson, reviewKnowledge } from './knowledge-models'

const inputSchema = z.object({
  stage: z.enum(KNOWLEDGE_STAGES),
  model: z.object({ provider: z.enum(['off', 'local', 'external', 'jev']), providerId: z.string().trim().max(512),
    model: z.string().trim().max(512), thinking: z.boolean() }).strict(),
  jevEndpoint: z.string().trim().max(2048), jevKey: z.string().trim().max(8192).optional(),
}).strict()
const incomplete = (reason: KnowledgeConfigurationTestReason): KnowledgeConfigurationTestResult => ({ status: 'incomplete', reason })

function failure(error: unknown, timedOut: boolean): KnowledgeConfigurationTestReason {
  if (timedOut) return 'timeout'
  const message = error instanceof Error ? error.message : ''
  if (/^model-http-(401|403)$/.test(message)) return 'auth-failed'
  if (message === 'model-http-429') return 'rate-limited'
  if (message === 'model-http-404') return 'model-or-endpoint-not-found'
  if (/timeout/.test(message)) return 'timeout'
  if (message === 'local-model-busy') return 'busy'
  if (message === 'local-model-disabled') return 'local-disabled'
  if (message.startsWith('local-') || message.startsWith('invalid-local')) return 'local-unavailable'
  if (message === 'invalid-model-endpoint') return 'endpoint-invalid'
  if (message.startsWith('invalid-') || message === 'incomplete-model-output' || error instanceof z.ZodError) return 'invalid-response'
  if (message.startsWith('credential-')) return 'credential-unavailable'
  return 'unavailable'
}

export async function testKnowledgeConfiguration(input: unknown): Promise<KnowledgeConfigurationTestResult> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return incomplete('provider-unsupported')
  if (!(await configService.getExperimentalFeatures()).knowledge) return incomplete('knowledge-disabled')
  const { stage, model, jevEndpoint } = parsed.data
  if (model.provider === 'off') return { status: 'skipped', reason: stage === 'extraction' ? 'rules-only' : 'manual' }
  if (model.provider === 'external' && !model.providerId) return incomplete('provider-missing')
  if (!model.model) return incomplete('model-missing')
  if (model.provider === 'jev' && (stage === 'extraction' || stage === 'wikiGeneration')) return incomplete('provider-unsupported')
  const settings = defaultKnowledgeAutomation()
  settings.stages[stage] = model
  let jevKey: string | undefined
  let timeout: AbortSignal | undefined
  const started = performance.now()
  try {
    if (model.provider === 'jev') {
      if (!jevEndpoint) return incomplete('endpoint-missing')
      try { knowledgeModelEndpoint(jevEndpoint, false) } catch { return incomplete('endpoint-invalid') }
      jevKey = parsed.data.jevKey ?? await getJevKey() ?? undefined
      if (!jevKey) return incomplete('key-missing')
      settings.jev = { endpoint: jevEndpoint, model: model.model }
    } else if (model.provider === 'external') {
      const { llmService } = await import('../llm/LlmService')
      const provider = await llmService.getProviderSettings('janus', model.providerId)
      if (!provider || provider.enabled === false) return incomplete('provider-unavailable')
      if (provider.authType === 'api-key' || provider.authType === 'anthropic') {
        if (!provider.apiKey?.trim()) return incomplete('key-missing')
      }
      const { validateSettings } = await import('@janusx/llm-core')
      if (!validateSettings({ ...provider, modelId: model.model }).valid) return incomplete('provider-incomplete')
    } else {
      // Only host-persisted, independently enabled paths may start a local process.
      const saved = await configService.getKnowledgeSettings()
      if (!saved.automation?.local.enabled) return incomplete('local-disabled')
      settings.local = saved.automation.local
    }
    timeout = AbortSignal.timeout(model.provider === 'local' ? 120000 : 30000)
    const request = { stage, settings, signal: timeout, jevKey, maxTokens: model.thinking ? 2048 : 512,
      system: 'Return only JSON: {"ok":true}. This is a connectivity test.', input: { test: 'connectivity' } }
    if (stage === 'entryReview' || stage === 'wikiReview') {
      const evidence = 'The sample project runs a backup every night.'
      await reviewKnowledge({ ...request,
        system: 'Review the candidate against the supplied evidence. Return only JSON: {"verdict":"supported","reason":"Supported by evidence","complete":true,"conflict":false,"coveredIds":["sample"]}.',
        input: { candidate: evidence, sources: [{ id: 'sample', content: evidence }], currentKnowledge: [] },
      }, [{ id: 'sample', content: evidence }])
    } else {
      z.object({ ok: z.literal(true) }).strict().parse(await knowledgeModelJson(request))
    }
    return { status: 'passed', durationMs: Math.round(performance.now() - started) }
  } catch (error) {
    // Only a closed reason vocabulary crosses IPC; provider errors may contain credentials.
    return { status: 'failed', reason: failure(error, timeout?.aborted === true), durationMs: Math.round(performance.now() - started) }
  }
}
