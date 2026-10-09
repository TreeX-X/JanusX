import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectType, type LaunchConfig, type RunningProjectSummary } from '../../src/shared/ipc/project'
import type { ChatToolTraceEntry, ChatWorkspaceResource } from '../../src/shared/ipc/llm'
import type { LaunchConfigChange } from '../../src/shared/launch-config-chat'
import { chatStream } from '../../src/renderer/src/services/llm'
import {
  analyzeWorkspaceLaunch,
  buildLaunchAssistantMessages,
  LAUNCH_ASSISTANT_TOOL_ALLOWLIST,
  redactWorkspaceExcerpt,
  selectLaunchContextFiles,
  streamWorkspaceLaunchAssistant,
} from '../../src/renderer/src/services/workspace-launch-assistant'

vi.mock('../../src/renderer/src/services/llm', () => ({ chatStream: vi.fn() }))

const config: LaunchConfig = {
  version: '0.1.0',
  projectType: ProjectType.Vite,
  projectName: 'demo',
  configurations: [{ name: 'dev', type: ProjectType.Vite, request: 'launch', env: { TOKEN: 'secret' } }],
}

const analysis = {
  workspaceId: 'workspace-1', projectPath: 'apps/web', relativePath: 'apps/web',
  detection: { type: ProjectType.Vite, confidence: 0.9, evidence: ['package.json'], candidates: [] },
  candidateConfig: config,
  validation: { valid: true, errors: [], warnings: [] },
  files: ['package.json'], excerpts: [{ path: 'package.json', content: '{"scripts":{"dev":"vite","test":"vitest"}}' }],
}

const resources: ChatWorkspaceResource[] = [
  { workspaceId: 'workspace-1', workspacePath: 'C:/ws', workspaceName: 'ws', agentSessionId: 'session-1' },
]

