import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import ProjectRunner from '../../src/main/project/runner/runner'
import { ProjectType } from '../../src/main/project/types'

const root = await mkdtemp(join(tmpdir(), 'janusx-runner-scope-'))
const worktree = join(root, 'wt-login')
const runner = new ProjectRunner(5)

function launchConfig(extra: Record<string, unknown> = {}) {
  return {
    version: '0.1.0',
    projectType: ProjectType.Custom,
    projectName: 'scope-test',
    configurations: [
      {
        name: 'dev',
        type: ProjectType.Custom,
        request: 'launch' as const,
        program: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 60000)'],
        ...extra,
      },
    ],
    metadata: { lastModified: new Date().toISOString(), autoDetected: false },
  }
}

async function writeConfig(dir: string, extra: Record<string, unknown> = {}) {
  await mkdir(join(dir, '.janusX'), { recursive: true })
  await writeFile(join(dir, '.janusX', 'janusX.launch.json'), JSON.stringify(launchConfig(extra)), 'utf-8')
}

afterAll(async () => {
  await runner.stopAll(500).catch(() => undefined)
  await rm(root, { recursive: true, force: true }).catch(() => undefined)
})

describe('ProjectRunner scope identity and config inheritance', () => {
  it('stamps workspaceId/scopePath/branch/configName onto running handles', async () => {
    await writeConfig(root)
    const handle = await runner.run(root, 'dev', {
      identity: { workspaceId: 'wa', scopePath: root, branch: 'main' },
    })
    expect(handle.configName).toBe('dev')
    const entry = [...runner.getAllRunning().entries()].find(([, h]) => h.pid === handle.pid)
    expect(entry).toBeDefined()
    const summary = entry![1]
    expect(summary.workspaceId).toBe('wa')
    expect(summary.scopePath).toBe(root)
    expect(summary.branch).toBe('main')
    expect(summary.configName).toBe('dev')
    await runner.stopAll(500)
  })

  it('inherits the workspace-root config when the worktree has none', async () => {
    await mkdir(worktree, { recursive: true })
    // root already has a config from the previous test; worktree intentionally has none
    const handle = await runner.run(worktree, 'dev', {
      identity: { workspaceId: 'wa', scopePath: worktree, branch: 'feat/login' },
      inheritFrom: root,
    })
    expect(handle.configName).toBe('dev')
    const entry = [...runner.getAllRunning().entries()].find(([, h]) => h.pid === handle.pid)
    expect(entry![1].scopePath).toBe(worktree)
    await runner.stopAll(500)
  })

  it('rejects an inherited config whose cwd escapes the target worktree', async () => {
    await writeConfig(root, { cwd: root })
    await rm(join(worktree, '.janusX'), { recursive: true, force: true }).catch(() => undefined)
    await expect(
      runner.run(worktree, 'dev', { inheritFrom: root }),
    ).rejects.toThrow(/outside the target directory/)
  })

  it('throws when neither target nor inheritFrom has a config', async () => {
    const bare = join(root, 'bare')
    await mkdir(bare, { recursive: true })
    await expect(runner.run(bare, 'dev', { inheritFrom: join(root, 'missing') })).rejects.toThrow(
      /No configuration found/,
    )
  })
})
