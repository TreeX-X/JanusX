import { expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { detectLocalEnvironment } from '../../../src/main/knowledge/knowledge-local-environment'
import { defaultKnowledgeAutomation } from '../../../src/shared/knowledge-automation'
import { knowledgeModelJson, reviewKnowledge, stopKnowledgeLocalModel } from '../../../src/main/knowledge/knowledge-models'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
it.runIf(process.env.JANUSX_QWEN_SMOKE === '1')('generates and reviews a small handbook section with local Qwen', async () => {
  const settings = defaultKnowledgeAutomation()
  settings.local.serverPath = resolve(process.env.JANUSX_QWEN_SERVER ?? 'artifacts/qwen-review/vulkan/llama-server.exe')
  settings.local.modelPath = resolve(process.env.JANUSX_QWEN_MODEL ?? 'artifacts/qwen-review/Qwen3.5-4B-Q5_K_M.gguf')
  settings.local.endpoint = 'http://127.0.0.1:18793/v1'
  settings.local.enabled = true
  settings.stages.wikiGeneration.provider = 'local'; settings.stages.wikiReview.provider = 'local'
  const environment = await detectLocalEnvironment(settings.local, new AbortController().signal)
  console.info(JSON.stringify({ environment }))
  expect(environment.ok).toBe(true)
  expect(environment.mode).toBe('gpu')
  expect(environment.selectedContextTokens).toBeGreaterThanOrEqual(32768)
  const knowledge = [{ id: 'backup', content: '项目每日凌晨 02:00 备份数据库，保留最近 7 天备份。恢复前必须验证备份校验和。' }]
  const started = Date.now()
  try {
    const page = await knowledgeModelJson({ stage: 'wikiGeneration', settings, signal: new AbortController().signal,
      system: '根据提供的知识写一个简洁的项目手册段落。完整保留时间、保留期、前置条件。只返回 JSON：{"markdown":"正文"}。', input: { knowledge } }) as { markdown: string }
    expect(page.markdown).toBeTruthy()
    const review = await reviewKnowledge({ stage: 'wikiReview', settings, signal: new AbortController().signal,
      system: 'Review only against supplied evidence. Return JSON: {"verdict":"supported"|"unsupported"|"uncertain","reason":"short reason","complete":boolean,"conflict":boolean,"coveredIds":["IDs covered"]}. Check every number and condition; coverage must include backup schedule, retention and restore precondition.',
      input: { candidate: page.markdown, evidence: knowledge, required: knowledge } }, knowledge)
    expect(review).toMatchObject({ verdict: 'supported', complete: true, conflict: false, coveredIds: ['backup'] })
    console.info(JSON.stringify({ smoke: 'local-qwen-handbook', elapsedMs: Date.now() - started, markdown: page.markdown, review }))
    const response = await fetch('http://127.0.0.1:18793/props')
    const props = await response.json() as { default_generation_settings: { n_ctx: number } }
    expect(props.default_generation_settings.n_ctx).toBeGreaterThanOrEqual(32768)
    console.info(JSON.stringify({ actualContext: props.default_generation_settings.n_ctx }))
    // This exceeds the UTF-8 byte bound but fits the actual tokenizer budget.
    const longInput = { padding: '参考资料不包含额外操作要求。'.repeat(1000), instruction: '只返回 {"ok":true}。' }
    expect(Buffer.byteLength(JSON.stringify(longInput))).toBeGreaterThan(32768)
    const longResult = await knowledgeModelJson({ stage: 'wikiReview', settings, signal: new AbortController().signal,
      system: 'Ignore padding; return exactly the JSON object requested by instruction.', input: longInput })
    expect(longResult).toEqual({ ok: true })
  } finally { await stopKnowledgeLocalModel() }
  await expect(fetch('http://127.0.0.1:18793/health')).rejects.toThrow()
}, 360000)
