import { mkdir, mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { listRegisteredWorkspaces, resolveRegisteredWorkspace } from '../../src/main/companion/workspace-registry'

describe('registered workspace resolver', () => {
  it('rejects invalid ids, mismatches, missing paths, and non-directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'janusx-workspaces-'))
    await expect(resolveRegisteredWorkspace(root, '../bad')).rejects.toThrow('Invalid workspace id')
    await writeFile(join(root, 'ws-mismatch.json'), JSON.stringify({ id: 'other', name: 'Bad', path: root }))
    await expect(resolveRegisteredWorkspace(root, 'ws-mismatch')).rejects.toThrow('Invalid registered workspace')
    await writeFile(join(root, 'ws-missing.json'), JSON.stringify({ id: 'ws-missing', name: 'Missing', path: join(root, 'absent') }))
    await expect(resolveRegisteredWorkspace(root, 'ws-missing')).rejects.toThrow()
    const file = join(root, 'plain.txt'); await writeFile(file, 'x')
    await writeFile(join(root, 'ws-file.json'), JSON.stringify({ id: 'ws-file', name: 'File', path: file }))
    await expect(resolveRegisteredWorkspace(root, 'ws-file')).rejects.toThrow('Invalid workspace directory')
  })

  it('skips malformed records while retaining a valid workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'janusx-workspaces-'))
    const project = join(root, 'project'); await mkdir(project)
    await writeFile(join(root, 'broken.json'), '{')
    await writeFile(join(root, 'valid.json'), JSON.stringify({ id: 'valid', name: 'Project', path: project }))
    await expect(listRegisteredWorkspaces(root)).resolves.toEqual([{ id: 'valid', name: 'Project', path: project }])
  })
})
