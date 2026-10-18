import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlobalToolsStore, GLOBAL_MARKDOWN_PANEL } from '../../src/renderer/src/stores/global-tools'
import { useWorkspaceStore } from '../../src/renderer/src/stores/workspace'
import { useDraftCardStore } from '../../src/renderer/src/stores/draft-card'
import { initBrowserEventSubscriptions, useBrowserStore } from '../../src/renderer/src/stores/browser'
import { createTerminalPaneContent, getLeafPanes, type WorkspacePaneNode } from '../../src/renderer/src/lib/workspace-pane'
import type { BrowserSurfaceState } from '../../src/shared/ipc/browser'

const tools = () => useGlobalToolsStore.getState()
const workspace = () => useWorkspaceStore.getState()
const allTools = () => getLeafPanes(tools().paneTree).flatMap((leaf) => leaf.tabs)
const browser = {
  createSurface: vi.fn(async () => ({ success: true })),
  getState: vi.fn<(...args: unknown[]) => Promise<Partial<BrowserSurfaceState> | null>>(async () => null),
  openTab: vi.fn(async () => ({ success: true })),
  popOut: vi.fn(async () => ({ success: true })),
  onStateChanged: vi.fn(), onAgentControlChanged: vi.fn(() => () => {}),
}

function seedProject(id: string) {
  workspace().setActiveWorkspace(id)
  workspace().addTerminal({ id: `${id}-1`, workspaceId: id, cwd: '/', name: 'one', preset: 'shell', status: 'wait' })
  workspace().splitPane(workspace().focusedPaneId, 'horizontal')
  workspace().addTerminal({ id: `${id}-2`, workspaceId: id, cwd: '/', name: 'two', preset: 'shell', status: 'wait' })
  workspace().resizePane(workspace().paneTree!.id, 0.37)
  return workspace().paneTree!
}

beforeEach(() => {
  vi.clearAllMocks()
  browser.createSurface.mockResolvedValue({ success: true })
  browser.getState.mockResolvedValue(null)
  vi.stubGlobal('window', { electron: { browser } })
  useGlobalToolsStore.setState({ paneTree: null, focusedPaneId: null, focusedTabId: null,
    browserSurfaceId: null, markdownScopeId: null, collapsed: false, focused: false, projectRatio: 0.62 })
  useWorkspaceStore.setState({ paneTree: null, activeWorkspaceId: null, terminals: [], terminalSnapshots: {},
    focusedPaneId: null, focusedTabId: null, activeTerminalId: null, workspaces: [] })
  useDraftCardStore.getState().clearAll()
  useBrowserStore.setState({ surfaces: {} })
})
afterEach(() => vi.unstubAllGlobals())

describe('independent global tool layout', () => {
  it('preserves both project trees, global tree identity and outer ratio through A → B → A', () => {
    const b = seedProject('B')
    const a = seedProject('A')
    workspace().openMarkdownInWorkspace()
    tools().attachBrowser('browser')
    tools().dropContent('browser:browser', tools().focusedPaneId!, 'right', 0.6)
    tools().setProjectRatio(0.7)
    const globalTree = tools().paneTree
    workspace().setActiveWorkspace('B')
    expect(workspace().paneTree).toEqual(b)
    expect(tools().paneTree).toBe(globalTree)
    expect(tools().projectRatio).toBe(0.7)
    workspace().setActiveWorkspace('A')
    expect(workspace().paneTree).toEqual(a)
    expect(tools().paneTree).toBe(globalTree)
    expect(tools().markdownScopeId).toBe('A')
    expect(Object.values(workspace().terminalSnapshots).every((snapshot) =>
      getLeafPanes(snapshot.paneTree).every((leaf) => leaf.tabs.every((tab) => tab.type === 'terminal')))).toBe(true)
  })

  it('keeps global tools when the active workspace is deleted or becomes projectless', () => {
    seedProject('A')
    workspace().openMarkdownInWorkspace()
    const tree = tools().paneTree
    workspace().removeWorkspace('A')
    expect(workspace().paneTree).toBeNull()
    expect(tools().paneTree).toBe(tree)
    workspace().setActiveWorkspace('B')
    workspace().setActiveWorkspace(null)
    expect(tools().paneTree).toBe(tree)
  })

  it('reopens the selected scope and retains drafts after closing the Markdown presentation', () => {
    workspace().setActiveWorkspace('A')
    workspace().openMarkdownInWorkspace()
    const drafts = useDraftCardStore.getState()
    const id = drafts.addDraft('A')
    drafts.updateDraft('A', id, { content: 'preserved' })
    tools().closePaneTab(tools().focusedPaneId!, `markdown:${GLOBAL_MARKDOWN_PANEL}`)
    workspace().setActiveWorkspace('B')
    workspace().openMarkdownInWorkspace()
    expect(tools().markdownScopeId).toBe('A')
    expect(useDraftCardStore.getState().drafts.A[0].content).toBe('preserved')
    tools().setCollapsed(true)
    workspace().openMarkdownInWorkspace()
    expect(tools().collapsed).toBe(false)
    expect(allTools()).toHaveLength(1)
  })

  it('rejects drops in both directions across region boundaries', () => {
    seedProject('A')
    workspace().openMarkdownInWorkspace()
    tools().attachBrowser('browser')
    const project = workspace().paneTree
    const globalTree = tools().paneTree
    const globalPane = tools().focusedPaneId!
    const projectPane = workspace().focusedPaneId!
    workspace().movePaneTabToIndex('terminal:A-1', globalPane, 0)
    workspace().moveTerminalToPane('A-1', globalPane)
    workspace().splitPaneWithTerminal('A-1', globalPane, 'right')
    workspace().movePaneContentToPane('browser:browser', projectPane)
    tools().dropContent('browser:browser', projectPane, 'right')
    tools().movePaneTabToIndex('terminal:A-1', globalPane, 0)
    tools().openContent(createTerminalPaneContent('A-1', 'A'))
    expect(workspace().paneTree).toBe(project)
    expect(tools().paneTree).toBe(globalTree)
  })

  it('splits, merges and closes tools without modifying project panes', () => {
    const project = seedProject('A')
    tools().openMarkdown('A')
    tools().attachBrowser('browser')
    const originalPane = tools().focusedPaneId!
    tools().dropContent('browser:browser', originalPane, 'bottom', 0.4)
    expect(getLeafPanes(tools().paneTree)).toHaveLength(2)
    tools().collapsePaneLayout()
    expect(getLeafPanes(tools().paneTree)).toHaveLength(1)
    expect(tools().focusedTabId).toBe('browser:browser')
    tools().closePaneTab(tools().focusedPaneId!, `markdown:${GLOBAL_MARKDOWN_PANEL}`)
    expect(allTools()).toHaveLength(1)
    expect(workspace().paneTree).toBe(project)
  })

  it('does not split a sole tool against itself', () => {
    tools().attachBrowser('browser')
    const tree = tools().paneTree
    tools().dropContent('browser:browser', tools().focusedPaneId!, 'right')
    expect(tools().paneTree).toBe(tree)
  })
})

