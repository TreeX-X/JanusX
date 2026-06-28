export type PaneSplitDirection = 'horizontal' | 'vertical'
export type PaneSplitPlacement = 'before' | 'after'
export type PaneDropEdge = 'left' | 'right' | 'top' | 'bottom'

export type PaneContent = {
  type: 'terminal'
  id: string
  terminalId: string
  workspaceId: string
}

export type WorkspacePaneLeaf = {
  type: 'leaf'
  id: string
  tabs: PaneContent[]
  activeTabId: string | null
}

export type WorkspacePaneSplit = {
  type: 'split'
  id: string
  direction: PaneSplitDirection
  ratio: number
  first: WorkspacePaneNode
  second: WorkspacePaneNode
}

export type WorkspacePaneNode = WorkspacePaneLeaf | WorkspacePaneSplit

export type WorkspacePaneFocus = {
  paneId: string | null
  tabId: string | null
  terminalId: string | null
}

export function createTerminalPaneContent(terminalId: string, workspaceId: string): PaneContent {
  return {
    type: 'terminal',
    id: `terminal:${terminalId}`,
    terminalId,
    workspaceId,
  }
}

export function createEmptyPaneLeaf(id: string): WorkspacePaneLeaf {
  return {
    type: 'leaf',
    id,
    tabs: [],
    activeTabId: null,
  }
}

export function getLeafPanes(node: WorkspacePaneNode | null): WorkspacePaneLeaf[] {
  if (!node) return []
  if (node.type === 'leaf') return [node]
  return [...getLeafPanes(node.first), ...getLeafPanes(node.second)]
}

export function findLeafPane(
  node: WorkspacePaneNode | null,
  paneId: string | null
): WorkspacePaneLeaf | null {
  if (!node || !paneId) return null
  if (node.type === 'leaf') return node.id === paneId ? node : null
  return findLeafPane(node.first, paneId) ?? findLeafPane(node.second, paneId)
}

export function findTerminalPane(
  node: WorkspacePaneNode | null,
  terminalId: string
): WorkspacePaneFocus {
  for (const leaf of getLeafPanes(node)) {
    const tab = leaf.tabs.find((item) => item.terminalId === terminalId)
    if (tab) {
      return { paneId: leaf.id, tabId: tab.id, terminalId }
    }
  }
  return { paneId: null, tabId: null, terminalId: null }
}

function pruneEmptyPanes(node: WorkspacePaneNode | null): WorkspacePaneNode | null {
  if (!node) return null
  if (node.type === 'leaf') return node.tabs.length > 0 ? node : null

  const first = pruneEmptyPanes(node.first)
  const second = pruneEmptyPanes(node.second)
  if (!first && !second) return null
  if (!first) return second
  if (!second) return first

  return {
    ...node,
    first,
    second,
  }
}

export function resolvePaneFocus(
  node: WorkspacePaneNode | null,
  preferredPaneId: string | null,
  preferredTabId: string | null
): WorkspacePaneFocus {
  const preferredPane = findLeafPane(node, preferredPaneId)
  const fallbackPane = preferredPane ?? getLeafPanes(node)[0] ?? null
  if (!fallbackPane) return { paneId: null, tabId: null, terminalId: null }

  const preferredTab = preferredTabId
    ? fallbackPane.tabs.find((item) => item.id === preferredTabId)
    : null
  const activeTab = fallbackPane.activeTabId
    ? fallbackPane.tabs.find((item) => item.id === fallbackPane.activeTabId)
    : null
  const tab = preferredTab ?? activeTab ?? fallbackPane.tabs[0] ?? null

  return {
    paneId: fallbackPane.id,
    tabId: tab?.id ?? null,
    terminalId: tab?.terminalId ?? null,
  }
}

export function activatePaneTab(
  node: WorkspacePaneNode | null,
  paneId: string,
  tabId: string | null
): WorkspacePaneNode | null {
  if (!node) return null
  if (node.type === 'leaf') {
    if (node.id !== paneId) return node
    const hasTab = tabId ? node.tabs.some((item) => item.id === tabId) : false
    return { ...node, activeTabId: hasTab ? tabId : node.tabs[0]?.id ?? null }
  }

  return {
    ...node,
    first: activatePaneTab(node.first, paneId, tabId) ?? node.first,
    second: activatePaneTab(node.second, paneId, tabId) ?? node.second,
  }
}

