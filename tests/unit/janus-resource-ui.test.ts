import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { JanusChat } from '../../src/renderer/src/components/janus/JanusChat'
import type { JanusResourceController } from '../../src/renderer/src/components/janus/useJanusChat'

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

describe('Janus resource scope UI', () => {
  it('exposes clear and edit-again actions for the current conversation', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      messages: [{ id: 'prompt-1', role: 'user', content: 'Revise this prompt', timestamp: 1 }],
    }))

    expect(markup).toContain('aria-label="清空当前对话"')
    expect(markup).toContain('aria-label="编辑并重新提问"')
  })

  it('shows one compact workspace attachment menu without scope or analyze chrome', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
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

    expect(markup).toContain('aria-label="Workspace resources"')
    expect(markup).toContain('aria-label="Attach workspace"')
    expect(markup).toContain('aria-haspopup="listbox"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('Add workspace')
    expect(markup).not.toContain('<select')
    expect(markup).not.toContain('>Scope<')
    expect(markup).not.toContain('>Global<')
    expect(markup).not.toContain('Analyze workspace')
  })

  it.each([
    [{ workspaceId: 'one', workspaceName: 'One', workspacePath: 'C:\\one' }, { workspaceId: 'two', workspaceName: 'Two', workspacePath: 'C:\\two' }],
    [],
  ])('offers embedding independently of attached resources %#', (...resources) => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      onAddToWorkspace: vi.fn(),
      resourceController: controller({ resources }),
    }))

    expect(markup).toContain('aria-label="Embed Chat in current workspace"')
    expect(markup).not.toContain('data-active=')
  })

  it('renders all attached resources as passive removable labels', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      resourceController: controller({
        resources: [
          { workspaceId: 'one', workspaceName: 'One', workspacePath: 'C:\\one' },
          { workspaceId: 'two', workspaceName: 'Two', workspacePath: 'C:\\two' },
        ],
      }),
    }))

    expect(markup).toContain('class="janus-resource-label"')
    expect(markup).not.toContain('janus-resource-select')
    expect(markup).not.toContain('data-active=')
    expect(markup).toContain('aria-label="Remove Two"')
  })

  it('renders compact Runtime tool activity below the workspace scope', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      resourceController: controller({
        activities: [{ correlationId: 'call-1', toolName: 'workspace.read', status: 'running' }],
      }),
    }))

    expect(markup).toContain('aria-label="Workspace tool activity"')
    expect(markup).toContain('workspace.read')
    expect(markup).toContain('running')
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

    expect(markup).toContain('aria-label="Workspace edit approval"')
    expect(markup).toContain('role="region"')
    expect(markup).toContain('Approval required')
    expect(markup).toContain('Edit README.md with 1 exact replacement')
    expect(markup).toContain('Replacement 1')
    expect(markup).toContain('aria-label="Approve workspace action"')
    expect(markup).toContain('aria-label="Reject workspace action"')
    expect(markup).toContain('>Approve</span>')
    expect(markup).toContain('>Reject</span>')
  })
})
