import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { codeManifestHash, type ReceiptCoverage } from '@janus-agent/harness-core'
import { runGit } from '@janus-agent/harness-node'
import { prepareTaskRun, startTaskRun, getTaskRun } from '../../src/main/harness/execution-adapter'
import { executeDesktopXdo, runDesktopCommand, type DesktopExecutorPorts } from '../../src/main/harness/desktop-executor'
import { buildDesktopReviewPrompt, createModelReviewPort, parseDesktopReviewClaim } from '../../src/main/harness/desktop-review'

const REPO = '8fa19f17-c717-43a8-93a7-810a5e0cbc91'
const TASK_ID = '33333333-3333-4333-8333-333333333333'
const TASK_URI = `note://${REPO}/${TASK_ID}`
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

function git(root: string, ...args: string[]): void {
  const result = runGit(root, args)
  if (!result.ok) throw new Error(result.error)
}

function taskNote(extraVerification: string): string {
  return [
    '---',
    'schema: harness-note/1',
    `id: ${TASK_ID}`,
    'kind: task',
    'lifecycle: accepted',
    'created: 2026-09-18',
    'work:',
    '  scope:',
    `    - repoId: ${REPO}`,
    "      paths: ['./']",
    '  acceptanceRefs:',
    `    - uri: ${TASK_URI}`,
    '      criterionId: AC-1',
    '  verification:',
    '    - id: V-1',
    '      kind: command',
    '      required: true',
    `      repoId: ${REPO}`,
    '      cwd: .',
    `      program: ${process.execPath}`,
    "      args: ['-e', 'process.exit(0)']",
    extraVerification,
    '---',
    '',
    '# Desktop probe task',
    '',
    '## Scope',
    '',
    'Probe the desktop xdo host with a real command.',
    '',
    '## Acceptance criteria',
    '',
    '- [ ] AC-1: The declared check passes and the self-review covers it.',
    '',
    '## Verification',
    '',
    'Run the declared command, then self-review.',
    '',
  ].join('\n')
}

async function makeRoot(opts?: { exitCode?: number; manual?: boolean }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-xdo-'))
  roots.push(root)
  await mkdir(join(root, '.agents', 'notes'), { recursive: true })
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, '.agents', 'harness.json'), JSON.stringify({ repoId: REPO, name: 'Desktop' }))
  await writeFile(join(root, '.gitignore'), '.agents/.local/\n')
  await writeFile(join(root, 'src', 'value.txt'), '42')
  const manual = opts?.manual === true
    ? [
      '    - id: V-2',
      '      kind: manual',
      '      required: true',
      `      repoId: ${REPO}`,
      '      cwd: .',
      '      description: Eyeball the run record.',
      '',
    ].join('\n')
    : ''
  const exitCode = opts?.exitCode ?? 0
  await writeFile(
    join(root, '.agents', 'notes', `2026-09-18-probe--${TASK_ID.slice(0, 8)}.md`),
    taskNote(manual).replace('process.exit(0)', `process.exit(${exitCode})`),
  )
  git(root, 'init')
  git(root, 'config', 'core.autocrlf', 'false')
  git(root, 'config', 'user.name', 'test')
  git(root, 'config', 'user.email', 'test@example.invalid')
  git(root, 'add', '.')
  git(root, 'commit', '--no-gpg-sign', '-m', 'probe task')
  return root
}

async function startedRun(root: string, mode: 'xdo' | 'xdel' = 'xdo'): Promise<{ runId: string; token: string }> {
  const prepared = await prepareTaskRun(root, { taskRef: TASK_URI, mode, closeout: 'commit-required' })
  expect(prepared.errors).toEqual([])
  const started = await startTaskRun(root, prepared.data.runId, 'desktop', { by: 'desktop' })
  expect(started.errors).toEqual([])
  const token = started.run?.lease?.token
  expect(token).toBeTruthy()
  return { runId: prepared.data.runId, token: token as string }
}

