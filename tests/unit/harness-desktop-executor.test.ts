import { SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { ChatTurnPorts } from '@janus-agent/janus-agent'
import { codeManifestHash, type ReceiptCoverage } from '@janus-agent/harness-core'
import { runGit } from '@janus-agent/harness-node'
import { prepareTaskRun, startTaskRun, getTaskRun, pauseTaskRun } from '../../src/main/harness/execution-adapter'
import { executeDesktopTask, executeDesktopXdo, runDesktopCommand, type DesktopExecutorPorts } from '../../src/main/harness/desktop-executor'
import { createDesktopImplementationPort, prepareDesktopTaskTurn } from '../../src/main/harness/desktop-task-turn'
import { buildDesktopReviewPrompt, createModelReviewPort, parseDesktopReviewClaim } from '../../src/main/harness/desktop-review'
import { BRIEF_MAX_FILES, buildTaskBrief, renderBriefSection, saveBriefCopy, verifyBriefFiles } from '../../src/main/harness/task-brief'

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

async function makeRoot(opts?: { exitCode?: number; manual?: boolean; implementation?: boolean }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-xdo-'))
  roots.push(root)
  await mkdir(join(root, '.agents', 'notes'), { recursive: true })
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, '.agents', 'harness.json'), JSON.stringify({ schemaVersion: 1, repoId: REPO, name: 'Desktop', profile: SUPPORTED_HARNESS_PROFILE }))
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
    opts?.implementation
      ? taskNote(manual).replace("paths: ['./']", "paths: ['src/']").replace("      args: ['-e', 'process.exit(0)']", `      args: ${JSON.stringify(['-e', 'const fs=require("fs");process.exit(fs.readFileSync("src/value.txt","utf8")==="43"?0:1)'])}`)
      : taskNote(manual).replace('process.exit(0)', `process.exit(${exitCode})`),
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

