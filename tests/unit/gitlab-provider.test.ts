import { createServer, type Server } from 'node:http'
import { execFile, execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitlabConfigStore } from '../../src/main/hosted/gitlab-config'
import { GitlabProvider, parseGitlabIssues, parseGitlabNotes, parseJobs, parseMrs, projectPath } from '../../src/main/hosted/gitlab'

const execFileAsync = promisify(execFile)
const roots: string[] = []
const servers: Server[] = []

function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()))
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  delete process.env.GITLAB_TOKEN
})

beforeEach(() => {
  delete process.env.GITLAB_TOKEN
})

async function userDataDir() {
  const path = await mkdtemp(join(tmpdir(), 'gitlab-provider-'))
  roots.push(path)
  return path
}

describe('parseMrs', () => {
  it('maps states including legacy WIP drafts', () => {
    const reviews = parseMrs([
      { iid: 7, title: 'Auth', state: 'opened', target_branch: 'main', source_branch: 'feat', web_url: 'https://h/t/a/-/merge_requests/7' },
      { iid: 8, title: 'Wip', state: 'opened', work_in_progress: true, target_branch: 'main', source_branch: 'wip' },
      { iid: 9, title: 'Done', state: 'merged', target_branch: 'main', source_branch: 'old' },
      { iid: 10, title: 'Drop', state: 'closed', target_branch: 'main', source_branch: 'drop' },
      { title: 'no-iid' },
    ])
    expect(reviews).toMatchObject([
      { number: 7, state: 'open', base: 'main', head: 'feat', checksState: 'none' },
      { number: 8, state: 'draft' },
      { number: 9, state: 'merged' },
      { number: 10, state: 'closed' },
    ])
  })

  it('rejects non-arrays', () => {
    expect(parseMrs(null)).toEqual([])
  })
})

describe('parseJobs', () => {
  it('treats allowed failures as passing', () => {
    expect(
      parseJobs([
        { id: 1, name: 'build', status: 'success' },
        { id: 2, name: 'flaky', status: 'failed', allow_failure: true },
        { id: 3, name: 'test', status: 'failed' },
        { id: 4, name: 'lint', status: 'running' },
      ]),
    ).toEqual([
      { name: 'build', state: 'pass' },
      { name: 'flaky', state: 'pass' },
      { name: 'test', state: 'fail' },
      { name: 'lint', state: 'pending' },
    ])
  })
})

describe('projectPath', () => {
  it('encodes nested groups', () => {
    expect(projectPath('team', 'app')).toBe('team%2Fapp')
    expect(projectPath('group/sub', 'app')).toBe('group%2Fsub%2Fapp')
    expect(projectPath('', 'app')).toBeNull()
  })
})

describe('parseGitlabIssues', () => {
  it('keeps opened issues with labels', () => {
    expect(
      parseGitlabIssues([
        { iid: 5, title: 'Bug', state: 'opened', web_url: 'https://h/i/5', labels: ['bug'] },
        { iid: 6, title: 'Old', state: 'closed', web_url: 'https://h/i/6' },
      ]),
    ).toEqual([
      { number: 5, title: 'Bug', state: 'open', url: 'https://h/i/5', labels: ['bug'] },
      { number: 6, title: 'Old', state: 'closed', url: 'https://h/i/6', labels: [] },
    ])
  })
})

describe('parseGitlabNotes', () => {
  it('drops system notes and keeps inline positions', () => {
    expect(
      parseGitlabNotes([
        { id: 1, body: 'lgtm', created_at: 't1', author: { username: 'a' } },
        { id: 2, body: 'here', created_at: 't2', author: { username: 'b' }, position: { new_path: 'a.ts', new_line: 3 } },
        { id: 3, body: 'merged it', system: true },
        { id: 4, body: '   ' },
      ]),
    ).toEqual([
      { id: 'gl-1', author: 'a', body: 'lgtm', createdAt: 't1' },
      { id: 'gl-2', author: 'b', body: 'here', path: 'a.ts', line: 3, createdAt: 't2' },
    ])
  })
})