function approvingPorts(root: string): DesktopExecutorPorts {
  return {
    command: (step, signal) => runDesktopCommand(root, step, { signal }),
    review: async (input) => {
      const criterion = input.criteria[0] as { uri: string; criterionId: string; criterionHash: string }
      const coverage: ReceiptCoverage[] = [{
        uri: criterion.uri, criterionId: criterion.criterionId, criterionHash: criterion.criterionHash,
        checkIds: input.checks.filter((check) => check.status === 'passed').map((check) => check.id),
      }]
      return { verdict: 'approved', coverage }
    },
  }
}

describe('desktop xdo host', () => {
  it('executes declared checks with a real process and completes with a formal receipt', async () => {
    const root = await makeRoot()
    const { runId, token } = await startedRun(root)
    const executed = await executeDesktopXdo(root, runId, token, approvingPorts(root), { implementor: 'desktop' })
    expect(executed.errors).toEqual([])
    expect(executed.ok).toBe(true)
    expect(executed.data.completed).toBe(true)
    expect(executed.data.receiptId).toBeTruthy()
    expect(executed.data.checks).toMatchObject([{ id: 'V-1', kind: 'command', status: 'passed' }])
    expect((await getTaskRun(root, runId)).run?.state).toBe('done')
  })

  it('records a failed receipt and never completes when a required check fails', async () => {
    const root = await makeRoot({ exitCode: 1 })
    const { runId, token } = await startedRun(root)
    const executed = await executeDesktopXdo(root, runId, token, {
      ...approvingPorts(root),
      review: async () => ({ verdict: 'needs-fix', coverage: [] }),
    }, { implementor: 'desktop' })
    expect(executed.ok).toBe(false)
    expect(executed.data.completed).toBe(false)
    expect(executed.data.receiptId).toBeTruthy()
    expect(executed.data.checks).toMatchObject([{ id: 'V-1', status: 'failed' }])
    // The failure receipt is immutable history; the run stays open for repair.
    expect((await getTaskRun(root, runId)).run?.state).toBe('verifying')
    expect((await getTaskRun(root, runId)).run?.receipts).toHaveLength(1)
  })

  it('refuses malformed self-review output and records nothing', async () => {
    const root = await makeRoot()
    const { runId, token } = await startedRun(root)
    const executed = await executeDesktopXdo(root, runId, token, {
      ...approvingPorts(root),
      review: async () => { throw new Error('SCHEMA_INVALID: self-review returned no JSON object; refusing approval') },
    }, { implementor: 'desktop' })
    expect(executed.ok).toBe(false)
    expect(executed.data.receiptId).toBe('')
    expect((await getTaskRun(root, runId)).run?.state).toBe('verifying')
    expect((await getTaskRun(root, runId)).run?.receipts).toHaveLength(0)
  })

  it('rejects coverage that cites a failed check', async () => {
    const root = await makeRoot({ exitCode: 1 })
    const { runId, token } = await startedRun(root)
    const executed = await executeDesktopXdo(root, runId, token, {
      ...approvingPorts(root),
      review: async (input) => ({
        verdict: 'approved',
        coverage: [{ uri: TASK_URI, criterionId: 'AC-1', criterionHash: input.criteria[0].criterionHash, checkIds: ['V-1'] }],
      }),
    }, { implementor: 'desktop' })
    expect(executed.ok).toBe(false)
    expect(executed.errors.some((error) => error.code === 'NOT_READY')).toBe(true)
    expect((await getTaskRun(root, runId)).run?.receipts).toHaveLength(0)
  })

  it('requires operator evidence for manual steps and accepts it when supplied', async () => {
    const root = await makeRoot({ manual: true })
    const first = await startedRun(root)
    const refused = await executeDesktopXdo(root, first.runId, first.token, approvingPorts(root), { implementor: 'desktop' })
    expect(refused.ok).toBe(false)
    expect(refused.errors.some((error) => error.code === 'CAPABILITY_UNAVAILABLE')).toBe(true)
    const supplied = await executeDesktopXdo(root, first.runId, first.token, approvingPorts(root), {
      implementor: 'desktop',
      manualEvidence: [{ stepId: 'V-2', observer: 'desktop', observation: 'Read the run record; values match.' }],
    })
    expect(supplied.errors).toEqual([])
    expect(supplied.data.completed).toBe(true)
    expect(supplied.data.checks).toMatchObject([
      { id: 'V-1', kind: 'command', status: 'passed' },
      { id: 'V-2', kind: 'manual', status: 'passed' },
    ])
  })

  it('refuses delegated modes and stale contracts without executing', async () => {
    const root = await makeRoot()
    const delegated = await startedRun(root, 'xdel')
    const refused = await executeDesktopXdo(root, delegated.runId, delegated.token, approvingPorts(root), { implementor: 'desktop' })
    expect(refused.ok).toBe(false)
    expect(refused.errors.some((error) => error.code === 'CAPABILITY_UNAVAILABLE')).toBe(true)

    const fresh = await makeRoot()
    const { runId } = await startedRun(fresh)
    const { readFile, writeFile: write } = await import('node:fs/promises')
    const file = join(fresh, '.agents', 'notes', `2026-09-18-probe--${TASK_ID.slice(0, 8)}.md`)
    await write(file, (await readFile(file, 'utf8')).replace('Probe the desktop', 'Probe the moved desktop'))
    const stale = await executeDesktopXdo(fresh, runId, 'stale-token', approvingPorts(fresh), { implementor: 'desktop' })
    expect(stale.ok).toBe(false)
    expect(stale.errors.some((error) => error.code === 'STALE_BASELINE')).toBe(true)
  })

  it('re-enters a verifying run on the same manifest and records drift as blocked', async () => {
    const root = await makeRoot()
    const { runId, token } = await startedRun(root)
    let dirty = false
    const drifting: DesktopExecutorPorts = {
      ...approvingPorts(root),
      review: async (input) => {
        if (!dirty) {
          dirty = true
          const { writeFile: write } = await import('node:fs/promises')
          await write(join(root, 'src', 'value.txt'), '43')
        }
        const criterion = input.criteria[0]
        return { verdict: 'approved', coverage: [{ uri: criterion.uri, criterionId: criterion.criterionId, criterionHash: criterion.criterionHash, checkIds: ['V-1'] }] }
      },
    }
    const executed = await executeDesktopXdo(root, runId, token, drifting, { implementor: 'desktop' })
    expect(executed.ok).toBe(false)
    expect(executed.errors.some((error) => error.code === 'STALE_BASELINE')).toBe(true)
    expect(executed.data.receiptId).toBeTruthy()
    expect((await getTaskRun(root, runId)).run?.receipts).toHaveLength(1)
  })
})

