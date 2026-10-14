import { beforeEach, describe, expect, it } from 'vitest'
import { openGlobalTool, resolveGlobalToolOpenState } from '../../src/renderer/src/lib/global-tool-entry'
import { useAppStore } from '../../src/renderer/src/stores/app'
import {
  addPaneContentToTree,
  createBrowserPaneContent,
  createMarkdownPaneContent,
  createTerminalPaneContent,
  addTerminalToPaneTree,
} from '../../src/renderer/src/lib/workspace-pane'

function seedTerminalTree() {
  return addTerminalToPaneTree(null, null, createTerminalPaneContent('terminal-1', 'workspace-1'), 'pane-1').tree
}

describe('global tool entry', () => {
  beforeEach(() => {
    useAppStore.setState({ blueprintMode: false, activeWorkbench: null })
  })

  it('flips the blueprint back to the workspace front before opening', () => {
    useAppStore.setState({ blueprintMode: true, activeWorkbench: 'blueprint' })
    const order: string[] = []

    openGlobalTool(() => {
      order.push('open')
      order.push(`blueprintMode=${useAppStore.getState().blueprintMode}`)
    })

    // 先翻回正面再打开：在背面上创建内容会让用户看不到结果。
    expect(order).toEqual(['open', 'blueprintMode=false'])
    expect(useAppStore.getState().blueprintMode).toBe(false)
  })

  it('collapses a workbench that covers the central area', () => {
    useAppStore.setState({ blueprintMode: false, activeWorkbench: 'knowledge' })

    openGlobalTool(() => {})

    expect(useAppStore.getState().activeWorkbench).toBeNull()
  })

  it('leaves an already-front workspace untouched', () => {
    useAppStore.setState({ blueprintMode: false, activeWorkbench: null })

    openGlobalTool(() => {})

    expect(useAppStore.getState()).toMatchObject({ blueprintMode: false, activeWorkbench: null })
  })

  it('tolerates an async open without blocking the caller', () => {
    let opened = false
    openGlobalTool(async () => {
      await Promise.resolve()
      opened = true
    })

    expect(useAppStore.getState().blueprintMode).toBe(false)
    expect(opened).toBe(false)
  })
})

describe('resolveGlobalToolOpenState', () => {
  it('reports nothing open for an empty or missing pane tree', () => {
    expect(resolveGlobalToolOpenState(null)).toEqual({
      browser: false,
      markdown: false,
    })
    expect(resolveGlobalToolOpenState(seedTerminalTree())).toEqual({
      browser: false,
      markdown: false,
    })
  })

  it('greys the browser entry once any browser tab exists', () => {
    const tree = addPaneContentToTree(seedTerminalTree(), 'pane-1', createBrowserPaneContent('surface-1'), 'pane-1').tree

    expect(resolveGlobalToolOpenState(tree).browser).toBe(true)
    // 浏览器开着不影响另一个入口
    expect(resolveGlobalToolOpenState(tree).markdown).toBe(false)
  })

  it('greys the markdown entry once a markdown panel exists', () => {
    const tree = addPaneContentToTree(seedTerminalTree(), 'pane-1', createMarkdownPaneContent('workspace-1'), 'pane-1').tree

    expect(resolveGlobalToolOpenState(tree).markdown).toBe(true)
    expect(resolveGlobalToolOpenState(tree).browser).toBe(false)
  })

  it('greys both entries once a browser tab and a markdown panel are open', () => {
    const tree = addPaneContentToTree(
      addPaneContentToTree(seedTerminalTree(), 'pane-1', createMarkdownPaneContent('workspace-1'), 'pane-1').tree,
      'pane-1',
      createBrowserPaneContent('surface-1'),
      'pane-1',
    ).tree

    expect(resolveGlobalToolOpenState(tree)).toEqual({
      browser: true,
      markdown: true,
    })
  })

  it('restores both entries once the pane tree is emptied', () => {
    const tree = addPaneContentToTree(
      addPaneContentToTree(seedTerminalTree(), 'pane-1', createMarkdownPaneContent('workspace-1'), 'pane-1').tree,
      'pane-1',
      createBrowserPaneContent('surface-1'),
      'pane-1',
    ).tree
    expect(resolveGlobalToolOpenState(tree)).toEqual({
      browser: true,
      markdown: true,
    })

    // 全部关闭后回到"都没有开"
    expect(resolveGlobalToolOpenState(seedTerminalTree())).toEqual({
      browser: false,
      markdown: false,
    })
  })
})