function removeTerminalView(node: WorkspacePaneNode, terminalId: string): WorkspacePaneNode {
  if (node.type === 'leaf') {
    const tabs = node.tabs.filter((item) => item.terminalId !== terminalId)
    const activeTabStillExists = tabs.some((item) => item.id === node.activeTabId)
    return {
      ...node,
      tabs,
      activeTabId: activeTabStillExists ? node.activeTabId : tabs[0]?.id ?? null,
    }
  }

  return {
    ...node,
    first: removeTerminalView(node.first, terminalId),
    second: removeTerminalView(node.second, terminalId),
  }
}

function upsertTabInLeaf(
  node: WorkspacePaneNode,
  paneId: string,
  content: PaneContent
): WorkspacePaneNode {
  if (node.type === 'leaf') {
    if (node.id !== paneId) return node
    const existingIndex = node.tabs.findIndex((item) => item.id === content.id)
    const tabs =
      existingIndex >= 0
        ? node.tabs.map((item) => (item.id === content.id ? content : item))
        : [...node.tabs, content]
    return {
      ...node,
      tabs,
      activeTabId: content.id,
    }
  }

  return {
    ...node,
    first: upsertTabInLeaf(node.first, paneId, content),
    second: upsertTabInLeaf(node.second, paneId, content),
  }
}

export function addTerminalToPaneTree(
  node: WorkspacePaneNode | null,
  targetPaneId: string | null,
  content: PaneContent,
  fallbackPaneId: string
): { tree: WorkspacePaneNode; focus: WorkspacePaneFocus } {
  if (!node) {
    const leaf = {
      ...createEmptyPaneLeaf(fallbackPaneId),
      tabs: [content],
      activeTabId: content.id,
    }
    return {
      tree: leaf,
      focus: { paneId: leaf.id, tabId: content.id, terminalId: content.terminalId },
    }
  }

  const deduped = removeTerminalView(node, content.terminalId)
  const targetPane = findLeafPane(deduped, targetPaneId) ?? getLeafPanes(deduped)[0]
  const tree = upsertTabInLeaf(deduped, targetPane.id, content)
  return {
    tree,
    focus: { paneId: targetPane.id, tabId: content.id, terminalId: content.terminalId },
  }
}

export function removeTerminalFromPaneTree(
  node: WorkspacePaneNode | null,
  terminalId: string
): WorkspacePaneNode | null {
  if (!node) return null
  return pruneEmptyPanes(removeTerminalView(node, terminalId))
}

export function closePaneTab(
  node: WorkspacePaneNode | null,
  paneId: string,
  tabId: string
): WorkspacePaneNode | null {
  if (!node) return null
  if (node.type === 'leaf') {
    if (node.id !== paneId) return node
    const tabs = node.tabs.filter((item) => item.id !== tabId)
    if (tabs.length === 0) return null
    const activeTabStillExists = tabs.some((item) => item.id === node.activeTabId)
    return {
      ...node,
      tabs,
      activeTabId: activeTabStillExists ? node.activeTabId : tabs[0]?.id ?? null,
    }
  }

  const first = closePaneTab(node.first, paneId, tabId)
  const second = closePaneTab(node.second, paneId, tabId)
  if (!first && !second) return null
  if (!first) return second
  if (!second) return first

  return {
    ...node,
    first,
    second,
  }
}

export function splitPaneTree(
  node: WorkspacePaneNode | null,
  paneId: string | null,
  direction: PaneSplitDirection,
  newSplitId: string,
  newPaneId: string,
  placement: PaneSplitPlacement = 'after'
): { tree: WorkspacePaneNode | null; focus: WorkspacePaneFocus } {
  if (!node) {
    const leaf = createEmptyPaneLeaf(newPaneId)
    return { tree: leaf, focus: { paneId: leaf.id, tabId: null, terminalId: null } }
  }

  const targetPaneId = findLeafPane(node, paneId)?.id ?? getLeafPanes(node)[0]?.id ?? null
  if (!targetPaneId) {
    return { tree: node, focus: resolvePaneFocus(node, paneId, null) }
  }

  const split = (current: WorkspacePaneNode): WorkspacePaneNode => {
    if (current.type === 'leaf') {
      if (current.id !== targetPaneId) return current
      const newPane = createEmptyPaneLeaf(newPaneId)
      return {
        type: 'split',
        id: newSplitId,
        direction,
        ratio: 0.5,
        first: placement === 'before' ? newPane : current,
        second: placement === 'before' ? current : newPane,
      }
    }

    return {
      ...current,
      first: split(current.first),
      second: split(current.second),
    }
  }

  return {
    tree: split(node),
    focus: { paneId: newPaneId, tabId: null, terminalId: null },
  }
}