describe('task-bound thread reattachment', () => {
  it('reattaches repairs to the same thread with prior history and records the receipt', async () => {
    const root = await makeRoot()
    const { runId, token } = await startedRun(root)
    const refused = await executeDesktopXdo(root, runId, token, {
      command: (step, signal) => runDesktopCommand(root, step, { signal }),
      review: async () => { throw new Error('SCHEMA_INVALID: self-review returned no JSON object; refusing approval') },
    }, { implementor: 'desktop' })
    expect(refused.ok).toBe(false)

    let seenHistory: Array<{ attempt: number; verdict: string; failedChecks: string[] }> = []
    const repaired = await executeDesktopXdo(root, runId, token, {
      command: (step, signal) => runDesktopCommand(root, step, { signal }),
      review: async (input) => {
        seenHistory = input.history
        const criterion = input.criteria[0]
        return { verdict: 'approved', coverage: [{ uri: criterion.uri, criterionId: criterion.criterionId, criterionHash: criterion.criterionHash, checkIds: ['V-1'] }] }
      },
    }, { implementor: 'desktop' })
    expect(repaired.errors).toEqual([])
    expect(repaired.data.completed).toBe(true)
    expect(seenHistory).toHaveLength(1)
    expect(seenHistory[0]).toMatchObject({ attempt: 1, verdict: 'unreviewed' })

    const { loadTaskThread } = await import('../../src/main/harness/task-thread')
    const thread = await loadTaskThread(root, runId)
    expect(thread?.attempts).toHaveLength(1)
    expect(thread?.attempts[0]).toMatchObject({ attempt: 1, reviewVerdict: 'approved', receiptId: repaired.data.receiptId })
  })
})