describe('browser singleton lifetime', () => {
  it('deduplicates concurrent creation even across workspace switches and preserves additional URLs', async () => {
    let finish!: (value: { success: boolean }) => void
    browser.createSurface.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const first = tools().openBrowser('https://first.example')
    workspace().setActiveWorkspace('B')
    const second = tools().openBrowser('https://second.example')
    finish({ success: true })
    await Promise.all([first, second])
    expect(browser.createSurface).toHaveBeenCalledTimes(1)
    expect(browser.openTab).toHaveBeenCalledWith(tools().browserSurfaceId, 'https://second.example')
    expect(allTools()).toHaveLength(1)
    expect(workspace().paneTree).toBeNull()
  })

  it('permits retry after a failed creation', async () => {
    browser.createSurface.mockResolvedValueOnce({ success: false })
    await tools().openBrowser()
    expect(tools().browserSurfaceId).toBeNull()
    await tools().openBrowser()
    expect(browser.createSurface).toHaveBeenCalledTimes(2)
    expect(allTools()).toHaveLength(1)
  })

  it('focuses the popped-out singleton instead of creating a second browser', async () => {
    tools().attachBrowser('browser')
    tools().closePaneTab(tools().focusedPaneId!, 'browser:browser')
    browser.getState.mockResolvedValue({ surfaceId: 'browser', carrier: 'window' })
    await tools().openBrowser()
    expect(browser.popOut).toHaveBeenCalledWith('browser')
    expect(browser.createSurface).not.toHaveBeenCalled()
    expect(tools().paneTree).toBeNull()
    expect(tools().browserSurfaceId).toBe('browser')
  })

  it('reattaches without a workspace, ignores unowned surfaces, and clears destroyed identity', () => {
    let onState!: (state: BrowserSurfaceState) => void
    browser.onStateChanged.mockImplementation((handler) => { onState = handler; return () => {} })
    const off = initBrowserEventSubscriptions()
    const state = { surfaceId: 'browser', carrier: 'window', tabs: [], activeTabId: null, agentControlled: false } as BrowserSurfaceState
    tools().attachBrowser('browser')
    tools().closePaneTab(tools().focusedPaneId!, 'browser:browser')
    onState(state)
    onState({ ...state, carrier: 'pane' })
    expect(allTools()).toHaveLength(1)
    expect(workspace().paneTree).toBeNull()
    const tree: WorkspacePaneNode | null = tools().paneTree
    onState({ ...state, surfaceId: 'integration:cpa' })
    onState({ ...state, surfaceId: 'integration:cpa', carrier: 'pane' })
    expect(tools().paneTree).toBe(tree)
    onState({ ...state, destroyed: true })
    expect(tools().paneTree).toBeNull()
    expect(tools().browserSurfaceId).toBeNull()
    off()
  })
})
