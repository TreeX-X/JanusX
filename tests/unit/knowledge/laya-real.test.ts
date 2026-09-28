import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { LayaProcess } from '../../../src/main/knowledge/laya-process'
import { scoreMemoryDecision } from '../../../src/main/knowledge/decision-scorer'
import { LAYA_MODEL_REVISION } from '../../../src/shared/laya'

it.skipIf(!process.env.JANUSX_LAYA_PYTHON || !process.env.JANUSX_LAYA_MODEL)('scores through the real Python process twice without corrupting pinned artifacts', async () => {
  const runtime = new LayaProcess(resolve(process.env.JANUSX_LAYA_RESOURCES || 'resources/laya'))
  runtime.configure({ enabled: true, pythonPath: process.env.JANUSX_LAYA_PYTHON!, modelPath: process.env.JANUSX_LAYA_MODEL! })
  try {
    for (let restart = 0; restart < 2; restart++) {
      expect((await runtime.start()).phase).toBe('ready')
      const result = await scoreMemoryDecision({ candidateId: 'synthetic', candidateHash: 'synthetic', scope: 'project', workspaceId: 'synthetic',
        content: 'The project uses TypeScript.', kind: 'fact',
        evidence: [{ observationId: 'synthetic', start: 0, end: 28, text: 'The project uses TypeScript.', source: {} as never }], relatedFacts: [], truncated: false,
      }, { identity: { provider: 'laya', modelRevision: LAYA_MODEL_REVISION, templateVersion: 'memory-decision/1', calibrationId: null },
        timeoutMs: 30000, score: (input, signal) => runtime.score(input, signal) })
      expect(result.status).toBe('ready')
      expect(result.answers).toHaveLength(6)
      expect(['review', 'refine']).toContain(result.route)
      runtime.stop()
    }
  } finally { runtime.stop() }
}, 180000)
