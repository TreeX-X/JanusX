import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { push } from '../../src/main/git/service'

const execFileAsync = promisify(execFile)

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd })
  return stdout.trim()
}

describe('Git service push', () => {
  let root = ''
  let repository = ''
  let remote = ''

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'janusx-git-service-'))
    repository = join(root, 'repository')
    remote = join(root, 'remote.git')

    await execFileAsync('git', ['init', '--bare', remote])
    await execFileAsync('git', ['init', '-b', 'main', repository])
    await git(repository, 'config', 'user.name', 'JanusX Test')
    await git(repository, 'config', 'user.email', 'janusx@example.test')
    await writeFile(join(repository, 'README.md'), '# test\n')
    await git(repository, 'add', 'README.md')
    await git(repository, 'commit', '-m', 'initial commit')
    await git(repository, 'remote', 'add', 'origin', remote)
  })

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('sets the upstream automatically on the first push', async () => {
    await push(repository)

    await expect(git(repository, 'rev-parse', '--abbrev-ref', '@{upstream}')).resolves.toBe('origin/main')
    await expect(git(remote, 'rev-parse', '--verify', 'refs/heads/main')).resolves.toMatch(/^[0-9a-f]{40}$/)
  })

  it('reports a clear error when no remote is configured', async () => {
    await git(repository, 'remote', 'remove', 'origin')

    await expect(push(repository)).rejects.toThrow('No Git remote is configured')
  })
})
