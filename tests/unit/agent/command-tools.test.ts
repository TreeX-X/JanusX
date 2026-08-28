import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceAgentRuntime } from '../../../src/main/agent/runtime/runtime'
import { commandExecutionMode, registerCommandTools } from '../../../src/main/agent/runtime/tools/command-tools'

const temporaryDirectories: string[] = []

async function createRuntime() {
  const root = await mkdtemp(join(tmpdir(), 'janusx-command-tools-'))
  temporaryDirectories.push(root)
  const runtime = new WorkspaceAgentRuntime(async () => root)
  registerCommandTools(runtime.registry)
  const session = await runtime.createSession({ workspaceId: 'workspace-1', workspaceRoot: root })
  return { root, runtime, session }
}

function approve(runtime: WorkspaceAgentRuntime): void {
  runtime.onEvent((event) => {
    if (event.type !== 'approval-requested') return
    runtime.resolveApproval({
      approvalId: event.request.id,
      approved: true,
      workspaceId: event.request.workspaceId,
      sessionId: event.request.sessionId,
      correlationId: event.request.correlationId,
      toolName: event.request.toolName,
      actionRisk: event.request.actionRisk,
    })
  })
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('command Agent Runtime tool', () => {
  it('uses the Windows shell only for the explicit compatibility shim set', () => {
    expect(commandExecutionMode('npm', 'win32')).toBe('windows-shell-shim')
    expect(commandExecutionMode('scripts/start.cmd', 'win32')).toBe('windows-shell-shim')
    expect(commandExecutionMode('node.exe', 'win32')).toBe('direct')
    expect(commandExecutionMode('node', 'linux')).toBe('direct')
  })

  it('runs one structured command and returns bounded output and exit state', async () => {
    const { runtime, session } = await createRuntime()
    approve(runtime)
    const program = basename(process.execPath)
    const result = await runtime.executeTool({
      sessionId: session.id,
      call: {
        toolName: 'command.run',
        input: { workspaceId: 'workspace-1', program, args: ['-e', 'process.stdout.write("command-ok")'], timeoutMs: 5_000 },
        preview: { summary: `Run ${program}`, paths: [''], detail: 'print command-ok', truncated: false },
      },
    })
    expect(result).toMatchObject({
      status: 'completed',
      output: {
        ok: true, exitCode: 0, stdout: 'command-ok', stderr: '', timedOut: false,
        outputTruncated: false, executionMode: 'direct',
      },
    })
  })

  it('returns a nonzero exit without disguising it as a successful command', async () => {
    const { runtime, session } = await createRuntime()
    approve(runtime)
    const result = await runtime.executeTool({
      sessionId: session.id,
      call: {
        toolName: 'command.run',
        input: { workspaceId: 'workspace-1', program: basename(process.execPath), args: ['-e', 'process.stderr.write("failed");process.exit(2)'] },
        preview: { summary: 'Run failing command', paths: [''], truncated: false },
      },
    })
    expect(result).toMatchObject({ status: 'completed', output: { ok: false, exitCode: 2, stderr: 'failed' } })
  })

  it('requires approval details and confines cwd and executable paths to the workspace', async () => {
    const { runtime, session } = await createRuntime()
    await expect(runtime.executeTool({
      sessionId: session.id,
      call: { toolName: 'command.run', input: { workspaceId: 'workspace-1', program: basename(process.execPath) } },
    })).resolves.toMatchObject({ status: 'failed', reasonCode: 'PREVIEW_REQUIRED' })

    approve(runtime)
    await expect(runtime.executeTool({
      sessionId: session.id,
      call: {
        toolName: 'command.run',
        input: { workspaceId: 'workspace-1', cwd: '../outside', program: basename(process.execPath) },
        preview: { summary: 'Run outside', paths: ['../outside'], truncated: false },
      },
    })).resolves.toMatchObject({ status: 'failed', reasonCode: 'PATH_TRAVERSAL' })
    await expect(runtime.executeTool({
      sessionId: session.id,
      call: {
        toolName: 'command.run',
        input: { workspaceId: 'workspace-1', program: process.execPath },
        preview: { summary: 'Run absolute executable', paths: [''], truncated: false },
      },
    })).resolves.toMatchObject({ status: 'failed', error: expect.stringContaining('workspace-relative') })
  })

  it('truncates large command output without growing the tool result without bound', async () => {
    const { runtime, session } = await createRuntime()
    approve(runtime)
    const result = await runtime.executeTool({
      sessionId: session.id,
      call: {
        toolName: 'command.run',
        input: { workspaceId: 'workspace-1', program: basename(process.execPath), args: ['-e', 'process.stdout.write("x".repeat(70000))'] },
        preview: { summary: 'Run bounded output command', paths: [''], truncated: false },
      },
    })
    const output = result.output as { stdout: string; outputTruncated: boolean }
    expect(output.outputTruncated).toBe(true)
    expect(Buffer.byteLength(output.stdout)).toBe(64 * 1024)
  })
})
