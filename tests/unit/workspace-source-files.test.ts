import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadWorkspaceSourceFiles } from '../../src/main/ipc/file-handlers'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('workspace TypeScript source loading', () => {
  it('loads supported source files and skips dependencies and unrelated files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'janusx-definition-'))
    roots.push(root)
    await Promise.all([
      mkdir(join(root, 'src'), { recursive: true }),
      mkdir(join(root, 'node_modules', 'dependency'), { recursive: true }),
    ])
    await Promise.all([
      writeFile(join(root, 'src', 'first.ts'), 'export const first = true\n'),
      writeFile(join(root, 'src', 'second.js'), 'export const second = true\n'),
      writeFile(join(root, 'src', 'notes.md'), '# Notes\n'),
      writeFile(join(root, 'node_modules', 'dependency', 'index.ts'), 'export const ignored = true\n'),
    ])

    const result = await loadWorkspaceSourceFiles(root)

    expect(result.error).toBeUndefined()
    expect(result.truncated).toBe(false)
    expect(result.files.map((file) => file.path).sort()).toEqual([
      join(root, 'src', 'first.ts'),
      join(root, 'src', 'second.js'),
    ].sort())
    expect(result.files.map((file) => file.language).sort()).toEqual(['javascript', 'typescript'])
  })
})