describe('workspace launch assistant', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('pins the assistant tool surface to read-only workspace tools and launch-config writes', () => {
    expect([...LAUNCH_ASSISTANT_TOOL_ALLOWLIST]).toEqual([
      'workspace.list', 'workspace.read', 'project.detect',
      'launch-config.get', 'launch-config.edit', 'launch-config.apply',
    ])
  })

  it('builds a tool-oriented prompt and retires the action envelope', () => {
    const messages = buildLaunchAssistantMessages({ request: '优化配置', analysis })
    const prompt = JSON.stringify(messages)
    expect(prompt).toContain('launch-config.get')
    expect(prompt).toContain('launch-config.edit')
    expect(prompt).toContain('launch-config.apply')
    expect(prompt).toContain('Detected project type is advisory evidence')
    expect(prompt).not.toContain('<janus-launch-action>')
  })

  it('shares workspace evidence and managed process context', () => {
    const runningProjects: RunningProjectSummary[] = [{
      id: 'C:\\workspace::dev::1',
      pid: 42,
      type: ProjectType.Custom,
      name: 'external-script',
      startTime: '2026-07-31T00:00:00.000Z',
      uptime: 100,
    }]
    const prompt = JSON.stringify(buildLaunchAssistantMessages({
      request: '虽然是 CMake，但请用 scripts/start.cmd 启动', analysis, runningProjects,
    }))
    expect(prompt).toContain('external-script')
    expect(prompt).toContain('package.json')
    expect(prompt).toContain('type \\\"custom\\\"')
  })

  it('keeps only the recent history tail', () => {
    const history = Array.from({ length: 12 }, (_, index) => ({ role: 'user' as const, content: `m${index}` }))
    const messages = buildLaunchAssistantMessages({ request: 'r', analysis, history })
    const carried = messages.filter((message) => /^m\d+$/.test(message.content)).map((message) => message.content)
    expect(carried).toEqual(['m4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11'])
  })

  it('streams through the tool surface, sending the draft, resources and traces', () => {
    let emitDelta: ((delta: string) => void) | undefined
    let emitDone: (() => void) | undefined
    let options: Record<string, unknown> | undefined
    vi.mocked(chatStream).mockImplementation((_messages, onDelta, onDone, _onError, opts) => {
      emitDelta = onDelta
      emitDone = onDone
      options = opts as Record<string, unknown>
      return { abort: vi.fn() }
    })
    const onDelta = vi.fn()
    const onDone = vi.fn()
    const onConfigChange = vi.fn()
    const onToolTraces = vi.fn()
    const traces: ChatToolTraceEntry[] = [
      { toolName: 'workspace.read', workspaceId: 'workspace-1', status: 'completed', summary: 'read package.json' },
    ]

    streamWorkspaceLaunchAssistant({
      request: '运行 debug 版 start.exe', analysis, config, projectPath: 'apps/web',
      workspaceResources: resources, toolTraces: traces,
      onDelta, onReasoningDelta: vi.fn(), onConfigChange, onToolTraces, onDone, onError: vi.fn(),
    })

    expect(options).toMatchObject({
      sourceTag: 'launch-assistant',
      workspacePath: 'C:/ws',
      workspaceResources: resources,
      toolAllowlist: [...LAUNCH_ASSISTANT_TOOL_ALLOWLIST],
      toolTraces: traces,
      launchDraft: { config, projectPath: 'apps/web' },
    })

    emitDelta?.('可以启动。')
    emitDone?.()
    expect(onDelta).toHaveBeenCalledWith('可以启动。')
    expect(onDone).toHaveBeenCalledWith('可以启动。')
  })

  it('round-trips config_change and tool traces through the stream callbacks', () => {
    let options: Record<string, any> | undefined
    vi.mocked(chatStream).mockImplementation((_m, _d, _done, _e, opts) => {
      options = opts as Record<string, any>
      return { abort: vi.fn() }
    })
    const onConfigChange = vi.fn()
    const onToolTraces = vi.fn()
    streamWorkspaceLaunchAssistant({
      request: 'run', analysis, config, projectPath: 'apps/web', workspaceResources: resources,
      onDelta: vi.fn(), onReasoningDelta: vi.fn(), onConfigChange, onToolTraces, onDone: vi.fn(), onError: vi.fn(),
    })
    const change: LaunchConfigChange = {
      id: 'c1', config, summary: 'set configurations[0].program', validation: { valid: true, errors: [], warnings: [] },
    }
    options?.onAgentEvent({ type: 'config_change', requestId: 'r', change })
    expect(onConfigChange).toHaveBeenCalledWith(change)

    const edited: ChatToolTraceEntry = { toolName: 'launch-config.edit', workspaceId: 'workspace-1', status: 'completed', summary: 'edit' }
    options?.onToolTrace([edited])
    expect(onToolTraces).toHaveBeenCalledWith([edited])
  })

  it('redacts common secrets from workspace excerpts', () => {
    expect(redactWorkspaceExcerpt('API_KEY=abc123\nhttps://user:pass@example.com')).toBe('API_KEY=[REDACTED]\nhttps://[REDACTED]@example.com')
  })

  it('prioritizes stable project manifests and excludes tool worktrees', () => {
    expect(selectLaunchContextFiles([
      '.claude/worktrees/session/package.json',
      'packages/core/README.md',
      'packages/core/package.json',
      'README.md',
      'package.json',
      'test-results/run/package.json',
    ])).toEqual([
      'package.json',
      'README.md',
      'packages/core/package.json',
      'packages/core/README.md',
    ])

    expect(selectLaunchContextFiles([
      'apps/web/package.json',
      'apps/web/README.md',
      'package.json',
    ], 'apps/web')).toEqual([
      'apps/web/package.json',
      'apps/web/README.md',
    ])
  })

  it('continues analysis when an optional manifest changes during reading', async () => {
    const executePlannerStep = vi.fn()
      .mockResolvedValueOnce({ status: 'completed', output: { entries: [{ path: 'package.json', type: 'file' }] } })
      .mockResolvedValueOnce({ status: 'completed', output: { type: ProjectType.Vite, confidence: 1, evidence: ['package.json'], candidates: [], availableScripts: ['dev'] } })
      .mockResolvedValueOnce({ status: 'completed', output: { config, validation: { valid: true, errors: [], warnings: [] } } })
    const cancelSession = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', {
      electron: {
        agentRuntime: {
          createSession: vi.fn().mockResolvedValue({ id: 'session-1' }),
          executePlannerStep,
          executeFunctionCall: vi.fn().mockResolvedValue({
            status: 'failed',
            error: 'Workspace target changed during authorization',
            reasonCode: 'TARGET_CHANGED',
          }),
          cancelSession,
        },
      },
    })

    await expect(analyzeWorkspaceLaunch({
      workspaceId: 'workspace-1',
      workspaceRoot: 'C:\\workspace',
    })).resolves.toMatchObject({
      candidateConfig: config,
      files: ['package.json'],
      excerpts: [],
    })
    expect(cancelSession).toHaveBeenCalledWith('session-1')
  })

  it('reads the project root manifest even when a tool worktree fills the listing', async () => {
    const executePlannerStep = vi.fn()
      .mockResolvedValueOnce({ status: 'completed', output: { entries: [{ path: '.claude/worktrees/session/package.json', type: 'file' }] } })
      .mockResolvedValueOnce({ status: 'completed', output: { type: ProjectType.Vite, confidence: 1, evidence: ['package.json'], candidates: [], availableScripts: ['dev'] } })
      .mockResolvedValueOnce({ status: 'completed', output: { config, validation: { valid: true, errors: [], warnings: [] } } })
    vi.stubGlobal('window', {
      electron: {
        agentRuntime: {
          createSession: vi.fn().mockResolvedValue({ id: 'session-1' }),
          executePlannerStep,
          executeFunctionCall: vi.fn().mockImplementation(({ call }) => Promise.resolve(
            call.input.path === 'package.json'
              ? { status: 'completed', output: { content: '{"scripts":{"dev":"vite"}}' } }
              : { status: 'failed', error: 'Workspace target is unavailable' },
          )),
          cancelSession: vi.fn().mockResolvedValue(undefined),
        },
      },
    })

    await expect(analyzeWorkspaceLaunch({
      workspaceId: 'workspace-1',
      workspaceRoot: 'C:\\workspace',
    })).resolves.toMatchObject({
      files: ['package.json'],
      excerpts: [{ path: 'package.json', content: '{"scripts":{"dev":"vite"}}' }],
    })
  })
})
