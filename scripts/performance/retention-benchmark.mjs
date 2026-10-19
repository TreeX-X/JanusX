// Isolated Chat recovery / editor close-cache comparison. Freeze baseline before edits.
import { build } from 'esbuild'
import { mkdir, writeFile, readFile, open } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { setImmediate as yieldToEventLoop } from 'node:timers/promises'

const directory = resolve('artifacts/performance-retention')
const label = process.argv[2] ?? 'candidate'
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Use a simple label')
const journalPath = join(directory, 'synthetic-chat.jsonl')
const legacyPath = join(directory, 'absent-legacy.json')
const bundlePath = kind => join(directory, `${label}-${kind}.mjs`)
const digest = value => createHash('sha256').update(value).digest('hex')

function snapshot(revision) {
  return { version: 1, activeConversationId: 'chat', conversations: [{
    id: 'chat', title: `revision-${revision}`, createdAt: 1, updatedAt: revision + 1,
    messages: Array.from({ length: 40 }, (_, index) => ({
      id: `m-${index}`, role: index % 2 ? 'assistant' : 'user', timestamp: index,
      content: `中文-${revision}-${index}:` + 'synthetic-history-'.repeat(480),
    })), attachedWorkspaceIds: [], toolTraces: [],
  }] }
}

if (process.argv.includes('--child')) {
  const kind = process.argv[process.argv.indexOf('--child') + 1]
  const module = await import(pathToFileURL(bundlePath(kind)).href)
  const hash = createHash('sha256')
  let reads = 0
  if (kind === 'editor') {
    // Unique, materialized strings; no fixture map accidentally retaining the payloads.
    const payload = path => Buffer.alloc(512 * 1024, path.charCodeAt(path.length - 5) || 65).toString('latin1')
    globalThis.window = { electron: { file: {
      read: async path => { reads++; return { content: payload(path), size: 512 * 1024, mtime: 1 } },
      readBinary: async path => { reads++; return { base64: payload(path), mimeType: 'image/png', size: 384 * 1024, mtime: 1 } },
    } } }
  }
  global.gc()
  const initial = process.memoryUsage()
  let peak = initial.heapUsed
  const sample = () => { peak = Math.max(peak, process.memoryUsage().heapUsed) }
  const timer = setInterval(sample, 2)
  const lag = monitorEventLoopDelay({ resolution: 1 })
  lag.enable()
  await new Promise(resolve => setTimeout(resolve, 10))
  const started = performance.now()
  const retainedByCycleMiB = []
  const openDurations = []
  let warmReopenP95Ms
  if (kind === 'chat') {
    const result = await new module.JanusChatStore({ journalPath, legacyPath }).load()
    hash.update(JSON.stringify(result))
  } else {
    const editor = module.useEditorStore.getState()
    for (let cycle = 0; cycle < 3; cycle++) {
      for (let i = 0; i < 80; i++) {
        const path = `C:/synthetic/${cycle}-${i}.${i % 4 === 0 ? 'png' : 'ts'}`
        const openingAt = performance.now()
        await editor.openFile(path, 'C:/synthetic')
        openDurations.push(performance.now() - openingAt)
        const file = module.useEditorStore.getState().openFiles[0]
        if (file.isLoading || file.error) throw Error('Editor failed to load')
        hash.update(file.content || file.base64)
        editor.closeFile(file.id)
        sample()
        if (i % 8 === 7) await yieldToEventLoop()
      }
      global.gc()
      retainedByCycleMiB.push(process.memoryUsage().heapUsed / 2 ** 20)
    }
    const warmDurations = []
    for (let i = 0; i < 200; i++) {
      const at = performance.now()
      await editor.openFile('C:/synthetic/2-79.ts', 'C:/synthetic')
      editor.closeFile(module.useEditorStore.getState().activeFileId)
      warmDurations.push(performance.now() - at)
    }
    warmReopenP95Ms = warmDurations.sort((a, b) => a - b)[189]
  }
  const durationMs = performance.now() - started
  sample()
  await new Promise(resolve => setTimeout(resolve, 10))
  clearInterval(timer)
  lag.disable()
  global.gc()
  console.log(JSON.stringify({ durationMs, maxLagMs: lag.max / 1e6,
    initialHeapMiB: initial.heapUsed / 2 ** 20, sampledHeapPeakMiB: peak / 2 ** 20,
    retainedHeapMiB: process.memoryUsage().heapUsed / 2 ** 20, retainedByCycleMiB,
    openP95Ms: openDurations.sort((a, b) => a - b)[Math.ceil(openDurations.length * 0.95) - 1], warmReopenP95Ms,
    processMaxRssMiB: process.resourceUsage().maxRSS / 1024, reads, digest: hash.digest('hex') }))
} else {
  await mkdir(directory, { recursive: true })
  const handle = await open(journalPath, 'w')
  try {
    for (let revision = 0; revision < 128; revision++) {
      await handle.writeFile(JSON.stringify({ type: 'snapshot', version: 1, id: `r-${revision}`,
        parentId: revision ? `r-${revision - 1}` : null, createdAt: revision,
        snapshot: snapshot(revision) }) + '\n')
    }
  } finally { await handle.close() }
  const fixture = await readFile(journalPath)
  const result = { label, node: process.version, fixtureBytes: fixture.length,
    fixtureSha256: digest(fixture), cases: {} }
  for (const kind of ['chat', 'editor']) {
    if (!process.argv.includes('--reuse')) await build({
      entryPoints: [kind === 'chat' ? 'src/main/janus/chat-store.ts' : 'src/renderer/src/stores/editor.ts'],
      outfile: bundlePath(kind), bundle: true, platform: 'node', format: 'esm', packages: 'external',
      alias: { '@': resolve('src/renderer/src') },
      plugins: [{ name: 'isolated-electron', setup(build) {
        build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }))
        build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents:
          `export const app = { getPath: () => ${JSON.stringify(directory)} };` }))
      } }],
    })
    const runs = []
    for (let i = 0; i < 5; i++) {
      const child = spawnSync(process.execPath, ['--expose-gc', import.meta.filename, label, '--child', kind], { encoding: 'utf8' })
      if (child.status !== 0) throw Error(child.stderr || child.stdout)
      runs.push(JSON.parse(child.stdout.trim()))
    }
    result.cases[kind] = { bundleSha256: digest(await readFile(bundlePath(kind))), runs,
      median: Object.fromEntries(['durationMs', 'maxLagMs', 'sampledHeapPeakMiB', 'retainedHeapMiB', 'processMaxRssMiB']
        .map(key => [key, runs.map(run => run[key]).sort((a, b) => a - b)[2]])) }
  }
  if (label !== 'baseline') {
    const baseline = JSON.parse(await readFile(join(directory, 'baseline.json'), 'utf8'))
    if (baseline.fixtureSha256 !== result.fixtureSha256) throw Error('Fixture changed')
    for (const kind of ['chat', 'editor']) {
      if (result.cases[kind].runs.some(run => run.digest !== baseline.cases[kind].runs[0].digest)) throw Error(`${kind} output changed`)
    }
  }
  await writeFile(join(directory, `${label}.json`), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ label, fixtureBytes: result.fixtureBytes,
    cases: Object.fromEntries(Object.entries(result.cases).map(([kind, value]) => [kind, value.median])) }, null, 2))
}
