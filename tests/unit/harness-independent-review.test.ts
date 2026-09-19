import { SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runGit } from '@janus-agent/harness-node'
import { prepareTaskRun, repairTaskRun, startTaskRun, verifyTaskRun } from '../../src/main/harness/execution-adapter'
import { executeDesktopXdo, runDesktopCommand } from '../../src/main/harness/desktop-executor'
import { finishWithLatestReceipt, requestIndependentReview } from '../../src/main/harness/independent-review'
import { loadTaskThread } from '../../src/main/harness/task-thread'

const REPO = '8fa19f17-c717-43a8-93a7-810a5e0cbc91'
const TASK_ID = '55555555-5555-4333-8333-555555555555'
const TASK_URI = `note://${REPO}/${TASK_ID}`
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

function git(root: string, ...args: string[]): void {
  const result = runGit(root, args)
  if (!result.ok) throw new Error(result.error)
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'independent-review-'))
  roots.push(root)
  await mkdir(join(root, '.agents', 'notes'), { recursive: true })
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, '.agents', 'harness.json'), JSON.stringify({ schemaVersion: 1, repoId: REPO, name: 'Review', profile: SUPPORTED_HARNESS_PROFILE }))
  await writeFile(join(root, '.gitignore'), '.agents/.local/\n')
  await writeFile(join(root, 'src', 'value.txt'), '42')
  await writeFile(join(root, '.agents', 'notes', `2026-09-18-review--${TASK_ID.slice(0, 8)}.md`), [
    '---', 'schema: harness-note/1', `id: ${TASK_ID}`, 'kind: task', 'lifecycle: accepted', 'created: 2026-09-18',
    'work:', '  scope:', `    - repoId: ${REPO}`, "      paths: ['./']", '  acceptanceRefs:', `    - uri: ${TASK_URI}`, '      criterionId: AC-1',
    '  verification:', '    - id: V-1', '      kind: command', '      required: true', `      repoId: ${REPO}`, '      cwd: .',
    `      program: ${process.execPath}`, "      args: ['-e', 'process.exit(0)']", '---', '', '# Review probe task', '',
    '## Scope', '', 'Prove independent review on pinned evidence.', '', '## Acceptance criteria', '', '- [ ] AC-1: The declared check passes under audit.', '',
    '## Verification', '', 'Run the declared command, then audit.', '',
  ].join('\n'))
  git(root, 'init')
  git(root, 'config', 'core.autocrlf', 'false')
  git(root, 'config', 'user.name', 'test')
  git(root, 'config', 'user.email', 'test@example.invalid')
  git(root, 'add', '.')
  git(root, 'commit', '--no-gpg-sign', '-m', 'review probe task')
  return root
}

async function startedRun(root: string, mode: 'xdo' | 'xflow' = 'xdo'): Promise<{ runId: string; token: string }> {
  const prepared = await prepareTaskRun(root, { taskRef: TASK_URI, mode, closeout: 'commit-required', maxAutoRepairs: mode === 'xflow' ? 0 : 1 })
  expect(prepared.errors).toEqual([])
  const started = await startTaskRun(root, prepared.data.runId, 'desktop', { by: 'desktop' })
  expect(started.errors).toEqual([])
  return { runId: prepared.data.runId, token: started.run?.lease?.token as string }
}

async function verifiedRun(root: string, mode: 'xdo' | 'xflow' = 'xdo'): Promise<{ runId: string; token: string }> {
  const { runId, token } = await startedRun(root, mode)
  const executed = await executeDesktopXdo(root, runId, token, {
    command: (step, signal) => runDesktopCommand(root, step, { signal }),
    review: async () => ({ verdict: 'needs-fix', coverage: [] }),
    independentReview: async () => ({ verdict: 'needs-fix', coverage: [] }),
  })
  expect(executed.data.receiptId).toBeTruthy()
  return { runId, token }
}

