// Synthetic parser benchmark; never reads the user's native session directories.
import { build } from 'esbuild'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

const directory = resolve('artifacts/performance-current')
const label = process.argv[2] ?? 'candidate'
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Use a simple label')
const bundle = join(directory, `${label}.mjs`)
const home = join(directory, 'synthetic-home')

if (process.argv.includes('--child')) {
  const { scanNativeSessionCorpus } = await import(pathToFileURL(bundle).href)
  const hash = createHash('sha256')
  let records = 0
  const ledger = {
    sessionState: () => undefined,
    sourceCheckpoint: () => undefined,
    record: (observation) => { records++; hash.update(JSON.stringify(observation)) },
  }
  global.gc()
  const initial = process.memoryUsage()
  let peak = initial
  const sample = () => {
    const current = process.memoryUsage()
    peak = Object.fromEntries(Object.keys(current).map(key => [key, Math.max(peak[key], current[key])]))
  }
  const lag = monitorEventLoopDelay({ resolution: 1 })
  lag.enable()
  const timer = setInterval(sample, 2)
  await new Promise(resolve => setTimeout(resolve, 10))
  const started = performance.now()
  const summary = await scanNativeSessionCorpus({ ledger, now: 1791957600000 })
  const durationMs = performance.now() - started
  sample()
  await new Promise(resolve => setTimeout(resolve, 10))
  clearInterval(timer)
  lag.disable()
  console.log(JSON.stringify({ durationMs, maxLagMs: lag.max / 1e6,
    sampledHeapPeakMiB: peak.heapUsed / 2 ** 20, sampledRssPeakMiB: peak.rss / 2 ** 20,
    processMaxRssMiB: process.resourceUsage().maxRSS / 1024,
    initialHeapMiB: initial.heapUsed / 2 ** 20, records, summary, digest: hash.digest('hex') }))
} else {
  await mkdir(directory, { recursive: true })
  const sessionDir = join(home, '.codex', 'sessions')
  await mkdir(sessionDir, { recursive: true })
  const id = 'aaaaaaaa-1111-4111-8111-111111111111'
  const lines = [JSON.stringify({ type: 'session_meta', payload: { id, cwd: 'C:/synthetic' } }),
    JSON.stringify({ type: 'turn_context', payload: { model: 'benchmark-model' } })]
  for (let i = 1; i <= 8000; i++) {
    lines.push(JSON.stringify({ type: 'response_item', payload: { text: '合成文本x'.repeat(550) } }))
    if (i % 40 === 0) lines.push(JSON.stringify({ type: 'event_msg', ordinal: i,
      timestamp: '2026-10-14T06:00:00Z', payload: { type: 'token_count', info: {
        total_token_usage: { input_tokens: i, cached_input_tokens: 0, output_tokens: i, total_tokens: i * 2 },
      } } }))
  }
  const fixture = lines.join('\n') + '\n'
  await writeFile(join(sessionDir, `rollout-benchmark-${id}.jsonl`), fixture)
  // Snapshot the implementation before measuring: baseline remains rerunnable after edits.
  if (!process.argv.includes('--reuse')) await build({ entryPoints: ['src/main/runtime-telemetry/corpus-scan.ts'], outfile: bundle,
    bundle: true, platform: 'node', format: 'esm', packages: 'external',
    plugins: [{ name: 'isolated-home', setup(build) {
      build.onResolve({ filter: /^(node:)?os$/ }, args => args.namespace === 'fixture'
        ? { path: 'node:os', external: true } : { path: 'os', namespace: 'fixture' })
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents:
        `import os from 'node:os'; export const homedir = () => ${JSON.stringify(home)}; export default {...os, homedir};` }))
    } }],
  })
  const runs = []
  for (let i = 0; i < 5; i++) {
    const child = spawnSync(process.execPath, ['--expose-gc', import.meta.filename, label, '--child'], {
      encoding: 'utf8', env: { ...process.env, CODEX_HOME: join(home, '.codex'),
        XDG_DATA_HOME: join(home, '.local/share'), OPENCODE_DB: join(home, 'unused-opencode.db') },
    })
    if (child.status !== 0) throw Error(child.stderr || child.stdout)
    runs.push(JSON.parse(child.stdout.trim()))
  }
  const result = { label, node: process.version, bundleSha256: createHash('sha256').update(await readFile(bundle)).digest('hex'), fixtureBytes: Buffer.byteLength(fixture),
    fixtureSha256: createHash('sha256').update(fixture).digest('hex'), runs,
    median: Object.fromEntries(['durationMs', 'maxLagMs', 'sampledHeapPeakMiB', 'sampledRssPeakMiB', 'processMaxRssMiB']
      .map(key => [key, runs.map(run => run[key]).sort((a, b) => a - b)[2]])) }
  await writeFile(join(directory, `${label}.json`), JSON.stringify(result, null, 2))
  if (label !== 'baseline') {
    const baseline = JSON.parse(await readFile(join(directory, 'baseline.json'), 'utf8'))
    if (baseline.fixtureSha256 !== result.fixtureSha256 || runs.some(run => run.digest !== baseline.runs[0].digest)) {
      throw Error('Functional output or fixture changed; performance comparison is invalid')
    }
  }
  console.log(JSON.stringify({ label, fixtureBytes: result.fixtureBytes, median: result.median }, null, 2))
}