describe.skipIf(!gitAvailable())('GitlabProvider against a stub instance', () => {
  async function stub() {
    const calls: Array<{ method: string; url: string; body: string }> = []
    let origin = ''
    const server = createServer((req, res) => {
      let raw = ''
      req.on('data', (chunk: Buffer) => {
        raw += chunk.toString()
      })
      req.on('end', () => {
        calls.push({ method: req.method ?? '', url: req.url ?? '', body: raw })
        const url = req.url ?? ''
        const json = (status: number, body: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(body))
        }
        if (url === '/api/v4/user') return json(200, { username: 'zhangsan' })
        if (/\/merge_requests\/7\/notes/.test(url) && req.method === 'GET') {
          return json(200, [
            { id: 1, body: 'lgtm', created_at: 't1', author: { username: 'reviewer' } },
          ])
        }
        if (/\/merge_requests\/7\/notes/.test(url) && req.method === 'POST') {
          const parsed = JSON.parse(raw || '{}') as { body?: string }
          if (!parsed.body) return json(400, { message: 'empty' })
          return json(201, { id: 2 })
        }
        if (url.startsWith('/api/v4/projects/team%2Fapp/merge_requests') && req.method === 'GET') {
          return json(200, [
            { iid: 7, title: 'Auth', state: 'opened', target_branch: 'main', source_branch: 'feat', web_url: `${origin}/team/app/-/merge_requests/7` },
          ])
        }
        if (url.startsWith('/api/v4/projects/team%2Fapp/issues') && req.method === 'GET') {
          return json(200, [
            { iid: 5, title: 'Bug', state: 'opened', web_url: `${origin}/team/app/-/issues/5`, labels: ['bug'] },
          ])
        }
        if (url.startsWith('/api/v4/projects/team%2Fapp/merge_requests') && req.method === 'POST') {
          return json(201, { iid: 8, title: 'New', web_url: `${origin}/team/app/-/merge_requests/8` })
        }
        if (/\/merge_requests\/8\/merge/.test(url)) return json(200, { state: 'merged' })
        if (url.includes('/pipelines?')) return json(200, [{ id: 100, status: 'failed' }])
        if (/\/pipelines\/100\/jobs/.test(url)) {
          return json(200, [
            { id: 1001, name: 'test', status: 'failed' },
            { id: 1002, name: 'build', status: 'success' },
          ])
        }
        if (/\/jobs\/1001\/trace/.test(url)) {
          res.writeHead(200, { 'content-type': 'text/plain' })
          res.end('FAILED specs\n')
          return
        }
        return json(404, {})
      })
    })
    servers.push(server)
    const base = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        resolve(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`)
      })
    })
    origin = base
    return { base, calls }
  }

  async function repoWithRemote(remote: string) {
    const dir = await mkdtemp(join(tmpdir(), 'gl-repo-'))
    roots.push(dir)
    const git = (args: string[]) =>
      execFileAsync('git', ['-c', 'user.email=t@l', '-c', 'user.name=t', ...args], { cwd: dir })
    await git(['init', '-b', 'main'])
    await writeFile(join(dir, 'README.md'), '# r\n')
    await git(['add', '-A'])
    await git(['commit', '-m', 'init'])
    await git(['remote', 'add', 'origin', remote])
    return dir
  }

  it('detects only matching instances with a token', async () => {
    const { base } = await stub()
    const dir = await userDataDir()
    const store = new GitlabConfigStore(dir)
    await store.saveConfig({ url: base })
    const provider = new GitlabProvider(store)
    const repo = await repoWithRemote(`${base}/team/app.git`)
    expect(await provider.detect(repo)).toBe(false)
    process.env.GITLAB_TOKEN = 'stub-token'
    expect(await provider.detect(repo)).toBe(true)
    const foreign = await repoWithRemote('https://github.com/o/r.git')
    expect(await provider.detect(foreign)).toBe(false)
  })

  it('lists reviews, checks, logs, creates and merges', async () => {
    const { base } = await stub()
    const dir = await userDataDir()
    const store = new GitlabConfigStore(dir)
    await store.saveConfig({ url: base })
    process.env.GITLAB_TOKEN = 'stub-token'
    const provider = new GitlabProvider(store)
    const repo = await repoWithRemote(`${base}/team/app.git`)

    const reviews = await provider.listReviews(repo, 'feat')
    expect(reviews).toMatchObject([{ number: 7, state: 'open', head: 'feat' }])

    const checks = await provider.getChecks(repo, 'feat')
    expect(checks).toEqual([
      { name: 'test', state: 'fail' },
      { name: 'build', state: 'pass' },
    ])

    const logs = await provider.getFailedLogs(repo, 'feat')
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ name: 'test', truncated: false })
    expect(logs[0].log).toContain('FAILED specs')

    const created = await provider.createReview(repo, {
      title: 'New',
      base: 'main',
      head: 'feat',
      draft: true,
    })
    expect(created).toMatchObject({ number: 8, state: 'draft' })

    await expect(provider.mergeReview(repo, 8)).resolves.toEqual({ merged: true })

    const issues = await provider.listIssues(repo, 'bug')
    expect(issues).toMatchObject([{ number: 5, state: 'open' }])

    const comments = await provider.listComments(repo, 7)
    expect(comments).toEqual([
      { id: 'gl-1', author: 'reviewer', body: 'lgtm', createdAt: 't1' },
    ])
    await expect(provider.postComment(repo, 7, 'ack')).resolves.toEqual({ posted: true })
    await expect(provider.postComment(repo, 7, '  ')).rejects.toThrow('不能为空')
  })
})