describe('independent review', () => {
  it.each(['xdo', 'xflow'] as const)('audits %s pinned checks on its own thread and finishes on approval', async (mode) => {
    const root = await makeRoot()
    const { runId, token } = await verifiedRun(root, mode)
    const reviewed = await requestIndependentReview(root, runId, token, {
      review: async (input) => {
        expect(input.checks).toMatchObject([{ id: 'V-1', status: 'passed' }])
        expect(input.brief.prior).toEqual([])
        const criterion = input.criteria[0]
        return { verdict: 'approved', coverage: [{ uri: criterion.uri, criterionId: criterion.criterionId, criterionHash: criterion.criterionHash, checkIds: ['V-1'] }] }
      },
    }, { reviewer: 'evaluator' })
    expect(reviewed.errors).toEqual([])
    expect(reviewed.data.verdict).toBe('approved')
    const receipt = JSON.parse(await readFile(join(root, '.agents/evidence', `${reviewed.data.receiptId}.json`), 'utf8'))
    expect(receipt.actor).not.toBe(receipt.review.actor)
    expect(receipt.actor).toBe(mode === 'xdo' ? 'desktop' : `desktop:implementor:${runId}`)
    const thread = await loadTaskThread(root, runId)
    expect(thread?.evaluations).toHaveLength(mode === 'xflow' ? 2 : 1)
    expect(thread?.evaluations.at(-1)).toMatchObject({ reviewer: 'evaluator', verdict: 'approved', receiptId: reviewed.data.receiptId })
    const finished = await finishWithLatestReceipt(root, runId, token)
    expect(finished.errors).toEqual([])
    expect(finished.data).toMatchObject({ receiptId: reviewed.data.receiptId, completed: true })
  })

  it('blocks changed files during audit and rechecks files at standalone finish', async () => {
    const root = await makeRoot()
    const { runId, token } = await verifiedRun(root)
    const reviewed = await requestIndependentReview(root, runId, token, { review: async (input) => {
      await writeFile(join(root, 'src/value.txt'), 'changed')
      return { verdict: 'approved', coverage: input.criteria.map((criterion) => ({ ...criterion, checkIds: ['V-1'] })) }
    } }, { reviewer: 'evaluator' })
    expect(reviewed.data.verdict).toBe('blocked')
    expect((await finishWithLatestReceipt(root, runId, token)).data.completed).toBe(false)
  })

  it('refuses same-actor review, unpinned runs, and missing evidence', async () => {
    const root = await makeRoot()
    const { runId, token } = await verifiedRun(root)
    const ports = { review: async () => ({ verdict: 'approved' as const, coverage: [] }) }
    const same = await requestIndependentReview(root, runId, token, ports, { reviewer: 'desktop' })
    expect(same.ok).toBe(false)
    expect(same.errors.some((error) => error.code === 'SCHEMA_INVALID')).toBe(true)

    const root2 = await makeRoot()
    const fresh = await startedRun(root2)
    const unpinned = await requestIndependentReview(root2, fresh.runId, fresh.token, ports, { reviewer: 'evaluator' })
    expect(unpinned.ok).toBe(false)
  })

  it('spends the repair budget explicitly and re-opens the run', async () => {
    const root = await makeRoot()
    const { runId, token } = await verifiedRun(root)
    const reviewed = await requestIndependentReview(root, runId, token, {
      review: async () => ({ verdict: 'needs-fix', coverage: [] }),
    }, { reviewer: 'evaluator' })
    expect(reviewed.errors).toEqual([])
    const finished = await finishWithLatestReceipt(root, runId, token)
    expect(finished.ok).toBe(false)
    expect(finished.data.completed).toBe(false)
    const repaired = await repairTaskRun(root, runId, token, { failureReceiptId: reviewed.data.receiptId, summary: 'Flaky check, retry once.', auto: false, authorization: { by: 'desktop' } })
    expect(repaired.errors).toEqual([])
    expect(repaired.data.attempt).toBe(2)
  })

  it('blocks automatic repairs past the budget', async () => {
    const root = await makeRoot()
    const { runId, token } = await verifiedRun(root)
    const reviewed = await requestIndependentReview(root, runId, token, {
      review: async () => ({ verdict: 'needs-fix', coverage: [] }),
    }, { reviewer: 'evaluator' })
    const first = await repairTaskRun(root, runId, token, { failureReceiptId: reviewed.data.receiptId, summary: 'First auto retry.', auto: true })
    expect(first.errors).toEqual([])
    expect(await verifyTaskRun(root, runId, token, [])).toMatchObject({ ok: true })
    const { getTaskRun } = await import('../../src/main/harness/execution-adapter')
    const second = await repairTaskRun(root, runId, (await getTaskRun(root, runId)).run?.lease?.token as string, { failureReceiptId: reviewed.data.receiptId, summary: 'Second auto retry.', auto: true })
    expect(second.ok).toBe(false)
    expect(second.errors.some((error) => error.code === 'BUSY')).toBe(true)
  })
})