describe('desktop implementation loop', () => {
  function model(streamTextFn: ChatTurnPorts['streamTextFn']) {
    return createDesktopImplementationPort({ providerId: 'test', modelId: 'test', getModel: async () => ({}), maxTurns: 6, streamTextFn })
  }
  function calls(name: string, args: Record<string, unknown>) {
    return {
      textStream: (async function* () {})(),
      fullStream: (async function* () {
        yield { type: 'tool-call', toolCallId: 'write', toolName: name, args }
        yield { type: 'finish', finishReason: 'tool-calls' }
      })(),
    }
  }
  const textOnly = () => ({ textStream: (async function* () { yield 'Implemented' })() })

  it('edits through real tools, repairs failed checks with evidence, and completes attempt two', async () => {
    const root = await makeRoot({ implementation: true })
    const { runId, token } = await startedRun(root)
    let round = 0
    const prompts: string[] = []
    const implement = model(async (options) => {
      prompts.push(JSON.stringify(options.messages))
      const current = round++
      if (current % 2) return textOnly()
      const oldText = current === 0 ? '42' : 'wrong'
      return calls('workspace_edit', { path: 'src/value.txt', expectedHash: createHash('sha256').update(oldText).digest('hex'), replacements: [{ oldText, newText: current === 0 ? 'wrong' : '43' }] })
    })
    const review: DesktopExecutorPorts['review'] = async (input) => input.checks.some((check) => check.status === 'failed')
      ? { verdict: 'needs-fix', coverage: [] } : approvingPorts(root).review(input)
    const result = await executeDesktopTask(root, runId, token, { ...approvingPorts(root), implement, review })
    expect(result.errors).toEqual([])
    expect(result.data).toMatchObject({ completed: true, repairedAttempt: 2 })
    expect(await readFile(join(root, 'src/value.txt'), 'utf8')).toBe('43')
    const run = (await getTaskRun(root, runId)).run!
    expect(run).toMatchObject({ state: 'done', attempt: 2, repairBudget: { usedAuto: 1 } })
    expect(run.receipts).toHaveLength(2)
    expect(prompts[2]).toContain('failureReceiptId')
    expect(prompts[2]).toContain('V-1')
    const receipts = await Promise.all(run.receipts.map(async (id) => JSON.parse(await readFile(join(root, '.agents/evidence', `${id}.json`), 'utf8'))))
    expect(receipts.map((receipt) => receipt.checks[0].status)).toEqual(['failed', 'passed'])
  })

  it.each(['outside.txt', '.agents/notes/task.md'])('refuses model writes to %s before verification', async (path) => {
    const root = await makeRoot({ implementation: true })
    const { runId, token } = await startedRun(root)
    const command = vi.fn(approvingPorts(root).command)
    const result = await executeDesktopTask(root, runId, token, {
      ...approvingPorts(root), command, implement: model(async () => calls('workspace_create', { path, content: 'forbidden' })),
    })
    expect(result.ok).toBe(false)
    expect(result.errors[0].code).toBe('PERMISSION_DENIED')
    expect(command).not.toHaveBeenCalled()
    await expect(readFile(join(root, path))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await getTaskRun(root, runId)).run?.receipts).toEqual([])
  })

  it.each(['lease', 'contract', 'pause', 'profile'])('rechecks %s before a model tool executes', async (change) => {
    const root = await makeRoot({ implementation: true })
    const { runId, token } = await startedRun(root)
    const turn = await prepareDesktopTaskTurn(root, runId, token)
    const implement = model(async () => {
      if (change === 'lease') await writeFile(join(root, '.agents/.local/runs', runId, 'lease.json'), JSON.stringify({ token: 'replacement' }))
      if (change === 'pause') expect((await pauseTaskRun(root, runId, token)).ok).toBe(true)
      if (change === 'contract') {
        const path = join(root, '.agents/notes', `2026-09-18-probe--${TASK_ID.slice(0, 8)}.md`)
        await writeFile(path, (await readFile(path, 'utf8')).replace('Probe the desktop', 'Changed task: probe the desktop'))
      }
      if (change === 'profile') await writeFile(join(root, '.agents/harness.json'), JSON.stringify({ schemaVersion: 1, repoId: REPO, name: 'T', profile: { ...SUPPORTED_HARNESS_PROFILE, version: '2.0.0' } }))
      return calls('workspace_create', { path: 'src/new.txt', content: 'forbidden' })
    })
    await expect(implement(turn)).rejects.toThrow('PERMISSION_DENIED')
    await expect(readFile(join(root, 'src/new.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    if (change === 'profile') expect((await getTaskRun(root, runId)).errors[0].code).toBe('UNSUPPORTED_SCHEMA')
  })

  it('pauses cancelled implementation and never verifies it', async () => {
    const root = await makeRoot()
    const { runId, token } = await startedRun(root)
    const controller = new AbortController()
    const command = vi.fn(approvingPorts(root).command)
    const result = await executeDesktopTask(root, runId, token, {
      ...approvingPorts(root), command,
      implement: model(async () => { controller.abort(); return textOnly() }),
    }, { signal: controller.signal })
    expect(result.ok).toBe(false)
    expect(command).not.toHaveBeenCalled()
    expect((await getTaskRun(root, runId)).run).toMatchObject({ state: 'paused', receipts: [] })
  })

  it('stops at the repair budget and retries verification without another implementation', async () => {
    const root = await makeRoot({ exitCode: 1 })
    const { runId, token } = await startedRun(root)
    const implement = vi.fn(async () => ({ cancelled: false }))
    const ports = { ...approvingPorts(root), implement, review: async () => ({ verdict: 'needs-fix' as const, coverage: [] }) }
    const result = await executeDesktopTask(root, runId, token, ports)
    expect(result.data.completed).toBe(false)
    expect(implement).toHaveBeenCalledTimes(2)
    expect((await getTaskRun(root, runId)).run).toMatchObject({ state: 'verifying', attempt: 2, repairBudget: { usedAuto: 1 } })
    await executeDesktopTask(root, runId, token, ports)
    expect(implement).toHaveBeenCalledTimes(2)
  })
})

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

  it('records a failed receipt and auto-repairs once within budget', async () => {
    const root = await makeRoot({ exitCode: 1 })
    const { runId, token } = await startedRun(root)
    const executed = await executeDesktopXdo(root, runId, token, {
      ...approvingPorts(root),
      review: async () => ({ verdict: 'needs-fix', coverage: [] }),
    }, { implementor: 'desktop' })
    expect(executed.ok).toBe(true)
    expect(executed.data.completed).toBe(false)
    expect(executed.data.receiptId).toBeTruthy()
    expect(executed.data.checks).toMatchObject([{ id: 'V-1', status: 'failed' }])
    expect(executed.data.repairedAttempt).toBe(2)
    // The failure receipt is immutable history; the run reopens for a new attempt.
    expect((await getTaskRun(root, runId)).run?.state).toBe('running')
    expect((await getTaskRun(root, runId)).run?.attempt).toBe(2)
    expect((await getTaskRun(root, runId)).run?.receipts).toHaveLength(1)
    expect((await getTaskRun(root, runId)).run?.repairs).toMatchObject([{ attempt: 2, auto: true }])
  })

  it('stops auto repair at a spent budget and stays verifying', async () => {
    const root = await makeRoot({ exitCode: 1 })
    const { runId, token } = await startedRun(root)
    const failing = {
      ...approvingPorts(root),
      review: async () => ({ verdict: 'needs-fix', coverage: [] }),
    }
    const first = await executeDesktopXdo(root, runId, token, failing, { implementor: 'desktop' })
    expect(first.data.repairedAttempt).toBe(2)
    const second = await executeDesktopXdo(root, runId, token, failing, { implementor: 'desktop' })
    expect(second.ok).toBe(false)
    expect(second.data.completed).toBe(false)
    expect(second.data.repairedAttempt ?? null).toBeNull()
    expect((await getTaskRun(root, runId)).run?.state).toBe('verifying')
    expect((await getTaskRun(root, runId)).run?.repairBudget).toMatchObject({ maxAuto: 1, usedAuto: 1 })
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

describe('task handoff brief', () => {
  const manifest = [
    { repoId: REPO, path: 'src/value.txt', sha256: 'a'.repeat(64) },
    { repoId: REPO, path: 'gone.txt', deleted: true as const },
  ]
  const base = {
    runId: 'run-1', taskUri: TASK_URI, attempt: 1,
    goalText: 'Probe the desktop host.', constraintText: 'None yet.',
    criteria: [{ uri: TASK_URI, criterionId: 'AC-1' }],
    manifest, history: [{ attempt: 0, verdict: 'blocked', failedChecks: ['V-0'] }],
  }
  it('builds deterministically with code-joined file refs', () => {
    const first = buildTaskBrief(base)
    expect(buildTaskBrief(base)).toEqual(first)
    expect(first.files).toEqual([
      { repoId: REPO, path: 'src/value.txt', sha256: 'a'.repeat(64) },
      { repoId: REPO, path: 'gone.txt', sha256: null },
    ])
    expect(first.truncated).toBe(false)
    const rendered = renderBriefSection(first)
    expect(rendered).toContain('Probe the desktop host.')
    expect(rendered).toContain('src/value.txt')
    expect(rendered).toContain('attempt 0 verdict:blocked')
  })

  it('caps files and prose with an explicit truncated marker', () => {
    const many = Array.from({ length: BRIEF_MAX_FILES + 5 }, (_, i) => ({ repoId: REPO, path: `src/f${i}.txt`, sha256: 'b'.repeat(64) }))
    const brief = buildTaskBrief({ ...base, manifest: many, goalText: 'g'.repeat(5000) })
    expect(brief.files).toHaveLength(BRIEF_MAX_FILES)
    expect(brief.truncated).toBe(true)
    expect(renderBriefSection(brief)).toContain('truncated')
  })

  it('refuses tampered or vanished file refs before use', () => {
    const brief = buildTaskBrief(base)
    expect(verifyBriefFiles(brief, manifest)).toEqual([])
    expect(verifyBriefFiles(brief, [{ ...manifest[0], sha256: 'c'.repeat(64) }, manifest[1]]).some((error) => error.code === 'STALE_BASELINE')).toBe(true)
    expect(verifyBriefFiles(brief, [manifest[0]]).some((error) => error.code === 'STALE_BASELINE')).toBe(true)
  })

  it('stores one audit copy per attempt', async () => {
    const root = await makeRoot()
    await saveBriefCopy(root, 'run-1', 'attempt-2', 'brief body')
    const { readFile } = await import('node:fs/promises')
    await expect(readFile(join(root, '.agents', '.local', 'runs', 'run-1', 'briefs', 'attempt-2.md'), 'utf8')).resolves.toBe('brief body')
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

    let seenBrief: { taskUri: string; attempt: number; files: unknown[]; criteria: unknown[]; prior: Array<{ attempt: number; verdict: string }> } | null = null
    const repaired = await executeDesktopXdo(root, runId, token, {
      command: (step, signal) => runDesktopCommand(root, step, { signal }),
      review: async (input) => {
        seenBrief = input.brief
        const criterion = input.criteria[0]
        return { verdict: 'approved', coverage: [{ uri: criterion.uri, criterionId: criterion.criterionId, criterionHash: criterion.criterionHash, checkIds: ['V-1'] }] }
      },
    }, { implementor: 'desktop' })
    expect(repaired.errors).toEqual([])
    expect(repaired.data.completed).toBe(true)
    expect(seenBrief).toMatchObject({ taskUri: TASK_URI, attempt: 1 })
    expect((seenBrief?.files.length ?? 0)).toBeGreaterThan(0)
    expect(seenBrief?.criteria).toEqual([{ uri: TASK_URI, criterionId: 'AC-1' }])
    expect(seenBrief?.prior).toHaveLength(1)
    expect(seenBrief?.prior[0]).toMatchObject({ attempt: 1, verdict: 'unreviewed' })

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
    brief: { schema: 'harness-brief/1', runId: 'run-1', taskUri: TASK_URI, attempt: 1, goal: 'Prove it.', constraints: '', criteria: [], files: [], prior: [], truncated: false },
  }
  it('builds a read-only prompt that binds the manifest hash', () => {
    const prompt = buildDesktopReviewPrompt({ ...input, criteria: [{ uri: TASK_URI, criterionId: 'AC-1', criterionHash: 'criterion-digest', text: 'The file value is 43.' }] })
    expect(prompt).toContain('criterion-digest')
    expect(prompt).toContain('The file value is 43.')
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
  const reviewInput = {
    manifestHash: 'm', manifest: [], checks: [], criteria: [],
    brief: { schema: 'harness-brief/1', runId: 'run-1', taskUri: TASK_URI, attempt: 1, goal: 'g', constraints: '', criteria: [], files: [], prior: [], truncated: false },
  }
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
