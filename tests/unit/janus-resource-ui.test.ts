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
  onStop: vi.fn(),
  onRetry: vi.fn(),
  onClear: vi.fn(),
  onOpenLlmConfig: vi.fn(),
}

function controller(overrides: Partial<JanusResourceController> = {}): JanusResourceController {
  return {
    resources: [],
    availableWorkspaces: [],
    activeResourceId: null,
    attachWorkspace: vi.fn(),
    ensureEmbeddedWorkspace: vi.fn(),
    detachWorkspace: vi.fn(),
    selectResource: vi.fn(),
    analysisStatus: 'idle',
    analyzeActiveResource: vi.fn(),
    ...overrides,
  }
}

describe('Janus resource scope UI', () => {
  it('shows global scope and an explicit workspace attachment menu', () => {
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
    expect(markup).toContain('Global')
    expect(markup).toContain('aria-label="Attach workspace"')
    expect(markup).toContain('Workspace One')
    expect(markup).toContain('aria-label="Analyze workspace"')
  })

  it('renders attached and embedded resources with an active target and remove controls', () => {
    const markup = renderToStaticMarkup(createElement(JanusChat, {
      ...commonProps,
      resourceController: controller({
        resources: [
          { workspaceId: 'one', workspaceName: 'One', workspacePath: 'C:\\one', source: 'attached' },
          { workspaceId: 'two', workspaceName: 'Two', workspacePath: 'C:\\two', source: 'embedded' },
        ],
        activeResourceId: 'two',
      }),
    }))

    expect(markup).toContain('data-source="attached"')
    expect(markup).toContain('data-source="embedded"')
    expect(markup).toContain('data-active="true"')
    expect(markup).toContain('aria-label="Remove Two"')
    expect(markup).toContain('embedded')
  })
})
