import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { JanusChat } from '../../src/renderer/src/components/janus/JanusChat'
import type { JanusResourceController } from '../../src/renderer/src/components/janus/useJanusChat'
import type { UseJanusChatReturn } from '../../src/renderer/src/components/janus/useJanusChat'

const commonProps = {
  visible: true,
  modeColor: '#ff7830',
  messages: [],
  pendingContent: '',
  isStreaming: false,
  error: null,
  onSend: vi.fn(),
  onRewrite: vi.fn(),
  onStop: vi.fn(),
  onRetry: vi.fn(),
  onClear: vi.fn(),
  onOpenLlmConfig: vi.fn(),
}

function controller(overrides: Partial<JanusResourceController> = {}): JanusResourceController {
  return {
    resources: [],
    availableWorkspaces: [],
    attachWorkspace: vi.fn(),
    detachWorkspace: vi.fn(),
    activities: [],
    pendingApprovals: [],
    resolveApproval: vi.fn(),
    ...overrides,
  }
}

function conversationController(overrides: Partial<UseJanusChatReturn> = {}): UseJanusChatReturn {
  return {
    conversationId: 'streaming',
    conversationTitle: 'Streaming thread',
    conversations: [
      { id: 'streaming', title: 'Streaming thread', updatedAt: 2, messageCount: 2, isStreaming: true, hasError: false },
      { id: 'failed', title: 'Failed thread', updatedAt: 1, messageCount: 1, isStreaming: false, hasError: true },
    ],
    messages: [],
    pendingContent: '',
    isStreaming: true,
    error: null,
    modelOptions: [],
    activeModel: null,
    modelNotice: null,
    latestRecallTrace: null,
    toolTraces: [],
    todos: [],
    pendingQuestions: [],
    answerQuestion: vi.fn(),
    resourceController: controller(),
    send: vi.fn(),
    rewrite: vi.fn(),
    stop: vi.fn(),
    retry: vi.fn(),
    clear: vi.fn(),
    selectModel: vi.fn(),
    refreshModels: vi.fn().mockResolvedValue([]),
    createConversation: vi.fn(),
    selectConversation: vi.fn(),
    renameConversation: vi.fn(),
    deleteConversation: vi.fn(),
    approvalMode: 'per-action',
    setApprovalMode: vi.fn(),
    ...overrides,
  }
}

