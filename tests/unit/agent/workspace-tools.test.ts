import { mkdtemp, mkdir, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceAgentRuntime } from '../../../src/main/agent/runtime/runtime'
import {
  registerWorkspaceTools,
  workspaceListTool,
} from '../../../src/main/agent/runtime/tools/workspace-tools'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'janusx-workspace-tools-'))
  temporaryDirectories.push(directory)
  return directory
}

async function executeRead(root: string, path: string, maxBytes?: number) {
  const runtime = new WorkspaceAgentRuntime(async () => root)
  registerWorkspaceTools(runtime.registry)
  const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: root })
  return runtime.executeTool({
    sessionId: session.id,
    call: {
      toolName: 'workspace.read',
      input: maxBytes === undefined ? { workspaceId: 'workspace-1', path } : { workspaceId: 'workspace-1', path, maxBytes },
    },
  })
}

async function executeList(
  root: string,
  input: Record<string, unknown> = { workspaceId: 'workspace-1' },
) {
  const runtime = new WorkspaceAgentRuntime(async () => root)
  registerWorkspaceTools(runtime.registry)
  const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: root })
  return runtime.executeTool({
    sessionId: session.id,
    call: { toolName: 'workspace.list', input },
  })
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ))
})

describe('workspace.read tool', () => {
  it('registers once and reads UTF-8 text through the runtime executor', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'notes.txt'), 'hello workspace', 'utf-8')
    const runtime = new WorkspaceAgentRuntime(async () => root)

    registerWorkspaceTools(runtime.registry)
    registerWorkspaceTools(runtime.registry)

    expect(runtime.registry.list().filter(({ name }) => name === 'workspace.read')).toHaveLength(1)
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: root })
    await expect(runtime.executeTool({
      sessionId: session.id,
      call: { toolName: 'workspace.read', input: { workspaceId: 'workspace-1', path: 'notes.txt' } },
    })).resolves.toMatchObject({
      status: 'completed',
      output: {
        workspaceId: 'workspace-1',
        path: 'notes.txt',
        encoding: 'utf-8',
        size: 15,
        content: 'hello workspace',
      },
    })
  })

  it.each([
    ['sensitive', '.env', Buffer.from('SECRET=not-exposed')],
    ['binary', 'image.bin', Buffer.from([0x00, 0x01, 0x02, 0x03])],
    ['invalid UTF-8', 'invalid.txt', Buffer.from([0xc3, 0x28])],
  ])('fails closed for %s files', async (_case, path, content) => {
    const root = await temporaryDirectory()
    await writeFile(join(root, path), content)

    const result = await executeRead(root, path)

    expect(result.status).toBe('failed')
    expect(result.output).toBeUndefined()
    expect(result.error).not.toContain(content.toString())
  })

  it('fails closed for outside and oversized files', async () => {
    const state = await temporaryDirectory()
    const root = await temporaryDirectory()
    const outsidePath = join(state, 'outside.txt')
    await writeFile(outsidePath, 'outside secret')
    await writeFile(join(root, 'large.txt'), 'larger than limit')

    const outside = await executeRead(root, outsidePath)
    const oversized = await executeRead(root, 'large.txt', 4)

    expect(outside).toMatchObject({ status: 'failed', output: undefined })
    expect(outside.error).not.toContain('outside secret')
    expect(oversized).toMatchObject({ status: 'failed', output: undefined })
    expect(oversized.error).not.toContain('larger than limit')
  })

  it('requires the explicit workspace resource id to match the session', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'notes.txt'), 'hello workspace', 'utf-8')
    const runtime = new WorkspaceAgentRuntime(async () => root)
    registerWorkspaceTools(runtime.registry)
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: root })

    const missing = await runtime.executeTool({
      sessionId: session.id,
      call: { toolName: 'workspace.read', input: { path: 'notes.txt' } },
    })
    const mismatched = await runtime.executeTool({
      sessionId: session.id,
      call: { toolName: 'workspace.read', input: { workspaceId: 'workspace-2', path: 'notes.txt' } },
    })

    expect(missing).toMatchObject({ status: 'failed', output: undefined })
    expect(missing.error).toContain('Invalid input for tool')
    expect(mismatched).toMatchObject({ status: 'failed', output: undefined })
    expect(mismatched.error).toContain('must match the active workspace resource')
  })
})

