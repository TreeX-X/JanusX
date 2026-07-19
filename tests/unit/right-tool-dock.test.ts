import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  CENTER_WORKSPACE_MIN_WIDTH,
  getRightDockLayout,
  RIGHT_TOOL_RAIL_WIDTH,
} from '../../src/renderer/src/components/right-tools/layout'
import { RightToolRail } from '../../src/renderer/src/components/right-tools/RightToolRail'
import {
  retryToolErrorBoundary,
  RightToolHost,
} from '../../src/renderer/src/components/right-tools/RightToolHost'
import {
  getTabKeyboardTarget,
  RightToolTabs,
} from '../../src/renderer/src/components/right-tools/RightToolTabs'

describe('right dock layout', () => {
  it('keeps a permanent 48px rail and protects the 320px center', () => {
    expect(RIGHT_TOOL_RAIL_WIDTH).toBe(48)
    expect(CENTER_WORKSPACE_MIN_WIDTH).toBe(320)

    expect(getRightDockLayout({
      availableWidth: 1000,
      panelCollapsed: false,
      officeRendered: false,
      panelWidth: 280,
    })).toMatchObject({
      effectiveCollapsed: false,
      responsiveAutoCollapsed: false,
      panelWidth: 280,
      dockWidth: 328,
    })
  })

  it('clamps the panel to available space and auto-folds below its minimum', () => {
    expect(getRightDockLayout({
      availableWidth: 700,
      panelCollapsed: false,
      officeRendered: false,
      panelWidth: 420,
    })).toMatchObject({ panelWidth: 332, dockWidth: 380 })

    expect(getRightDockLayout({
      availableWidth: 600,
      panelCollapsed: false,
      officeRendered: false,
      panelWidth: 420,
    })).toMatchObject({
      effectiveCollapsed: true,
      responsiveAutoCollapsed: true,
      dockWidth: 48,
    })
  })

  it('renders rail-only for manual collapse and Office without changing panel preference input', () => {
    const manual = getRightDockLayout({
      availableWidth: 1000,
      panelCollapsed: true,
      officeRendered: false,
      panelWidth: 360,
    })
    const office = getRightDockLayout({
      availableWidth: 1000,
      panelCollapsed: false,
      officeRendered: true,
      panelWidth: 360,
    })

    expect(manual).toMatchObject({ effectiveCollapsed: true, dockWidth: 48, panelWidth: 360 })
    expect(office).toMatchObject({ effectiveCollapsed: true, dockWidth: 48, panelWidth: 360 })
  })
})

describe('right dock lifecycle shell', () => {
  it('keeps open tool subtrees mounted and inert when the dock is hidden', () => {
    const markup = renderToStaticMarkup(
      createElement(RightToolHost, {
        openToolIds: ['files', 'git'],
        activeToolId: 'files',
        workspaceId: null,
        workspacePath: null,
        dockVisible: false,
        onClose: vi.fn(),
      }),
    )

    expect(markup).toContain('hidden=""')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('inert=""')
    expect(markup).toContain('right-tool-panel-files')
    expect(markup).toContain('right-tool-panel-git')
  })

  it('clears the error and advances the remount key on retry', () => {
    expect(retryToolErrorBoundary({ failed: true, retryKey: 4 })).toEqual({
      failed: false,
      retryKey: 5,
    })
  })
})

describe('right tool rail', () => {
  it('exposes all tools with non-color-only closed, open and active states', () => {
    const markup = renderToStaticMarkup(
      createElement(RightToolRail, {
        openToolIds: ['files', 'git'],
        activeToolId: 'git',
        collapsed: false,
        panelToggleDisabled: false,
        onToggleTool: vi.fn(),
        onTogglePanel: vi.fn(),
      }),
    )

    expect(markup).toContain('role="toolbar"')
    expect(markup).toContain('data-state="closed"')
    expect(markup).toContain('data-state="open"')
    expect(markup).toContain('data-state="active"')
    expect(markup).toContain('已打开')
    expect(markup).toContain('已关闭')
    expect(markup).not.toContain('office')
  })
})

describe('right tool tabs', () => {
  it('renders only unique open tools in registry order with complete tab ARIA', () => {
    const markup = renderToStaticMarkup(
      createElement(RightToolTabs, {
        openToolIds: ['assist', 'files', 'assist'],
        activeToolId: 'assist',
        onActivate: vi.fn(),
        onClose: vi.fn(),
      }),
    )

    expect(markup.match(/role="tab"/g)).toHaveLength(2)
    expect(markup.indexOf('right-tool-tab-files')).toBeLessThan(markup.indexOf('right-tool-tab-assist'))
    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('aria-controls="right-tool-panel-assist"')
    expect(markup).toContain('aria-selected="true"')
    expect(markup).toContain('aria-label="关闭 Assist"')
  })

  it('resolves roving focus targets for arrows, Home and End', () => {
    const tools = ['files', 'git', 'assist'] as const

    expect(getTabKeyboardTarget('ArrowRight', 'git', tools)).toBe('assist')
    expect(getTabKeyboardTarget('ArrowRight', 'assist', tools)).toBe('files')
    expect(getTabKeyboardTarget('ArrowLeft', 'files', tools)).toBe('assist')
    expect(getTabKeyboardTarget('Home', 'assist', tools)).toBe('files')
    expect(getTabKeyboardTarget('End', 'files', tools)).toBe('assist')
    expect(getTabKeyboardTarget('Delete', 'files', tools)).toBeNull()
  })
})