describe('desktop command runner', () => {  it('refuses missing programs and escaping cwds without spawning', async () => {
    const root = await makeRoot()
    await expect(runDesktopCommand(root, { id: 'V-9', kind: 'command', required: true, repoId: REPO, cwd: '.', args: [] })).resolves.toMatchObject({ ok: false })
    await expect(runDesktopCommand(root, { id: 'V-9', kind: 'command', required: true, repoId: REPO, cwd: '..', program: process.execPath, args: [] })).resolves.toMatchObject({ ok: false })
  })

  it('reports real exit codes without a shell', async () => {
    const root = await makeRoot()
    await expect(runDesktopCommand(root, { id: 'V-1', kind: 'command', required: true, repoId: REPO, cwd: '.', program: process.execPath, args: ['-e', 'process.exit(0)'] })).resolves.toMatchObject({ ok: true, exitCode: 0 })
    await expect(runDesktopCommand(root, { id: 'V-1', kind: 'command', required: true, repoId: REPO, cwd: '.', program: process.execPath, args: ['-e', 'process.exit(3)'] })).resolves.toMatchObject({ ok: false, exitCode: 3 })
  })
})

describe('desktop self-review parsing', () => {
  const input = {
    taskUri: TASK_URI, attempt: 1, manifestHash: 'm', manifest: [], checks: [], criteria: [],
  }
  it('builds a read-only prompt that binds the manifest hash', () => {
    expect(buildDesktopReviewPrompt(input)).toContain('m')
  })

  it('parses strict claims and refuses prose as approval', () => {
    const good = parseDesktopReviewClaim('{"verdict":"approved","coverage":[],"summary":"ok"}')
    expect(good.ok).toBe(true)
    expect(parseDesktopReviewClaim('looks good to me').ok).toBe(false)
    expect(parseDesktopReviewClaim('{"verdict":"maybe","coverage":[]}').ok).toBe(false)
    expect(parseDesktopReviewClaim('{"verdict":"approved","coverage":[{"uri":"x"}]}').ok).toBe(false)
  })

  it('hashes manifests independent of row order', () => {
    const rows = [
      { repoId: REPO, path: 'b.txt', sha256: 'b' },
      { repoId: REPO, path: 'a.txt', sha256: 'a' },
    ]
    expect(codeManifestHash(rows)).toBe(codeManifestHash([...rows].reverse()))
  })
})

describe('desktop model review port', () => {
  const reviewInput = { manifestHash: 'm', manifest: [], checks: [], criteria: [] }
  const deps = (text: string) => ({
    providerId: 'p',
    modelId: 'm',
    getModel: async () => ({ id: 'model' }),
    generateReviewText: async () => text,
  })
  it('passes strict claims through with the bound task identity', async () => {
    let seen = ''
    const port = createModelReviewPort(TASK_URI, 1, {
      ...deps('{"verdict":"approved","coverage":[]}'),
      generateReviewText: async (_model, prompt) => { seen = prompt; return '{"verdict":"approved","coverage":[]}' },
    })
    await expect(port(reviewInput)).resolves.toMatchObject({ verdict: 'approved', coverage: [] })
    expect(seen).toContain(TASK_URI)
    expect(seen).toContain('m')
  })

  it('refuses missing models, empty text, and malformed claims', async () => {
    await expect(createModelReviewPort(TASK_URI, 1, { ...deps('{}'), providerId: undefined })(reviewInput)).rejects.toThrow('CAPABILITY_UNAVAILABLE')
    await expect(createModelReviewPort(TASK_URI, 1, deps('  '))(reviewInput)).rejects.toThrow('NOT_READY')
    await expect(createModelReviewPort(TASK_URI, 1, deps('not json'))(reviewInput)).rejects.toThrow('SCHEMA_INVALID')
  })
})