describe('workspace.list tool', () => {
  it('registers once and executes as a read-only list action', async () => {
    const root = await temporaryDirectory()
    const runtime = new WorkspaceAgentRuntime(async () => root)

    registerWorkspaceTools(runtime.registry)
    registerWorkspaceTools(runtime.registry)

    expect(runtime.registry.list().filter(({ name }) => name === 'workspace.list')).toHaveLength(1)
    expect(runtime.registry.get('workspace.list')?.actionRisk).toBe('list')
    const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: root })
    await expect(runtime.executeTool({
      sessionId: session.id,
      call: { toolName: 'workspace.list', input: { workspaceId: 'workspace-1' } },
    })).resolves.toMatchObject({
      status: 'completed',
      reasonCode: 'READ_ONLY_ALLOWED',
      policyDecision: { approvalDecision: 'not-required' },
    })
  })

  it('returns a deterministic tree bounded by depth', async () => {
    const root = await temporaryDirectory()
    await mkdir(join(root, 'src', 'nested'), { recursive: true })
    await writeFile(join(root, 'root.txt'), 'root')
    await writeFile(join(root, 'src', 'index.ts'), 'index')
    await writeFile(join(root, 'src', 'nested', 'deep.ts'), 'deep')

    const result = await executeList(root, {
      workspaceId: 'workspace-1',
      path: '',
      depth: 2,
      maxEntries: 20,
    })

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        workspaceId: 'workspace-1',
        path: '',
        depth: 2,
        truncated: false,
        entries: [
          { path: 'src', name: 'src', type: 'directory', depth: 1 },
          { path: 'src/nested', name: 'nested', type: 'directory', depth: 2 },
          { path: 'src/index.ts', name: 'index.ts', type: 'file', depth: 2 },
          { path: 'root.txt', name: 'root.txt', type: 'file', depth: 1 },
        ],
      },
    })
  })

  it('requires the explicit workspace resource id to match the session', async () => {
    const root = await temporaryDirectory()

    const missing = await executeList(root, {})
    const mismatched = await executeList(root, { workspaceId: 'workspace-2' })

    expect(missing).toMatchObject({ status: 'failed', output: undefined })
    expect(missing.error).toContain('Invalid input for tool')
    expect(mismatched).toMatchObject({ status: 'failed', output: undefined })
    expect(mismatched.error).toContain('must match the active workspace resource')
  })

  it.each(['../outside', 'C:\\outside', '/outside'])(
    'rejects paths outside the workspace: %s',
    async (path) => {
      const root = await temporaryDirectory()
      const result = await executeList(root, { workspaceId: 'workspace-1', path })

      expect(result).toMatchObject({ status: 'failed', output: undefined })
      expect(['ABSOLUTE_PATH', 'PATH_TRAVERSAL']).toContain(result.reasonCode)
    },
  )

  it('omits sensitive files, directories, and git metadata', async () => {
    const root = await temporaryDirectory()
    await mkdir(join(root, '.git'))
    await mkdir(join(root, 'secrets'))
    await writeFile(join(root, '.env.local'), 'TOKEN=secret')
    await writeFile(join(root, 'id_rsa'), 'private key')
    await writeFile(join(root, '.git', 'config'), 'git config')
    await writeFile(join(root, 'secrets', 'credentials.json'), 'credentials')
    await writeFile(join(root, 'visible.txt'), 'visible')

    const result = await executeList(root, { workspaceId: 'workspace-1', depth: 4 })

    expect(result.status).toBe('completed')
    expect(result.output).toMatchObject({
      entries: [{ path: 'visible.txt', name: 'visible.txt', type: 'file', depth: 1 }],
    })
  })

  it('does not follow symbolic links', async () => {
    const state = await temporaryDirectory()
    const root = join(state, 'workspace')
    const outside = join(state, 'outside')
    await mkdir(root)
    await mkdir(outside)
    await writeFile(join(root, 'inside.txt'), 'inside')
    await writeFile(join(outside, 'secret.txt'), 'outside secret')
    try {
      await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && ['EACCES', 'EPERM'].includes(String(error.code))) return
      throw error
    }

    const result = await executeList(root, { workspaceId: 'workspace-1', depth: 4 })

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        entries: [{ path: 'inside.txt' }],
      },
    })
    expect(JSON.stringify(result.output)).not.toContain('secret.txt')
  })

  it('enforces entry limits and reports truncation', async () => {
    const root = await temporaryDirectory()
    await writeFile(join(root, 'a.txt'), 'a')
    await writeFile(join(root, 'b.txt'), 'b')
    await writeFile(join(root, 'c.txt'), 'c')

    const result = await executeList(root, { workspaceId: 'workspace-1', maxEntries: 2 })
    const invalidDepth = await executeList(root, { workspaceId: 'workspace-1', depth: 5 })
    const invalidMaxEntries = await executeList(root, { workspaceId: 'workspace-1', maxEntries: 1001 })

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        entries: [{ path: 'a.txt' }, { path: 'b.txt' }],
        truncated: true,
      },
    })
    expect(invalidDepth).toMatchObject({ status: 'failed', output: undefined })
    expect(invalidMaxEntries).toMatchObject({ status: 'failed', output: undefined })
  })

  it('stops before filesystem access when cancelled', async () => {
    const root = await temporaryDirectory()
    const controller = new AbortController()
    controller.abort()

    await expect(workspaceListTool.execute(
      { workspaceId: 'workspace-1' },
      { workspaceId: 'workspace-1', workspaceRoot: root, signal: controller.signal },
    )).rejects.toThrow('workspace.list cancelled')
  })
})
