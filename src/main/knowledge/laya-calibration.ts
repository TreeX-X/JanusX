// Note: only pinned, independently evaluated calibration artifacts affect advice — see .agents/notes/knowledge/requirements/unified-memory-laya-primary.md
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { LAYA_MODEL_REVISION } from '../../shared/laya'
import type { MemoryDecisionAnswer } from '../../shared/memory-decision'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const temperature = z.number().finite().min(0.05).max(20)
const Artifact = z.object({
  schema: z.literal('laya-calibration/1'), modelRevision: z.literal(LAYA_MODEL_REVISION),
  templateVersion: z.literal('memory-decision/1'), adapterSha256: hash, datasetSha256: hash,
  datasetKind: z.literal('annotated'), fittedOn: z.literal('calibration'), policySha256: hash,
  qualityGate: z.object({ status: z.literal('passed'), policyId: z.string().min(1), failures: z.array(z.string()).length(0) }),
  temperatures: z.object({ retention: temperature, kind: temperature, support: temperature, duplicate: temperature, supersede: temperature, conflict: temperature }).strict(),
  calibrationSampleIds: z.array(z.string().min(1)).min(1),
})
export type LayaCalibration = z.infer<typeof Artifact> & { id: string }

export async function loadLayaCalibration(modelPath: string, resourcePath: string): Promise<LayaCalibration | undefined> {
  let bytes: Buffer
  try { bytes = await readFile(join(modelPath, 'calibration.json')) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  if (bytes.length > 1048576) throw new Error('Calibration artifact exceeds size limit')
  const artifact = Artifact.parse(JSON.parse(bytes.toString('utf8')))
  if (artifact.adapterSha256 !== createHash('sha256').update(await readFile(join(resourcePath, 'sidecar.py'))).digest('hex')) throw new Error('Calibration adapter does not match')
  return { ...artifact, id: createHash('sha256').update(bytes).digest('hex') }
}

export function calibrateDecisionAnswers(answers: MemoryDecisionAnswer[], calibration: LayaCalibration): MemoryDecisionAnswer[] {
  return answers.map(answer => {
    const entries = Object.entries(answer.distribution)
    const logits = entries.map(([, probability]) => Math.log(Math.max(1e-12, probability)) / calibration.temperatures[answer.question])
    const max = Math.max(...logits)
    const weights = logits.map(value => Math.exp(value - max))
    const sum = weights.reduce((a, b) => a + b, 0)
    const distribution = Object.fromEntries(entries.map(([key], i) => [key, weights[i]! / sum]))
    return { ...answer, distribution, answer_confidence: distribution[String(answer.answer)]!,
      ...(answer.question !== 'kind' ? { noul: distribution.true! } : {}) }
  })
}
