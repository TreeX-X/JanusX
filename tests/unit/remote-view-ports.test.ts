import { mkdir, mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { createLocalViewPorts, normalizeRelDir } from '../../src/main/remote/view-ports'

async function seed() {
  const root = await mkdtemp(join(tmpdir(), 'janusx-view-'))
  const wsDir = join(root, 'workspaces')
  const repo = join(root, 'repo')
  await mkdir(wsDir, { recursive: true })
  await mkdir(join(repo, 'src'), { recursive: true })
  await writeFile(join(wsDir, 'w1.json'), JSON.stringify({ id: 'w1', name: 'demo', path: repo }))
  await writeFile(join(wsDir, 'broken.json'), '{oops')
  await writeFile(join(repo, 'a.txt'), 'hi')
  await writeFile(join(repo, 'src', 'b.ts'), 'x')
  return { root, wsDir }
}

describe('远控三视图数据源', () => {
  it('工作区摘要带终端计数，损坏记录跳过', async () => {
    const { wsDir } = await seed()
    const view = createLocalViewPorts({
      workspacesDir: wsDir,
      listTerminalInstances: () => [
        { id: 't1', workspaceId: 'w1', status: 'running', outputSeq: 3 },
        { id: 't2', workspaceId: 'w1', status: 'exited', outputSeq: 9 },
      ],
      getOutputReplay: () => null,
    })
    await expect(view.listWorkspaceViews()).resolves.toEqual([{ id: 'w1', name: 'demo', terminalCount: 2 }])
  })

  it('文件树只给相对路径，目录优先排序', async () => {
    const { wsDir } = await seed()
    const view = createLocalViewPorts({
      workspacesDir: wsDir,
      listTerminalInstances: () => [],
      getOutputReplay: () => null,
    })
    await expect(view.listFileNodes('w1', '')).resolves.toEqual([
      { name: 'src', relPath: 'src', type: 'directory', hasChildren: true, isGitIgnored: false },
      { name: 'a.txt', relPath: 'a.txt', type: 'file', hasChildren: false, isGitIgnored: false },
    ])
    await expect(view.listFileNodes('w1', 'src')).resolves.toEqual([
      { name: 'b.ts', relPath: 'src/b.ts', type: 'file', hasChildren: false, isGitIgnored: false },
    ])
    await expect(view.listFileNodes('nope', '')).rejects.toMatchObject({ code: 'not-found' })
  })

  it('越界目录一律拒绝', async () => {
    const { wsDir } = await seed()
    const view = createLocalViewPorts({
      workspacesDir: wsDir,
      listTerminalInstances: () => [],
      getOutputReplay: () => null,
    })
    for (const evil of ['..', '../x', 'a/../../b', '..\\win']) {
      await expect(view.listFileNodes('w1', evil)).rejects.toMatchObject({ code: 'forbidden' })
    }
    // 绝对路径输入被关进工作区 jail：逃不出去，不存在即 not-found。
    await expect(view.listFileNodes('w1', '/etc')).rejects.toMatchObject({ code: 'not-found' })
    expect(normalizeRelDir('a//b/')).toBe('a/b')
  })

  it('终端状态透传 terminalManager', async () => {
    const { wsDir } = await seed()
    const getOutputReplay = vi.fn(() => ({ data: 'out', seq: 5 }))
    const view = createLocalViewPorts({
      workspacesDir: wsDir,
      listTerminalInstances: () => [{ id: 't1', workspaceId: 'w1', status: 'running', outputSeq: 5 }],
      getOutputReplay,
    })
    await expect(view.listTerminalViews()).resolves.toEqual([
      { terminalId: 't1', workspaceId: 'w1', status: 'running', seq: 5 },
    ])
    await expect(view.getTerminalReplay('t1')).resolves.toEqual({ data: 'out', seq: 5 })
    await expect(view.getTerminalReplay('missing')).resolves.toEqual({ data: 'out', seq: 5 })
    expect(getOutputReplay).toHaveBeenCalledWith('missing')
  })
})
