import { describe, expect, it, vi } from 'vitest'
import type { ToolResult } from '../../src/shared/ipc/agent-runtime'
import { createWorkspaceChatSystemPrompt, createWorkspaceChatTools } from '../../src/main/llm/workspace-chat-tools'

function result(overrides: Partial<ToolResult> = {}): ToolResult {
  return {
    workspaceId: 'workspace-1',
    sessionId: 'session-1',
    correlationId: 'call-1',
    toolName: 'workspace.read',
    status: 'completed',
    startedAt: '2026-07-26T00:00:00.000Z',
    completedAt: '2026-07-26T00:00:00.001Z',
    durationMs: 1,
    summary: 'completed',
    output: { content: 'hello' },
    ...overrides,
  }
}

const resources = new Map([
  ['workspace-1', { sessionId: 'session-1', workspaceRoot: 'C:/one', workspaceName: 'One' }],
  ['workspace-2', { sessionId: 'session-2', workspaceRoot: 'C:/two', workspaceName: 'Two' }],
])

describe('workspace chat tools', () => {
  it('routes each call through the explicitly requested trusted workspace session', async () => {
    const executeFunctionCall = vi.fn().mockResolvedValue(result())
    const tools = createWorkspaceChatTools({
      runtime: { executeFunctionCall },
      resources,
      callerId: 'renderer:7',
    })

    await expect(tools.workspace_read.execute({ workspaceId: 'workspace-2', path: 'src/main.ts', maxBytes: 4096 })).resolves.toEqual({ content: 'hello' })
    expect(executeFunctionCall).toHaveBeenCalledWith({
      sessionId: 'session-2',
      call: {
        toolName: 'workspace.read',
        input: { workspaceId: 'workspace-2', path: 'src/main.ts', maxBytes: 4096 },
        evidenceConfidence: 'medium',
      },
    }, 'renderer:7')
  })

  it('returns failed runtime results as structured data instead of throwing', async () => {
    // Throwing here would abort the whole streamText call and cut the reply off.
    const tools = createWorkspaceChatTools({
      runtime: { executeFunctionCall: vi.fn().mockResolvedValue(result({ status: 'failed', error: 'Sensitive path denied' })) },
      resources,
      callerId: 'renderer:7',
    })

    await expect(tools.workspace_read.execute({ workspaceId: 'workspace-1', path: '.env', maxBytes: 4096 }))
      .resolves.toMatchObject({ ok: false, status: 'failed', error: 'Sensitive path denied' })
  })

  it('turns a user denial into guidance the model can continue from', async () => {
    const tools = createWorkspaceChatTools({
      runtime: {
        executeFunctionCall: vi.fn().mockResolvedValue(result({
          toolName: 'workspace.edit', status: 'cancelled', reasonCode: 'APPROVAL_DENIED', output: undefined,
        })),
      },
      resources,
      callerId: 'renderer:7',
    })

    const denied = await tools.workspace_edit.execute({
      workspaceId: 'workspace-1',
      path: 'README.md',
      expectedHash: 'a'.repeat(64),
      replacements: [{ oldText: 'before', newText: 'after' }],
    })
    expect(denied).toMatchObject({ ok: false, userDenied: true, reasonCode: 'APPROVAL_DENIED' })
    expect((denied as { guidance: string }).guidance).toContain('Do not retry')
  })

  it('rejects a workspace identity that was not validated for this Chat', async () => {
    const executeFunctionCall = vi.fn()
    const tools = createWorkspaceChatTools({
      runtime: { executeFunctionCall },
      resources,
      callerId: 'renderer:7',
    })

    await expect(tools.workspace_read.execute({
      workspaceId: 'workspace-3',
      path: 'README.md',
      maxBytes: 4096,
    })).resolves.toMatchObject({ ok: false, error: expect.stringContaining('is not attached') })
    expect(executeFunctionCall).not.toHaveBeenCalled()
  })

  it('reports every executed call through onToolResult for the turn trace', async () => {
    const seen: string[] = []
    const tools = createWorkspaceChatTools({
      runtime: { executeFunctionCall: vi.fn().mockResolvedValue(result()) },
      resources,
      callerId: 'renderer:7',
      onToolResult: (toolResult) => seen.push(toolResult.toolName),
    })

    await tools.workspace_read.execute({ workspaceId: 'workspace-1', path: 'a.ts', maxBytes: 4096 })
    await tools.workspace_search.execute({ workspaceId: 'workspace-1', query: 'needle', path: '', maxResults: 10 })
    expect(seen).toEqual(['workspace.read', 'workspace.read'])
  })

  it('routes workspace file creation with a bounded content preview', async () => {
    const executeFunctionCall = vi.fn().mockResolvedValue(result({
      toolName: 'workspace.create',
      output: { path: 'notes/test.md', checkpointId: 'checkpoint-2' },
    }))
    const tools = createWorkspaceChatTools({
      runtime: { executeFunctionCall },
      resources,
      callerId: 'renderer:7',
    })

    await tools.workspace_create.execute({ workspaceId: 'workspace-1', path: 'notes/test.md', content: 'hello' })

    expect(executeFunctionCall).toHaveBeenCalledWith({
      sessionId: 'session-1',
      call: expect.objectContaining({
        toolName: 'workspace.create',
        input: expect.objectContaining({ path: 'notes/test.md', content: 'hello' }),
        preview: {
          summary: 'Create notes/test.md (5 bytes)',
          paths: ['notes/test.md'],
          detail: 'hello',
          truncated: false,
        },
      }),
    }, 'renderer:7')
  })

  it('routes workspace edits with a bounded custom approval preview', async () => {
    const executeFunctionCall = vi.fn().mockResolvedValue(result({
      toolName: 'workspace.edit',
      output: { path: 'README.md', checkpointId: 'checkpoint-1' },
    }))
    const tools = createWorkspaceChatTools({
      runtime: { executeFunctionCall },
      resources,
      callerId: 'renderer:7',
    })

    await tools.workspace_edit.execute({
      workspaceId: 'workspace-1',
      path: 'README.md',
      expectedHash: 'a'.repeat(64),
      replacements: [{ oldText: 'before', newText: 'after' }],
    })

    expect(executeFunctionCall).toHaveBeenCalledWith({
      sessionId: 'session-1',
      call: expect.objectContaining({
        toolName: 'workspace.edit',
        input: expect.objectContaining({ path: 'README.md', expectedHash: 'a'.repeat(64) }),
        preview: {
          summary: 'Edit README.md with 1 exact replacement',
          paths: ['README.md'],
          detail: 'Replacement 1\n- before\n+ after',
          truncated: false,
        },
      }),
    }, 'renderer:7')
  })

  it('exposes shared launch configuration and process tools with approval previews', async () => {
    const executeFunctionCall = vi.fn().mockResolvedValue(result({ output: { ok: true } }))
    const tools = createWorkspaceChatTools({
      runtime: { executeFunctionCall },
      resources,
      callerId: 'renderer:7',
    })
    const config = {
      version: '0.1.0',
      projectType: 'custom',
      projectName: 'demo',
      configurations: [],
    }

    await tools.project_apply_config.execute({ workspaceId: 'workspace-1', path: 'app', config })
    await tools.project_list_processes.execute({ workspaceId: 'workspace-1' })
    await tools.project_start_process.execute({ workspaceId: 'workspace-1', path: 'app', configName: 'external-script' })
    await tools.project_stop_process.execute({ workspaceId: 'workspace-1', projectId: 'C:/one/app::external-script::1' })

    expect(executeFunctionCall.mock.calls.map(([input]) => input.call.toolName)).toEqual([
      'project.apply-config',
      'project.list-processes',
      'project.start-process',
      'project.stop-process',
    ])
    expect(executeFunctionCall.mock.calls[0][0].call.preview).toMatchObject({
      summary: expect.stringContaining('launch configuration'),
      paths: ['app/.janusX/janusX.launch.json'],
    })
    expect(executeFunctionCall.mock.calls[2][0].call.preview).toMatchObject({
      summary: expect.stringContaining('Start'),
      detail: 'Configuration: external-script',
    })
  })

  it('treats detection as evidence and explicit launch intent as authoritative', () => {
    const prompt = createWorkspaceChatSystemPrompt(resources)

    expect(prompt).toContain('Project detection is evidence, not a command')
    expect(prompt).toContain('Explicit user statements')
    expect(prompt).toContain('project_generate_config.launch')
    expect(prompt).toContain('project_list_processes')
    expect(prompt).toContain('manage unrelated operating-system processes')
  })
})
