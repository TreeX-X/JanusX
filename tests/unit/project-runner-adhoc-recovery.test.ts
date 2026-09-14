import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectRunner } from '../../src/main/project/runner/runner'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'janusx-adhoc-recovery-'))
  roots.push(root)
  return root
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

async function waitExited(runner: ProjectRunner, projectId: string) {
  for (let i = 0; i < 100; i++) {
    const snap = runner.getExited(projectId)
    if (snap) return snap
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`adhoc did not exit in time: ${projectId}`)
}

describe('ProjectRunner adhoc recovery', () => {
  it('rejects shell-metachar args for shims before spawning', async () => {
    const runner = new ProjectRunner(5)
    const root = await workspace()
    if (process.platform !== 'win32') return
    await expect(runner.runAdhoc({ cwd: root, program: 'npm', args: ['run', 'x & y'] }))
      .rejects.toThrow('unsupported metacharacters')
  })

  it('surfaces an unresolvable program with a hint in the snapshot and log', async () => {
    const runner = new ProjectRunner(5)
    const root = await workspace()
    const started = await runner.runAdhoc({ cwd: root, program: 'janus-ghost-prog-4058', label: 'missing' })
    const snap = await waitExited(runner, started.projectId)
    expect(snap.exitCode).toBeNull()
    expect(snap.output.join('\n')).toMatch(/spawn error|failed to start/)
    expect(snap.output.join('\n')).toContain('janus-ghost-prog-4058')
    expect(started.logPath).toBeDefined()
    const log = await readFile(started.logPath!, 'utf-8')
    expect(log).toMatch(/spawn error|failed to start/)
    expect(log).toContain('executionMode: direct')
  })

  it('stops a running job promptly with no lingering process', async () => {
    const runner = new ProjectRunner(5)
    const root = await workspace()
    const started = await runner.runAdhoc({
      cwd: root, program: process.execPath, args: ['-e', 'setTimeout(() => {}, 60000)'], label: 'sleep',
    })
    const begin = Date.now()
    await runner.stop(started.projectId, 5000)
    expect(Date.now() - begin).toBeLessThan(5000)
    await expect(waitExited(runner, started.projectId)).resolves.toBeDefined()
  })
})
