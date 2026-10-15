import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TitlebarToolGroup } from '../../src/renderer/src/components/TitlebarToolGroup'
import { useWorkspaceStore } from '../../src/renderer/src/stores/workspace'
import {
  addPaneContentToTree,
  createBrowserPaneContent,
  createMarkdownPaneContent,
  createTerminalPaneContent,
  addTerminalToPaneTree,
} from '../../src/renderer/src/lib/workspace-pane'

vi.mock('../../src/renderer/src/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

function seedTree() {
  return addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-1', 'workspace-1'), 'pane-1').tree
}

function render() {
  return renderToStaticMarkup(createElement(TitlebarToolGroup))
}

describe('TitlebarToolGroup', () => {
  it('renders one expandable trigger while closed, not the two flat entries', () => {
    useWorkspaceStore.setState({ paneTree: seedTree() })
    const html = render()

    expect(html).toContain('data-id="tool-menu"')
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    // 触发器是一枚通用工具图标 + 小箭头，不是工具图标的拼排——工具都住在菜单里
    expect(html.match(/<svg/g)?.length).toBe(2)
    // 收起时菜单不在 DOM：浏览器/Markdown 只作为展开后的条目存在
    expect(html).not.toContain('data-id="browser"')
    expect(html).not.toContain('data-id="markdown"')
  })

  it('keeps the trigger usable even when both tools are already open', () => {
    useWorkspaceStore.setState({
      paneTree: addPaneContentToTree(
        addPaneContentToTree(seedTree(), 'pane-1', createBrowserPaneContent('surface-1'), 'pane-1').tree,
        'pane-1',
        createMarkdownPaneContent('workspace-1'),
        'pane-1',
      ).tree,
    })
    const html = render()

    // 已打开的置灰语义落在菜单条目上；触发器保持可展开，菜单里能看到两项各自的状态
    expect(html).toContain('data-id="tool-menu"')
    expect(html).not.toMatch(/data-id="tool-menu"[^>]*disabled/)
  })
})