export function collapsePaneTree(
  node: WorkspacePaneNode | null,
  preferredTerminalId: string | null
): { tree: WorkspacePaneNode | null; focus: WorkspacePaneFocus } {
  if (!node) {
    return { tree: null, focus: { paneId: null, tabId: null, terminalId: null } }
  }

  const leaves = getLeafPanes(node)
  const targetLeaf = leaves[0]
  if (!targetLeaf) {
    return { tree: null, focus: { paneId: null, tabId: null, terminalId: null } }
  }

  const seenTerminalIds = new Set<string>()
  const tabs = leaves
    .flatMap((leaf) => leaf.tabs)
    .filter((tab) => {
      if (seenTerminalIds.has(tab.terminalId)) return false
      seenTerminalIds.add(tab.terminalId)
      return true
    })
  const activeTab = tabs.find((tab) => tab.terminalId === preferredTerminalId) ?? tabs[0] ?? null
  const tree: WorkspacePaneLeaf = {
    type: 'leaf',
    id: targetLeaf.id,
    tabs,
    activeTabId: activeTab?.id ?? null,
  }

  return {
    tree,
    focus: {
      paneId: tree.id,
      tabId: activeTab?.id ?? null,
      terminalId: activeTab?.terminalId ?? null,
    },
  }
}

function appendTabsToFirstLeaf(
  node: WorkspacePaneNode,
  tabsToAppend: PaneContent[]
): { node: WorkspacePaneNode; focus: WorkspacePaneFocus } {
  if (node.type === 'leaf') {
    const existing = new Set(node.tabs.map((item) => item.id))
    const tabs = [...node.tabs, ...tabsToAppend.filter((item) => !existing.has(item.id))]
    const activeTab = tabsToAppend[0] ?? node.tabs.find((item) => item.id === node.activeTabId) ?? tabs[0]
    const nextNode = {
      ...node,
      tabs,
      activeTabId: activeTab?.id ?? null,
    }
    return {
      node: nextNode,
      focus: {
        paneId: nextNode.id,
        tabId: activeTab?.id ?? null,
        terminalId: activeTab?.terminalId ?? null,
      },
    }
  }

  const first = appendTabsToFirstLeaf(node.first, tabsToAppend)
  return {
    node: { ...node, first: first.node },
    focus: first.focus,
  }
}

function findAndRemoveLeaf(
  node: WorkspacePaneNode,
  paneId: string
): { node: WorkspacePaneNode; focus: WorkspacePaneFocus; removed: boolean } {
  if (node.type === 'leaf') {
    return {
      node,
      focus: resolvePaneFocus(node, node.id, node.activeTabId),
      removed: false,
    }
  }

  if (node.first.type === 'leaf' && node.first.id === paneId) {
    const merged = appendTabsToFirstLeaf(node.second, node.first.tabs)
    return { node: merged.node, focus: merged.focus, removed: true }
  }

  if (node.second.type === 'leaf' && node.second.id === paneId) {
    const merged = appendTabsToFirstLeaf(node.first, node.second.tabs)
    return { node: merged.node, focus: merged.focus, removed: true }
  }

  const first = findAndRemoveLeaf(node.first, paneId)
  if (first.removed) {
    return { node: { ...node, first: first.node }, focus: first.focus, removed: true }
  }

  const second = findAndRemoveLeaf(node.second, paneId)
  if (second.removed) {
    return { node: { ...node, second: second.node }, focus: second.focus, removed: true }
  }

  return {
    node,
    focus: resolvePaneFocus(node, paneId, null),
    removed: false,
  }
}

export function unsplitPaneTree(
  node: WorkspacePaneNode | null,
  paneId: string | null
): { tree: WorkspacePaneNode | null; focus: WorkspacePaneFocus } {
  if (!node || !paneId || node.type === 'leaf') {
    return { tree: node, focus: resolvePaneFocus(node, paneId, null) }
  }

  const result = findAndRemoveLeaf(node, paneId)
  return {
    tree: result.node,
    focus: result.focus,
  }
}

export function resizeSplitPane(
  node: WorkspacePaneNode | null,
  splitId: string,
  ratio: number
): WorkspacePaneNode | null {
  if (!node) return null
  const clampedRatio = Math.min(0.85, Math.max(0.15, ratio))
  if (node.type === 'split') {
    if (node.id === splitId) {
      return {
        ...node,
        ratio: clampedRatio,
      }
    }

    return {
      ...node,
      first: resizeSplitPane(node.first, splitId, clampedRatio) ?? node.first,
      second: resizeSplitPane(node.second, splitId, clampedRatio) ?? node.second,
    }
  }

  return node
}
