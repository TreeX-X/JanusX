import { expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { defaultKnowledgeAutomation } from '../../../src/shared/knowledge-automation'
import { knowledgeModelJson, reviewKnowledge, stopKnowledgeLocalModel } from '../../../src/main/knowledge/knowledge-models'
vi.mock('electron', () => ({ app: { getPath: () => '/unused' } }))
it.runIf(process.env.JANUSX_QWEN_SMOKE === '1')('generates and reviews a small handbook section with local Qwen', async () => {
  const settings = defaultKnowledgeAutomation()
  settings.local.serverPath = resolve('artifacts/qwen-review/vulkan/llama-server.exe')
  settings.local.modelPath = resolve('artifacts/qwen-review/Qwen3.5-4B-Q5_K_M.gguf')
  settings.local.endpoint = 'http://127.0.0.1:18793/v1'
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
  } finally { stopKnowledgeLocalModel() }
}, 360000)
