import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createRegisteredWorkspaceRootResolver,
  resolveTrustedOfficeFile,
} from '../../../src/main/office/office-workspace-guard'

const temporaryDirectories: string[] = []

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'janusx-office-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Office workspace guard', () => {
  it('resolves the root only from a matching registered workspace record', async () => {
    const state = await makeTemporaryDirectory()
    const workspaces = join(state, 'workspaces')
    const root = join(state, 'root')
    await mkdir(workspaces)
    await mkdir(root)
    await writeFile(join(workspaces, 'trusted.json'), JSON.stringify({ id: 'trusted', path: root }))
    await writeFile(join(workspaces, 'mismatch.json'), JSON.stringify({ id: 'other', path: root }))

    const resolveRoot = createRegisteredWorkspaceRootResolver(workspaces)
    expect(await resolveRoot('trusted')).toBe(root)
    expect(await resolveRoot('mismatch')).toBeUndefined()
    expect(await resolveRoot('../trusted')).toBeUndefined()
  })

  it('accepts a regular Office file and returns canonical relative data', async () => {
    const root = await makeTemporaryDirectory()
    await mkdir(join(root, 'reports'))
    await writeFile(join(root, 'reports', 'Q1.DOCX'), 'document')

    const trusted = await resolveTrustedOfficeFile(
      { workspaceId: 'trusted', relPath: 'reports/Q1.DOCX' },
      async () => root,
    )

    expect(trusted.rootPath).toBe(await realpath(root))
    expect(trusted.relPath).toBe('reports/Q1.DOCX')
    expect(trusted.filePath).toBe(await realpath(join(root, 'reports', 'Q1.DOCX')))
  })

  it.each([
    ['absolute path', 'C:\\outside.docx'],
    ['UNC path', '\\\\server\\share\\outside.docx'],
    ['parent traversal', '../outside.docx'],
    ['nested parent traversal', 'reports/../../outside.docx'],
    ['non-Office extension', 'notes.txt'],
  ])('fails closed for %s', async (_name, relPath) => {
    const root = await makeTemporaryDirectory()
    await expect(resolveTrustedOfficeFile({ workspaceId: 'trusted', relPath }, async () => root)).rejects.toMatchObject({
      name: 'OfficeWorkspaceGuardError',
    })
  })

  it('rejects sibling-prefix and junction escapes after realpath', async () => {
    const state = await makeTemporaryDirectory()
    const root = join(state, 'workspace')
    const sibling = join(state, 'workspace-copy')
    await mkdir(root)
    await mkdir(sibling)
    await writeFile(join(sibling, 'outside.docx'), 'document')
    await symlink(sibling, join(root, 'linked'), 'junction')

    await expect(
      resolveTrustedOfficeFile({ workspaceId: 'trusted', relPath: 'linked/outside.docx' }, async () => root),
    ).rejects.toMatchObject({ code: 'OUTSIDE_ROOT' })

    await expect(
      resolveTrustedOfficeFile({ workspaceId: 'trusted', relPath: '../workspace-copy/outside.docx' }, async () => root),
    ).rejects.toMatchObject({ code: 'OUTSIDE_ROOT' })
  })

  it.runIf(process.platform === 'win32')('rejects a mixed-case sibling-prefix junction escape on Windows', async () => {
    const state = await makeTemporaryDirectory()
    const root = join(state, 'Workspace')
    const sibling = join(state, 'wORKSPACE-Escape')
    await mkdir(root)
    await mkdir(sibling)
    await writeFile(join(sibling, 'outside.docx'), 'document')
    await symlink(sibling, join(root, 'linked'), 'junction')

    await expect(
      resolveTrustedOfficeFile(
        { workspaceId: 'trusted', relPath: 'linked/outside.docx' },
        async () => join(state, 'wORKSPACE'),
      ),
    ).rejects.toMatchObject({ code: 'OUTSIDE_ROOT' })
  })

  it('rejects directories with Office-looking names', async () => {
    const root = await makeTemporaryDirectory()
    await mkdir(join(root, 'folder.docx'))

    await expect(
      resolveTrustedOfficeFile({ workspaceId: 'trusted', relPath: 'folder.docx' }, async () => root),
    ).rejects.toMatchObject({ code: 'NOT_OFFICE' })
  })
})
