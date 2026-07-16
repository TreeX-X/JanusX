import { describe, expect, it } from 'vitest'
import {
  addPaneContentToTree,
  addTerminalToPaneTree,
  closePaneTab,
  collapsePaneTree,
  createJanusChatPaneContent,
  createTerminalPaneContent,
  getLeafPanes,
  removeTerminalFromPaneTree,
  resizeSplitPane,
  splitPaneTree,
  unsplitPaneTree,
  type WorkspacePaneNode,
} from '../../src/renderer/src/lib/workspace-pane'

describe('workspace pane tree', () => {
  it('adds terminals into the focused pane and avoids duplicate views', () => {
    const first = addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-1', 'workspace-1'), 'pane-1')
    const second = splitPaneTree(first.tree, 'pane-1', 'horizontal', 'split-1', 'pane-2')
    const moved = addTerminalToPaneTree(
      second.tree,
      'pane-2',
      createTerminalPaneContent('terminal-1', 'workspace-1'),
      'pane-fallback'
    )

    const leaves = getLeafPanes(moved.tree)
    expect(leaves).toHaveLength(1)
    expect(leaves.flatMap((leaf) => leaf.tabs.map((tab) => tab.terminalId))).toEqual(['terminal-1'])
    expect(moved.focus).toEqual({ paneId: 'pane-2', tabId: 'terminal:terminal-1', terminalId: 'terminal-1' })
  })

  it('creates an empty focused pane when splitting', () => {
    const first = addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-1', 'workspace-1'), 'pane-1')
    const split = splitPaneTree(first.tree, 'pane-1', 'vertical', 'split-1', 'pane-2')

    expect(split.focus).toEqual({ paneId: 'pane-2', tabId: null, terminalId: null })
    expect(getLeafPanes(split.tree)).toEqual([
      { type: 'leaf', id: 'pane-1', tabs: [createTerminalPaneContent('terminal-1', 'workspace-1')], activeTabId: 'terminal:terminal-1' },
      { type: 'leaf', id: 'pane-2', tabs: [], activeTabId: null },
    ])
  })

  it('can insert the new split pane before the target pane', () => {
    const first = addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-1', 'workspace-1'), 'pane-1')
    const split = splitPaneTree(first.tree, 'pane-1', 'horizontal', 'split-1', 'pane-2', 'before')

    expect(split.focus).toEqual({ paneId: 'pane-2', tabId: null, terminalId: null })
    expect(getLeafPanes(split.tree).map((leaf) => leaf.id)).toEqual(['pane-2', 'pane-1'])
  })

  it('creates split with custom ratio', () => {
    const first = addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-1', 'workspace-1'), 'pane-1')
    const split = splitPaneTree(first.tree, 'pane-1', 'horizontal', 'split-1', 'pane-2', 'after', 0.3)
    expect((split.tree as any).ratio).toBe(0.3)
  })

  it('merges tabs into the sibling when unsplitting', () => {
    const first = addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-1', 'workspace-1'), 'pane-1')
    const split = splitPaneTree(first.tree, 'pane-1', 'horizontal', 'split-1', 'pane-2')
    const second = addTerminalToPaneTree(split.tree, 'pane-2', createTerminalPaneContent('terminal-2', 'workspace-1'), 'pane-fallback')
    const unsplit = unsplitPaneTree(second.tree, 'pane-2')

    const leaves = getLeafPanes(unsplit.tree)
    expect(leaves).toHaveLength(1)
    expect(leaves[0].tabs.map((tab) => tab.terminalId)).toEqual(['terminal-1', 'terminal-2'])
    expect(unsplit.focus).toEqual({ paneId: 'pane-1', tabId: 'terminal:terminal-2', terminalId: 'terminal-2' })
  })

  it('prunes an empty pane after closing its last visible tab', () => {
    const first = addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-1', 'workspace-1'), 'pane-1')
    const split = splitPaneTree(first.tree, 'pane-1', 'horizontal', 'split-1', 'pane-2')
    const second = addTerminalToPaneTree(split.tree, 'pane-2', createTerminalPaneContent('terminal-2', 'workspace-1'), 'pane-fallback')
    const closed = closePaneTab(second.tree, 'pane-2', 'terminal:terminal-2')

    const leaves = getLeafPanes(closed)
    expect(leaves).toHaveLength(1)
    expect(leaves[0].id).toBe('pane-1')
    expect(leaves[0].tabs.map((tab) => tab.terminalId)).toEqual(['terminal-1'])
  })

  it('prunes moved-from pane when terminal is moved into another pane', () => {
    const top = addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-top', 'workspace-1'), 'pane-top')
    const leftBottom = splitPaneTree(top.tree, 'pane-top', 'horizontal', 'split-top', 'pane-bottom-left')
    const right = splitPaneTree(leftBottom.tree, 'pane-top', 'vertical', 'split-right', 'pane-right')
    const withRightTerminal = addTerminalToPaneTree(
      right.tree,
      'pane-right',
      createTerminalPaneContent('terminal-right', 'workspace-1'),
      'pane-right-fallback'
    )
    const moved = addTerminalToPaneTree(withRightTerminal.tree, 'pane-bottom-left', createTerminalPaneContent('terminal-top', 'workspace-1'), 'pane-recycle')

    const leaves = getLeafPanes(moved.tree)
    expect(leaves).toHaveLength(2)
    const hasTopTerminal = leaves.some((leaf) => leaf.tabs.some((item) => item.terminalId === 'terminal-top'))
    const hasBottomTerminal = leaves.some((leaf) => leaf.tabs.some((item) => item.terminalId === 'terminal-right'))
    expect(hasTopTerminal).toBe(true)
    expect(hasBottomTerminal).toBe(true)
  })

  it('prunes an empty pane after removing a terminal session', () => {
    const first = addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-1', 'workspace-1'), 'pane-1')
    const split = splitPaneTree(first.tree, 'pane-1', 'horizontal', 'split-1', 'pane-2')
    const second = addTerminalToPaneTree(split.tree, 'pane-2', createTerminalPaneContent('terminal-2', 'workspace-1'), 'pane-fallback')
    const removed = removeTerminalFromPaneTree(second.tree, 'terminal-2')

    const leaves = getLeafPanes(removed)
    expect(leaves).toHaveLength(1)
    expect(leaves[0].id).toBe('pane-1')
    expect(leaves[0].tabs.map((tab) => tab.terminalId)).toEqual(['terminal-1'])
  })

  it('clamps split resize ratios', () => {
    const tree: WorkspacePaneNode = {
      type: 'split',
      id: 'split-1',
      direction: 'horizontal',
      ratio: 0.5,
      first: { type: 'leaf', id: 'pane-1', tabs: [], activeTabId: null },
      second: { type: 'leaf', id: 'pane-2', tabs: [], activeTabId: null },
    }

    const resizedLow = resizeSplitPane(tree, 'split-1', 0.02)
    const resizedHigh = resizeSplitPane(tree, 'split-1', 0.98)

    expect(resizedLow?.type === 'split' ? resizedLow.ratio : null).toBe(0.15)
    expect(resizedHigh?.type === 'split' ? resizedHigh.ratio : null).toBe(0.85)
  })

  it('collapses split panes into one leaf and keeps the preferred terminal focused', () => {
    const first = addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-1', 'workspace-1'), 'pane-1')
    const split = splitPaneTree(first.tree, 'pane-1', 'horizontal', 'split-1', 'pane-2')
    const second = addTerminalToPaneTree(split.tree, 'pane-2', createTerminalPaneContent('terminal-2', 'workspace-1'), 'pane-fallback')
    const collapsed = collapsePaneTree(second.tree, 'terminal-2')

    expect(getLeafPanes(collapsed.tree)).toHaveLength(1)
    expect(getLeafPanes(collapsed.tree)[0].tabs.map((tab) => tab.terminalId)).toEqual(['terminal-1', 'terminal-2'])
    expect(collapsed.focus).toEqual({ paneId: 'pane-1', tabId: 'terminal:terminal-2', terminalId: 'terminal-2' })
  })

  it('adds one Janus Chat view to a split and focuses the existing view on repeat', () => {
    const terminal = addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-1', 'workspace-1'), 'pane-1')
    const split = splitPaneTree(terminal.tree, 'pane-1', 'horizontal', 'split-1', 'pane-chat', 'after', 0.62)
    const first = addPaneContentToTree(split.tree, 'pane-chat', createJanusChatPaneContent(), 'pane-fallback')
    const repeated = addPaneContentToTree(first.tree, 'pane-1', createJanusChatPaneContent(), 'pane-fallback')

    expect(getLeafPanes(repeated.tree).flatMap((leaf) => leaf.tabs).filter((tab) => tab.type === 'janus-chat')).toHaveLength(1)
    expect(repeated.focus).toEqual({ paneId: 'pane-chat', tabId: 'janus-chat', terminalId: null })
    expect((repeated.tree as Extract<WorkspacePaneNode, { type: 'split' }>).ratio).toBe(0.62)
  })

  it('closes only the Janus Chat presentation and keeps the terminal tab', () => {
    const terminal = addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-1', 'workspace-1'), 'pane-1')
    const withChat = addPaneContentToTree(terminal.tree, 'pane-1', createJanusChatPaneContent(), 'pane-fallback')
    const closed = closePaneTab(withChat.tree, 'pane-1', 'janus-chat')

    expect(getLeafPanes(closed)).toEqual([
      {
        type: 'leaf',
        id: 'pane-1',
        tabs: [createTerminalPaneContent('terminal-1', 'workspace-1')],
        activeTabId: 'terminal:terminal-1',
      },
    ])
  })
})
