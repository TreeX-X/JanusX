import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceAgentRuntime } from '../../../src/main/agent/runtime/runtime'
import { registerWorkspaceTools } from '../../../src/main/agent/runtime/tools/workspace-tools'

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
      input: maxBytes === undefined ? { path } : { path, maxBytes },
    },
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
      call: { toolName: 'workspace.read', input: { path: 'notes.txt' } },
    })).resolves.toMatchObject({
      status: 'completed',
      output: {
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
})
