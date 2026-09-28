import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { LayaProcess } from '../../../src/main/knowledge/laya-process'
import { LAYA_MODEL_REVISION, LAYA_SDK_VERSION } from '../../../src/shared/laya'
import { scoreMemoryDecision, type MemoryDecisionInput } from '../../../src/main/knowledge/decision-scorer'

const processes: LayaProcess[] = []
const input: MemoryDecisionInput = { candidateId: 'c', candidateHash: 'h', scope: 'project', workspaceId: 'w', content: 'Use TypeScript',
  evidence: [{ observationId: 'o', start: 0, end: 14, text: 'Use TypeScript', source: {} as never }], relatedFacts: [], truncated: false }
function runtime(mode = 'valid', idleMs = 10000) {
  const source = String.raw`const mode=${JSON.stringify(mode)};const send=x=>process.stdout.write(JSON.stringify(x)+'\n');
    if(mode==='invalid')process.stdout.write('not json\n');
    else if(mode==='overflow')process.stdout.write('x'.repeat(300000));
    else if(mode!=='hang')send({protocol:1,status:'ready',revision:mode==='wrong'?'wrong':${JSON.stringify(LAYA_MODEL_REVISION)},sdk:${JSON.stringify(LAYA_SDK_VERSION)},warmupMs:10});
    require('readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);
      if(mode==='slow')return;
      if(mode==='exit')return process.exit(2);
      send({id:r.id,elapsedMs:5,result:{status:'ready',answers:['retention','kind','support','duplicate','supersede','conflict'].map(question=>{
        const answer=question==='kind'?'fact':['retention','support'].includes(question);
        const distribution=question==='kind'?{fact:1,decision:0,preference:0,procedure:0}:{true:answer?1:0,false:answer?0:1};
        return {question,answer,distribution,answer_confidence:1,...(question==='kind'?{}:{noul:distribution.true})};})}});});`
  const service = new LayaProcess('/resources', () => spawn(process.execPath, ['-e', source], { stdio: 'pipe', windowsHide: true }),
    { startupMs: 1500, downloadMs: 1500, idleMs })
  service.configure({ enabled: true, pythonPath: process.execPath, modelPath: tmpdir() })
  processes.push(service)
  return service
}
afterEach(() => { for (const service of processes.splice(0)) service.stop() })
describe('managed Laya process', () => {
  it('requires verified warmup, scores through the host gate and unloads', async () => {
    const service = runtime()
    expect((await service.start()).phase).toBe('ready')
    const result = await scoreMemoryDecision(input, { identity: { provider: 'laya', modelRevision: LAYA_MODEL_REVISION, templateVersion: 'memory-decision/1', calibrationId: null }, score: (value, signal) => service.score(value, signal) })
    expect(result).toMatchObject({ status: 'ready', route: 'review' })
    expect(service.status().lastInferenceMs).toBe(5)
    service.stop()
    expect(service.status().phase).toBe('stopped')
  })
  it.each(['invalid', 'wrong', 'overflow', 'hang'])('rejects %s startup and exposes failure', async mode => {
    expect((await runtime(mode).start()).phase).toBe('failed')
  })
  it('coalesces starts and cancels an in-flight request on abort', async () => {
    const service = runtime('slow')
    const a = service.start(); expect(service.start()).toBe(a); await a
    const abort = new AbortController()
    const pending = service.score(input, abort.signal)
    expect(await service.score(input, new AbortController().signal)).toMatchObject({ status: 'unavailable', reason: 'busy' })
    abort.abort()
    expect(await pending).toMatchObject({ status: 'unavailable' })
    expect(service.status().phase).toBe('failed')
  })
  it('settles pending requests on exit and on settings disable', async () => {
    const service = runtime('exit'); await service.start()
    expect(await service.score(input, new AbortController().signal)).toMatchObject({ status: 'unavailable' })
    const slow = runtime('slow'); await slow.start()
    const pending = slow.score(input, new AbortController().signal)
    slow.configure({ enabled: false, pythonPath: '', modelPath: '' })
    expect(await pending).toMatchObject({ status: 'unavailable' })
    expect(slow.status().phase).toBe('disabled')
  })
  it('stops during startup and releases an idle model', async () => {
    const hanging = runtime('hang'); const starting = hanging.start(); hanging.stop()
    expect((await starting).phase).toBe('stopped')
    const service = runtime('valid', 30); await service.start()
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(service.status()).toMatchObject({ phase: 'stopped', reason: 'idle' })
  })
})
