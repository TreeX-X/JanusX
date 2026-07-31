import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectType } from '../../src/shared/ipc/project'
import { chatStream } from '../../src/renderer/src/services/llm'
import {
  analyzeWorkspaceLaunch,
  buildLaunchAssistantMessages,
  parseLaunchAssistantResponse,
  redactWorkspaceExcerpt,
  selectLaunchContextFiles,
  streamWorkspaceLaunchAssistant,
  visibleLaunchAssistantText,
} from '../../src/renderer/src/services/workspace-launch-assistant'

vi.mock('../../src/renderer/src/services/llm', () => ({ chatStream: vi.fn() }))

const config = {
  version: '0.1.0',
  projectType: ProjectType.Vite,
  projectName: 'demo',
  configurations: [{ name: 'dev', type: ProjectType.Vite, request: 'launch' as const, env: { TOKEN: 'secret' } }],
}

const analysis = {
  workspaceId: 'workspace-1', projectPath: '', relativePath: '',
  detection: { type: ProjectType.Vite, confidence: 0.9, evidence: ['package.json'], candidates: [] },
  candidateConfig: config,
  validation: { valid: true, errors: [], warnings: [] },
  files: ['package.json'], excerpts: [{ path: 'package.json', content: '{"scripts":{"dev":"vite","test":"vitest"}}' }],
}

describe('workspace launch assistant', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('redacts config environment values in model context', () => {
    const messages = buildLaunchAssistantMessages({ request: '优化配置', analysis, config })
    expect(JSON.stringify(messages)).not.toContain('secret')
    expect(JSON.stringify(messages)).toContain('[REDACTED]')
  })

  it('treats user launch intent as authoritative and shares managed process context', () => {
    const messages = buildLaunchAssistantMessages({
      request: '虽然是 CMake，但请用 scripts/start.cmd 启动',
      analysis,
      config,
      runningProjects: [{
        id: 'C:\\workspace::dev::1',
        pid: 42,
        type: ProjectType.Custom,
        name: 'external-script',
        startTime: '2026-07-31T00:00:00.000Z',
        uptime: 100,
      }],
    })
    const prompt = JSON.stringify(messages)

    expect(prompt).toContain('Detected project type is advisory evidence')
    expect(prompt).toContain('type \\\"custom\\\"')
    expect(prompt).toContain('external-script')
    expect(prompt).toContain('save, test, run, stop')
  })

  it('parses a fenced structured response and validates actions', () => {
    expect(parseLaunchAssistantResponse('```json\n{"message":"ok","config":null,"action":"test","testScript":"test:unit"}\n```')).toEqual({
      message: 'ok', config: null, action: 'test', testScript: 'test:unit',
    })
    expect(parseLaunchAssistantResponse('{"message":"no","action":"shell","testScript":"test;rm"}')).toEqual({
      message: 'no', config: null, action: 'none', testScript: undefined,
    })
    expect(parseLaunchAssistantResponse('{"message":"stopping","action":"stop"}')).toMatchObject({
      message: 'stopping', action: 'stop',
    })
  })

  it('parses the hidden action envelope without exposing it in the message', () => {
    expect(parseLaunchAssistantResponse([
      '配置已准备好。',
      '<janus-launch-action>{"config":null,"action":"run","testScript":null}</janus-launch-action>',
    ].join('\n'))).toEqual({
      message: '配置已准备好。', config: null, action: 'run', testScript: undefined,
    })
  })

  it('degrades truncated structured output instead of throwing', () => {
    expect(parseLaunchAssistantResponse(
      '分析完成。<janus-launch-action>{"config":{"version":"0.1.0"',
    )).toMatchObject({ message: '分析完成。', config: null, action: 'none' })

    expect(parseLaunchAssistantResponse('{"message":"保留已完成的答复","config":')).toMatchObject({
      message: '保留已完成的答复', config: null, action: 'none',
    })
  })

  it('hides complete and partial action markers while streaming', () => {
    expect(visibleLaunchAssistantText('正在分析<janus-la')).toBe('正在分析')
    expect(visibleLaunchAssistantText(
      '正在分析<janus-launch-action>{"action":"none"}</janus-launch-action>',
    )).toBe('正在分析')
  })

  it('streams only visible prose and returns the parsed action', () => {
    let emitDelta: ((delta: string) => void) | undefined
    let emitDone: (() => void) | undefined
    vi.mocked(chatStream).mockImplementation((_messages, onDelta, onDone) => {
      emitDelta = onDelta
      emitDone = onDone
      return { abort: vi.fn() }
    })
    const onDelta = vi.fn()
    const onDone = vi.fn()

    streamWorkspaceLaunchAssistant({
      request: '运行项目', analysis, config, onDelta, onDone, onError: vi.fn(),
    })
    emitDelta?.('可以启动。<janus-la')
    emitDelta?.('unch-action>{"config":null,"action":"run"}</janus-launch-action>')
    emitDone?.()

    expect(onDelta).toHaveBeenCalledTimes(1)
    expect(onDelta).toHaveBeenCalledWith('可以启动。')
    expect(onDone).toHaveBeenCalledWith({
      message: '可以启动。', config: null, action: 'run', testScript: undefined,
    })
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
