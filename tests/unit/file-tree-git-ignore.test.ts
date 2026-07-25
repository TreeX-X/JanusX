import { execFile } from 'child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FILE_TREE_CHANNELS, type FileNode } from '../../src/shared/ipc/workspace'

const execFileAsync = promisify(execFile)

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>()
  const watch = vi.fn(() => ({ close: vi.fn(), on: vi.fn() }))
  return { handlers, watch }
})

vi.mock('fs', () => ({ watch: mocks.watch }))

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => mocks.handlers.set(channel, handler),
  },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
}))

import { disposeWorkspaceWatchers, registerWorkspaceHandlers } from '../../src/main/ipc/handlers'

let workspaceRoot: string

function fileTreeHandler(channel: string): (...args: any[]) => Promise<FileNode[]> {
  return mocks.handlers.get(channel) as (...args: any[]) => Promise<FileNode[]>
}

describe('file-tree gitignore state', () => {
  beforeEach(async () => {
    mocks.handlers.clear()
    workspaceRoot = await mkdtemp(join(tmpdir(), 'janusx-file-tree-ignore-'))
    await Promise.all([
      mkdir(join(workspaceRoot, 'docs')),
      mkdir(join(workspaceRoot, 'ignored-dir')),
      mkdir(join(workspaceRoot, 'plain')),
    ])
    await Promise.all([
      writeFile(join(workspaceRoot, '.gitignore'), 'docs/*\nignored-dir/\n*.tmp\n'),
      writeFile(join(workspaceRoot, 'docs', 'guide.md'), 'ignored child'),
      writeFile(join(workspaceRoot, 'ignored-dir', 'note.md'), 'ignored directory'),
      writeFile(join(workspaceRoot, 'plain', 'readme.md'), 'visible'),
      writeFile(join(workspaceRoot, 'scratch.tmp'), 'ignored file'),
    ])
    await execFileAsync('git', ['init', '--quiet'], { cwd: workspaceRoot })
    registerWorkspaceHandlers({ on: vi.fn() } as never)
  })

  afterEach(async () => {
    disposeWorkspaceWatchers()
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('marks only entries directly matched by gitignore rules', async () => {
    const rootNodes = await fileTreeHandler(FILE_TREE_CHANNELS.load)({}, workspaceRoot)
    const rootByName = new Map(rootNodes.map((node) => [node.name, node]))

    expect(rootByName.get('docs')?.isGitIgnored).toBe(false)
    expect(rootByName.get('ignored-dir')?.isGitIgnored).toBe(true)
    expect(rootByName.get('plain')?.isGitIgnored).toBe(false)
    expect(rootByName.get('scratch.tmp')?.isGitIgnored).toBe(true)

    const docsNodes = await fileTreeHandler(FILE_TREE_CHANNELS.children)({}, workspaceRoot, 'docs')
    expect(docsNodes).toEqual([
      expect.objectContaining({ name: 'guide.md', isGitIgnored: true }),
    ])
  })
})
