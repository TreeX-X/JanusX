import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { beginTaskTranscript, readTaskTranscript, removeTaskTranscript, taskRecoveryContext } from '../../src/main/harness/task-transcript'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function root() { const path = await mkdtemp(join(tmpdir(), 'harness-transcript-')); roots.push(path); return path }
const input = { taskUri: 'note://repo/task', baselineHash: 'baseline', attempt: 1, providerId: 'test', modelId: 'test' }
const file = (path: string) => join(path, '.agents/.local/runs/run-1/implementation.json')

describe('durable implementation observations', () => {
  it('flushes live text, associates runtime summaries by tool, and retains interrupted outcomes', async () => {
    const path = await root()
    const writer = await beginTaskTranscript(path, 'run-1', input)
    writer.onEvent({ type: 'text_delta', requestId: writer.id, delta: 'Read the value.' })
    writer.onEvent({ type: 'tool_execution_start', requestId: writer.id, callId: 'todo', toolName: 'todo_write' })
    writer.onEvent({ type: 'tool_execution_start', requestId: writer.id, callId: 'edit', toolName: 'workspace_edit' })
    await writer.flush()
    expect(await readTaskTranscript(path, 'run-1')).toMatchObject({ active: true, turns: [{ status: 'running', text: 'Read the value.' }] })
    await writer.finish('cancelled', { text: 'Read the value.', toolTraces: [{ toolName: 'workspace.edit', workspaceId: 'ws', status: 'completed', summary: 'Edited src/value.txt' }] })
    expect(await readTaskTranscript(path, 'run-1')).toMatchObject({ active: false, turns: [{ status: 'cancelled', tools: [
      { id: 'todo', name: 'todo_write', status: 'interrupted' }, { id: 'edit', status: 'completed', summary: 'Edited src/value.txt' },
    ] }] })
  })

  it('bounds output, summaries, tools and turns, and redacts before disk writes', async () => {
    const path = await root()
    const secret = 'sk-' + 'a'.repeat(48)
    const writer = await beginTaskTranscript(path, 'run-1', input)
    writer.onEvent({ type: 'text_delta', requestId: writer.id, delta: secret + 'x'.repeat(17000) })
    for (let i = 0; i < 70; i++) writer.onEvent({ type: 'tool_execution_start', requestId: writer.id, callId: `${i}`, toolName: 'workspace_read' })
    await writer.flush()
    expect(await readFile(file(path), 'utf8')).not.toContain(secret)
    await writer.finish('failed', undefined, new Error(secret))
    const turn = (await readTaskTranscript(path, 'run-1')).turns[0]
    expect(turn.text.length).toBeLessThanOrEqual(16000)
    expect(turn.tools).toHaveLength(64)
    expect(turn.truncated).toBe(true)
    expect(turn.error).not.toContain(secret)
    for (let attempt = 2; attempt < 11; attempt++) {
      const next = await beginTaskTranscript(path, 'run-1', { ...input, attempt })
      await next.finish('completed', { text: `attempt ${attempt}`, toolTraces: [{ toolName: 'workspace.read', workspaceId: 'ws', status: 'completed', summary: 'x'.repeat(600) }] })
    }
    const history = await readTaskTranscript(path, 'run-1')
    expect(history.turns.map((turn) => turn.attempt)).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
    expect(history.turns.at(-1)?.tools[0].summary?.length).toBe(512)
  })

  it('recovers only matching task/baseline observations without replay and isolates runs', async () => {
    const path = await root()
    const first = await beginTaskTranscript(path, 'run-1', input)
    await first.finish('failed', { text: 'first observation', toolTraces: [] })
    const second = await beginTaskTranscript(path, 'run-1', { ...input, attempt: 2 })
    expect(second.recovery).toContain('untrusted')
    expect(second.recovery).toContain('first observation')
    await second.finish('completed')
    const history = await readTaskTranscript(path, 'run-1')
    expect(taskRecoveryContext(history, input.taskUri, 'new-baseline')).toBe('')
    expect(taskRecoveryContext(history, 'note://repo/other', input.baselineHash)).toBe('')
    const other = await beginTaskTranscript(path, 'run-2', input)
    expect(other.recovery).toBe('')
    await other.finish('completed')
  })

  it('projects abandoned running turns and tools as interrupted after a host restart', async () => {
    const path = await root()
    const writer = await beginTaskTranscript(path, 'run-1', input)
    await writer.finish('completed')
    const data = JSON.parse(await readFile(file(path), 'utf8'))
    data.turns[0].status = 'running'
    data.turns[0].tools = [{ id: 'call', name: 'workspace.edit', status: 'running' }]
    await writeFile(file(path), JSON.stringify(data))
    expect((await readTaskTranscript(path, 'run-1')).turns[0]).toMatchObject({ status: 'interrupted', tools: [{ status: 'interrupted' }] })
    const resumed = await beginTaskTranscript(path, 'run-1', input)
    expect(resumed.recovery).toContain('interrupted')
    await resumed.finish('completed')
  })

  it('refuses concurrent writers and close while live; explicit close removes only history', async () => {
    const path = await root()
    const writer = await beginTaskTranscript(path, 'run-1', input)
    await expect(beginTaskTranscript(path, 'run-1', input)).rejects.toMatchObject({ code: 'BUSY' })
    await expect(removeTaskTranscript(path, 'run-1')).rejects.toMatchObject({ code: 'BUSY' })
    await writer.finish('completed')
    await removeTaskTranscript(path, 'run-1')
    expect((await readTaskTranscript(path, 'run-1')).turns).toEqual([])
  })

  it('refuses corrupt history, traversal and linked local directories without overwriting', async () => {
    const path = await root()
    const writer = await beginTaskTranscript(path, 'run-1', input)
    await writer.finish('completed')
    await writeFile(file(path), '{corrupt')
    await expect(beginTaskTranscript(path, 'run-1', input)).rejects.toMatchObject({ code: 'RECOVERY_REQUIRED' })
    expect(await readFile(file(path), 'utf8')).toBe('{corrupt')
    await expect(readTaskTranscript(path, '../outside')).rejects.toMatchObject({ code: 'SCHEMA_INVALID' })
    const linked = await root()
    const outside = await root()
    await mkdir(join(linked, '.agents'))
    await symlink(outside, join(linked, '.agents/.local'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(beginTaskTranscript(linked, 'run-1', input)).rejects.toBeDefined()
    await expect(readFile(join(outside, 'runs/run-1/implementation.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
