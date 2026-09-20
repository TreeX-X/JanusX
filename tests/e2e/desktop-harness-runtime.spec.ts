import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node'
import type { HarnessAPI } from '../../src/shared/ipc/harness'
import type { LlmAPI } from '../../src/shared/ipc/llm'
import { createDesktopTestEnv } from './desktop-test-env'

type HarnessWindow = Window & { electron: { harness: HarnessAPI; llm: LlmAPI } }

// A deterministic HTTP model exercises the built transport and tools, not model quality.
for (const mode of ['xdo', 'xdel', 'xflow'] as const) test(`built desktop ${mode} implements, checks, persists receipts and reloads local history`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'janusx-harness-runtime-'))
  const workspace = join(root, 'workspace')
  const userDataDir = join(root, 'profile')
  const repoId = '8fa19f17-c717-43a8-93a7-810a5e0cbc91'
  const taskId = '77777777-7777-4777-8777-777777777777'
  const taskUri = `note://${repoId}/${taskId}`
  const requests: string[] = []
  const failures: string[] = []
  let application: ElectronApplication | undefined
  let turn = 0
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      // Runtime status probes use Chat Completions before the task's Responses
      // stream. Serve the health check without consuming a scripted task turn.
      if (request.url === '/v1/chat/completions' && body.stream !== true) {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ id: 'health', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] }))
        return
      }
      expect(request.url).toBe('/v1/responses')
      expect(body.input).toBeDefined()
      const prompt = JSON.stringify(body.input)
      const reviewing = prompt.includes('Reply with exactly one JSON object')
      const independent = prompt.includes('Independent read-only audit.')
      requests.push(reviewing ? independent ? 'independent-review' : 'self-review' : 'implementation')
      expect(body.stream).toBe(true)
      {
        const current = reviewing ? -1 : turn++
        const readReview = reviewing && !prompt.includes('function_call_output')
        const tool = current === 0 || readReview ? 'workspace_read' : 'workspace_edit'
        const useTool = readReview || !reviewing && current < 2
        if (useTool) expect(body.tools.some((entry: { name: string }) => entry.name === tool)).toBe(true)
        if (reviewing) {
          expect(body.tools.some((entry: { name: string }) => entry.name === 'workspace_edit')).toBe(false)
          expect(prompt).not.toContain('Updated src/value.txt to 43.')
        }
        if (current === 1) expect(prompt).toContain('42')
        const args = current === 0 || readReview ? { path: 'src/value.txt' } : {
          path: 'src/value.txt', expectedHash: createHash('sha256').update('42').digest('hex'), replacements: [{ oldText: '42', newText: '43' }],
        }
        response.writeHead(200, { 'Content-Type': 'text/event-stream' })
        const emit = (event: unknown) => response.write(`data: ${JSON.stringify(event)}\n\n`)
        emit({ type: 'response.created', response: { id: `fixture-${current}`, created_at: 1, model: 'fixture-model' } })
        if (useTool) {
          const item = { type: 'function_call', id: `item-${current}`, call_id: `tool-${current}`, name: tool, arguments: JSON.stringify(args), status: 'completed' }
          emit({ type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } })
          emit({ type: 'response.function_call_arguments.delta', item_id: item.id, output_index: 0, delta: item.arguments })
          emit({ type: 'response.output_item.done', output_index: 0, item })
        } else {
          let content = 'Updated src/value.txt to 43.'
          if (reviewing) {
            const match = prompt.match(/(note:\/\/[^\s"#]+)#(AC-1) hash:([a-f0-9]{64})/)
            if (!match) throw new Error('Review did not receive a pinned criterion')
            expect(prompt).toContain('[command/passed]')
            expect(prompt).toContain('43')
            content = JSON.stringify({ verdict: 'approved', coverage: [{ uri: match[1], criterionId: match[2], criterionHash: match[3], checkIds: ['V-1'] }], summary: 'Inspected the file and passed check.' })
          }
          const item = { type: 'message', id: 'text-1' }
          emit({ type: 'response.output_item.added', output_index: 0, item })
          emit({ type: 'response.output_text.delta', item_id: item.id, delta: content })
          emit({ type: 'response.output_item.done', output_index: 0, item })
        }
        emit({ type: 'response.completed', response: { usage: { input_tokens: 10, output_tokens: 10 } } })
        response.end()
      }
    } catch (error) {
      failures.push(String(error))
      if (!response.headersSent) response.writeHead(500)
      response.end('fixture failed')
    }
  })
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    await mkdir(join(workspace, '.agents/notes'), { recursive: true })
    await mkdir(join(workspace, 'src'))
    await writeFile(join(workspace, '.agents/harness.json'), JSON.stringify({ schemaVersion: 1, repoId, name: 'Runtime fixture', profile: SUPPORTED_HARNESS_PROFILE }))
    await writeFile(join(workspace, '.gitignore'), '.agents/.local/\n')
    await writeFile(join(workspace, 'src/value.txt'), '42')
    await writeFile(join(workspace, '.agents/notes/task.md'), [
      '---', 'schema: harness-note/1', `id: ${taskId}`, 'kind: task', 'lifecycle: accepted', 'created: 2026-09-19',
      'work:', '  scope:', `    - repoId: ${repoId}`, "      paths: ['src/']", '  acceptanceRefs:', `    - uri: ${taskUri}`, '      criterionId: AC-1',
      '  verification:', '    - id: V-1', '      kind: command', '      required: true', `      repoId: ${repoId}`, '      cwd: .',
      `      program: ${process.execPath}`, `      args: ${JSON.stringify(['-e', 'const fs=require("fs");process.exit(fs.readFileSync("src/value.txt","utf8")==="43"?0:1)'])}`,
      '---', '', '# Runtime task', '', '## Scope', '', 'Read src/value.txt and change 42 to 43.', '', '## Acceptance criteria', '', '- [ ] AC-1: src/value.txt contains 43.', '', '## Verification', '', 'Run V-1.', '',
    ].join('\n'))
    const git = (...args: string[]) => execFileSync('git', args, { cwd: workspace, stdio: 'pipe' }).toString()
    git('init'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.invalid')
    git('add', '.'); git('commit', '--no-gpg-sign', '-m', 'fixture')
    const launch = () => electron.launch({ args: [resolve('out/main/index.js'), `--user-data-dir=${userDataDir}`], env: createDesktopTestEnv(root) })
    application = await launch()
    let page = await application.firstWindow()
    const saved = await page.evaluate(async (baseURL) => (window as HarnessWindow).electron.llm.saveTerminalProvider('janus', {
      id: 'openai-compatible', name: 'Local fixture', authType: 'api-key' as never, enabled: true,
      apiKey: 'fixture-key', baseURL, modelId: 'fixture-model', models: ['fixture-model'],
    }), `http://127.0.0.1:${address.port}/v1`)
    expect(saved.success).toBe(true)
    const prepared = await page.evaluate(async ({ cwd, taskUri, mode }) => {
      const api = (window as HarnessWindow).electron.harness
      const prepared = await api.runPrepare(cwd, { taskUri, mode, closeout: 'commit-required' })
      await api.runStart(cwd, prepared.runId, 'desktop', { by: 'desktop' })
      return prepared
    }, { cwd: workspace, taskUri, mode })
    const executed = await page.evaluate(async ({ cwd, runId }) => (window as HarnessWindow).electron.harness.runExecute(cwd, { runId, providerId: 'openai-compatible', modelId: 'fixture-model' }), { cwd: workspace, runId: prepared.runId }).catch(async (error) => {
      const history = await page.evaluate(async ({ cwd, runId }) => (window as HarnessWindow).electron.harness.runTranscript(cwd, runId), { cwd: workspace, runId: prepared.runId })
      throw new Error(`${String(error)}; ${JSON.stringify({ requests, failures, history })}`)
    })
    expect(failures).toEqual([])
    expect(executed).toMatchObject({ completed: true, checks: [{ status: 'passed' }] })
    expect(await readFile(join(workspace, 'src/value.txt'), 'utf8')).toBe('43')
    expect(requests).toEqual(['implementation', 'implementation', 'implementation', 'self-review', 'self-review', ...(mode === 'xflow' ? ['independent-review', 'independent-review'] : [])])
    const receipt = JSON.parse(await readFile(join(workspace, '.agents/evidence', `${executed.receiptId}.json`), 'utf8'))
    expect(receipt.checks[0].status).toBe('passed')
    expect(receipt.mode).toBe(mode)
    expect(receipt.review.kind).toBe(mode === 'xflow' ? 'independent' : 'self')
    expect(receipt.review.actor === receipt.actor).toBe(mode !== 'xflow')
    expect(receipt.codeManifest).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'src/value.txt', sha256: createHash('sha256').update('43').digest('hex') })]))
    git('add', 'src', '.agents/notes', '.agents/evidence'); git('commit', '--no-gpg-sign', '-m', 'complete task')
    expect(git('ls-files', '.agents/.local')).toBe('')
    await application.close()
    application = await launch()
    page = await application.firstWindow()
    const recovered = await page.evaluate(async ({ cwd, runId }) => {
      const api = (window as HarnessWindow).electron.harness
      return { transcript: await api.runTranscript(cwd, runId), closeout: await api.runCloseout(cwd, runId) }
    }, { cwd: workspace, runId: prepared.runId })
    expect(recovered.transcript).toMatchObject({ active: false, turns: [{ status: 'completed', text: 'Updated src/value.txt to 43.', tools: [{ status: 'completed' }, { status: 'completed' }] }] })
    expect(recovered.closeout.satisfied).toBe(true)
    await writeFile(join(workspace, '.agents/.local/runs', prepared.runId, 'implementation.json'), '{corrupt')
    await expect(page.evaluate(async ({ cwd, runId }) => (window as HarnessWindow).electron.harness.runTranscript(cwd, runId), { cwd: workspace, runId: prepared.runId })).rejects.toThrow('RECOVERY_REQUIRED')
    await page.evaluate(async ({ cwd, runId }) => (window as HarnessWindow).electron.harness.runThreadClose(cwd, runId), { cwd: workspace, runId: prepared.runId })
    expect(JSON.parse(await readFile(join(workspace, '.agents/evidence', `${executed.receiptId}.json`), 'utf8'))).toEqual(receipt)
  } finally {
    await application?.close().catch(() => undefined)
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
