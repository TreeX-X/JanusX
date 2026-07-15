import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfficeBroker } from '../../../src/main/office/office-broker'
import { OFFICE_MCP_TOOLS } from '../../../src/main/office/office-mcp'

const roots: string[] = []
async function temp(prefix: string): Promise<string> { const value = await mkdtemp(join(tmpdir(), prefix)); roots.push(value); return value }
afterEach(async () => { await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true }))) })

describe('Office structured broker', () => {
  it('publishes exactly the three structured Office tools', () => {
    expect(OFFICE_MCP_TOOLS.map((tool) => tool.name)).toEqual(['office_create', 'office_batch', 'office_help'])
  })
  it('preserves argv/stdin boundaries for exactly create, batch, and help', async () => {
    const root = await temp('janusx-office-broker-')
    const binary = join(root, 'officecli.exe')
    await writeFile(binary, 'binary')
    await mkdir(join(root, 'docs'))
    await writeFile(join(root, 'docs', 'book.xlsx'), 'book')
    const run = vi.fn(async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }))
    const verifyExecutable = async (path: string) => await readFile(path, 'utf8') === 'binary'
    const broker = await OfficeBroker.create(root, binary, { run, verifyExecutable })
    await broker.invoke({ tool: 'office_create', path: 'docs/new file.docx', documentType: 'docx' })
    await broker.invoke({ tool: 'office_batch', path: 'docs/book.xlsx', batch: { set: ['a b', '; rm'] } })
    await broker.invoke({ tool: 'office_help', topic: 'batch' })
    expect(run.mock.calls[0][1]).toEqual(['create', join(root, 'docs', 'new file.docx')])
    expect(run.mock.calls[1][1]).toEqual(['batch', join(root, 'docs', 'book.xlsx'), '--input', '-'])
    expect(run.mock.calls[1][2]).toMatchObject({ input: JSON.stringify({ set: ['a b', '; rm'] }) })
    expect(run.mock.calls[1][2]).toMatchObject({ cwd: root })
    expect(run.mock.calls[2][1]).toEqual(['batch', '--help'])
  })

  it('rejects traversal, extensions, mismatched operations, and symlink escape before execution', async () => {
    const root = await temp('janusx-office-broker-')
    const outside = await temp('janusx-office-outside-')
    const binary = join(root, 'officecli.exe')
    await writeFile(binary, 'binary')
    await symlink(outside, join(root, 'linked'), 'junction')
    const run = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }))
    const broker = await OfficeBroker.create(root, binary, { run, verifyExecutable: async () => true })
    await expect(broker.invoke({ tool: 'office_create', path: '../escape.docx' })).rejects.toThrow(/relative/)
    await expect(broker.invoke({ tool: 'office_create', path: 'notes.txt' })).rejects.toThrow(/extension/)
    await expect(broker.invoke({ tool: 'office_create', path: 'wrong.docx', documentType: 'xlsx' })).rejects.toThrow(/match/)
    await expect(broker.invoke({ tool: 'office_create', path: 'linked/escape.docx' })).rejects.toThrow(/escapes/)
    await expect(broker.invoke({ tool: 'office_create', path: 'safe.docx', binary: 'C:\\evil.exe' } as any)).rejects.toThrow(/argument/)
    await expect(broker.invoke({ tool: 'unknown', path: 'safe.docx' } as any)).rejects.toThrow(/tool/)
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects a binary substituted after provider verification', async () => {
    const root = await temp('janusx-office-broker-')
    const binary = join(root, 'officecli.exe')
    await writeFile(binary, 'verified')
    const run = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '' }))
    const broker = await OfficeBroker.create(root, binary, {
      run,
      verifyExecutable: async (path) => await readFile(path, 'utf8') === 'verified',
    })
    await writeFile(binary, 'substituted')
    await expect(broker.invoke({ tool: 'office_help', topic: 'batch' })).rejects.toThrow(/identity changed/)
    expect(run).not.toHaveBeenCalled()
  })
})
