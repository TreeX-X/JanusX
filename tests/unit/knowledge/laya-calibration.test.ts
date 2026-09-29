import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calibrateDecisionAnswers, loadLayaCalibration } from '../../../src/main/knowledge/laya-calibration'
import { LAYA_MODEL_REVISION } from '../../../src/shared/laya'

describe('version-bound calibration artifacts', () => {
  let root: string
  const artifact = () => ({ schema: 'laya-calibration/1', modelRevision: LAYA_MODEL_REVISION, templateVersion: 'memory-decision/1',
    adapterSha256: createHash('sha256').update('fixture-adapter').digest('hex'), datasetSha256: 'a'.repeat(64),
    datasetKind: 'annotated', fittedOn: 'calibration', policySha256: 'b'.repeat(64),
    qualityGate: { status: 'passed', policyId: 'fixture-policy', failures: [] }, calibrationSampleIds: ['fixture-calibration'],
    temperatures: { retention: 2, kind: 2, support: 2, duplicate: 2, supersede: 2, conflict: 2 },
  })
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-calibration-'))
    await writeFile(join(root, 'sidecar.py'), 'fixture-adapter')
  })
  afterEach(async () => {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('janusx-calibration-')) throw new Error('Unexpected fixture path')
    await rm(root, { recursive: true, force: true })
  })
  it('loads exact file identity and applies normalized temperature without changing answer direction', async () => {
    const bytes = JSON.stringify(artifact())
    await writeFile(join(root, 'calibration.json'), bytes)
    const calibration = (await loadLayaCalibration(root, root))!
    expect(calibration.id).toBe(createHash('sha256').update(bytes).digest('hex'))
    const [answer] = calibrateDecisionAnswers([{ question: 'duplicate', answer: false, distribution: { true: .01, false: .99 }, answer_confidence: .99, noul: .01 }], calibration)
    expect(answer.answer).toBe(false)
    expect(answer.answer_confidence).toBeCloseTo(Math.sqrt(.99) / (Math.sqrt(.99) + Math.sqrt(.01)), 12)
    expect(answer.noul! + answer.answer_confidence).toBeCloseTo(1, 12)
  })
  it.each(['synthetic', 'revision', 'template', 'adapter', 'holdout', 'failed-policy', 'temperature'])('rejects %s artifacts', async defect => {
    const value = artifact()
    if (defect === 'synthetic') value.datasetKind = 'synthetic'
    if (defect === 'revision') value.modelRevision = 'wrong'
    if (defect === 'template') value.templateVersion = 'wrong'
    if (defect === 'adapter') value.adapterSha256 = 'c'.repeat(64)
    if (defect === 'holdout') value.fittedOn = 'holdout'
    if (defect === 'failed-policy') value.qualityGate.status = 'failed'
    if (defect === 'temperature') value.temperatures.support = 0
    await writeFile(join(root, 'calibration.json'), JSON.stringify(value))
    await expect(loadLayaCalibration(root, root)).rejects.toThrow()
  })
  it('allows absence, but surfaces corrupt artifacts', async () => {
    expect(await loadLayaCalibration(root, root)).toBeUndefined()
    await writeFile(join(root, 'calibration.json'), '{broken')
    await expect(loadLayaCalibration(root, root)).rejects.toThrow()
  })
})