describe('Janus resource scope UI', () => {
  it('exposes message metadata and current-conversation actions', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      messages: [
        { id: 'prompt-1', role: 'user', content: 'Revise this prompt', timestamp: 1 },
        { id: 'answer-1', role: 'assistant', content: 'Answer', timestamp: 2 },
      ],
    }))

    expect(markup).toContain('aria-label="janus:chat.clear.aria"')
    expect(markup).toContain('aria-label="janus:chat.edit.editAria"')
    expect(markup.match(/aria-label="janus:chat.message.copyAria"/g)).toHaveLength(2)
    expect(markup).toContain('aria-label="janus:chat.message.retryAria"')
    expect(markup.match(/class="janus-chat-message-time"/g)).toHaveLength(2)
  })

  it('shows the workspace scope with attach menu and removable chips', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      resourceController: controller({
        resources: [{ workspaceId: 'workspace-one', workspaceName: 'Workspace One', workspacePath: 'C:\\workspace-one' }],
        availableWorkspaces: [{
          id: 'workspace-two',
          name: 'Workspace Two',
          path: 'C:\\workspace-two',
          clis: [],
          layout: { mode: 'tabs', positions: [] },
          createdAt: '2026-07-23T00:00:00.000Z',
          updatedAt: '2026-07-23T00:00:00.000Z',
        }],
      }),
    }))

    expect(markup).toContain('aria-label="janus:chat.resource.scopeAria"')
    expect(markup).toContain('aria-label="janus:chat.resource.attachAria"')
    expect(markup).toContain('aria-haspopup="listbox"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('janus:chat.resource.attachPlaceholder')
    expect(markup).toContain('janus-resource-chip')
    expect(markup).toContain('Workspace One')
    expect(markup).toContain('aria-label="janus:chat.resource.removeAria"')
    expect(markup).not.toContain('<select')
  })

  it('hides the workspace scope in discussion-only embeds', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      discussionOnly: true,
      resourceController: controller({
        availableWorkspaces: [{
          id: 'workspace-one',
          name: 'Workspace One',
          path: 'C:\\workspace-one',
          clis: [],
          layout: { mode: 'tabs', positions: [] },
          createdAt: '2026-07-23T00:00:00.000Z',
          updatedAt: '2026-07-23T00:00:00.000Z',
        }],
      }),
    }))

    expect(markup).not.toContain('janus:chat.resource.scopeAria')
    expect(markup).not.toContain('janus:chat.resource.attachAria')
    expect(markup).not.toContain('janus-resource-chip')
  })

  it('keeps the Island conversation selector enabled while streaming', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      isStreaming: true,
      conversationController: conversationController(),
    }))

    expect(markup).toMatch(/aria-label="janus:chat.thread.selectAria"[^>]*aria-expanded="false"(?![^>]*disabled)/)
  })

  it('renders the agent todo strip above the composer', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      conversationController: conversationController({
        todos: [
          { content: 'Write code', status: 'in_progress' },
          { content: 'Write tests', status: 'pending' },
        ],
      }),
    }))

    expect(markup).toContain('aria-label="janus:chat.todo.aria"')
    expect(markup).toContain('Write code')
    expect(markup).toContain('Write tests')
  })

  it('renders an answerable gate for pending mid-turn questions', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      conversationController: conversationController({
        pendingQuestions: [{
          requestId: 'request-1',
          callId: 'call-9',
          questions: [{ question: 'Proceed?', header: 'Confirm', options: [{ label: 'Yes' }, { label: 'No' }], multiple: false }],
          allowCustom: true,
        }],
      }),
    }))

    expect(markup).toContain('aria-label="janus:chat.question.regionAria"')
    expect(markup).toContain('Proceed?')
    expect(markup).toContain('>Yes<')
    expect(markup).toContain('>No<')
    expect(markup).toContain('>janus:chat.question.submit<')
    expect(markup).toContain('>janus:chat.question.cancel<')
  })

  it('renders compact Runtime tool activity below the workspace scope', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      resourceController: controller({
        activities: [{ correlationId: 'call-1', toolName: 'workspace.read', status: 'running' }],
      }),
    }))

    expect(markup).toContain('aria-label="janus:chat.activity.aria"')
    expect(markup).toContain('workspace.read')
    expect(markup).toContain('running')
  })

  it('renders an explicit Agent permission mode switch', () => {
    const setApprovalMode = vi.fn()
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      conversationController: conversationController({ approvalMode: 'auto-run', setApprovalMode }),
    }))
    expect(markup).toContain('aria-label="janus:chat.permission.aria"')
    expect(markup).toContain('janus-chat-permission-select')
  })

  it('keeps completed live tool cards visible while the response is still streaming', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      isStreaming: true,
      resourceController: controller({
        activities: [{ correlationId: 'call-1', toolName: 'workspace.read', status: 'completed', argsDigest: 'path' }],
      }),
    }))

    expect(markup).toContain('workspace.read')
    expect(markup).toContain('janus:chat.tool.status.completed')
  })

  it('renders a persisted tool trace only below its matching assistant response', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      messages: [
        { id: 'answer-1', role: 'assistant', content: 'First answer', timestamp: 1 },
        { id: 'answer-2', role: 'assistant', content: 'Second answer', timestamp: 2 },
      ],
      toolTraces: [{
        toolName: 'workspace.read',
        workspaceId: 'workspace-1',
        status: 'completed',
        summary: 'Read README.md',
        turnId: 'answer-1',
      }],
    }))

    expect(markup.match(/data-turn="answer-1"/g)).toHaveLength(1)
    expect(markup).not.toContain('data-turn="answer-2"')
  })

  it('renders the custom workspace edit preview before approval', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      resourceController: controller({
        pendingApprovals: [{
          id: 'approval-1',
          sessionId: 'session-1',
          workspaceId: 'workspace-1',
          correlationId: 'call-1',
          toolName: 'workspace.edit',
          input: {},
          evidenceConfidence: 'medium',
          actionRisk: 'write',
          approvalPolicy: 'per-action',
          reasonCode: 'ACTION_REQUIRES_APPROVAL',
          preview: {
            summary: 'Edit README.md with 1 exact replacement',
            paths: ['README.md'],
            detail: 'Replacement 1\n- before\n+ after',
            truncated: false,
          },
          createdAt: '2026-07-26T00:00:00.000Z',
        }],
      }),
    }))

    expect(markup).toContain('aria-label="janus:chat.approval.regionAria"')
    expect(markup).toContain('role="region"')
    expect(markup).toContain('janus:chat.approval.heading')
    expect(markup).toContain('Edit README.md with 1 exact replacement')
    expect(markup).toContain('Replacement 1')
    expect(markup).toContain('aria-label="janus:chat.approval.approveAria"')
    expect(markup).toContain('aria-label="janus:chat.approval.rejectAria"')
    expect(markup).toContain('>janus:chat.approval.approve</span>')
    expect(markup).toContain('>janus:chat.approval.reject</span>')
  })
})
