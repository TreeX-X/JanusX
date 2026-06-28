import { create } from 'zustand'
import type { Workspace, Terminal, FileNode } from '@/types'
import {
  activatePaneTab,
  addTerminalToPaneTree,
  closePaneTab,
  collapsePaneTree,
  createTerminalPaneContent,
  findTerminalPane,
  removeTerminalFromPaneTree,
  resizeSplitPane,
  resolvePaneFocus,
  splitPaneTree,
  unsplitPaneTree,
  type PaneDropEdge,
  type PaneSplitDirection,
  type WorkspacePaneNode,
} from '@/lib/workspace-pane'

type TerminalSnapshot = {
  terminals: Terminal[]
  activeTerminalId: string | null
  paneTree: WorkspacePaneNode | null
  focusedPaneId: string | null
  focusedTabId: string | null
}

interface WorkspaceStore {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  terminals: Terminal[]
  activeTerminalId: string | null
  paneTree: WorkspacePaneNode | null
  focusedPaneId: string | null
  focusedTabId: string | null
  fileTree: FileNode[]
  activeFilePath: string | null

  // 每个工作区的终端快照
  terminalSnapshots: Record<string, TerminalSnapshot>

  setWorkspaces: (workspaces: Workspace[]) => void
  addWorkspace: (workspace: Workspace) => void
  removeWorkspace: (id: string) => void
  setActiveWorkspace: (id: string) => void

  addTerminal: (terminal: Terminal) => void
  removeTerminal: (id: string) => void
  setActiveTerminal: (id: string) => void
  updateTerminal: (id: string, patch: Partial<Terminal>) => void
  setFocusedPane: (paneId: string) => void
  setPaneTab: (paneId: string, tabId: string) => void
  splitPane: (paneId: string | null, direction: PaneSplitDirection) => void
  unsplitPane: (paneId: string | null) => void
  collapsePaneLayout: () => void
  resizePane: (splitId: string, ratio: number) => void
  closePaneTab: (paneId: string, tabId: string) => void
  moveTerminalToPane: (terminalId: string, paneId: string) => void
  splitPaneWithTerminal: (terminalId: string, paneId: string, edge: PaneDropEdge, ratio?: number) => void

  updateFileTree: (nodes: FileNode[]) => void
  setActiveFilePath: (path: string | null) => void
}

function createPaneId(prefix = 'pane'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  terminals: [],
  activeTerminalId: null,
  paneTree: null,
  focusedPaneId: null,
  focusedTabId: null,
  fileTree: [],
  activeFilePath: null,
  terminalSnapshots: {},

  setWorkspaces: (workspaces) => set({ workspaces }),
  addWorkspace: (workspace) =>
    set((s) => ({ workspaces: [...s.workspaces, workspace] })),
  removeWorkspace: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.terminalSnapshots
      return {
        workspaces: s.workspaces.filter((w) => w.id !== id),
        activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
        terminalSnapshots: rest,
      }
    }),
  setActiveWorkspace: (id) => {
    const s = get()
    if (s.activeWorkspaceId === id) return
    // 保存当前工作区的终端快照
    const snapshots = { ...s.terminalSnapshots }
    if (s.activeWorkspaceId) {
      snapshots[s.activeWorkspaceId] = {
        terminals: s.terminals,
        activeTerminalId: s.activeTerminalId,
        paneTree: s.paneTree,
        focusedPaneId: s.focusedPaneId,
        focusedTabId: s.focusedTabId,
      }
    }
    // 恢复目标工作区的终端快照
    const saved = snapshots[id]
    set({
      activeWorkspaceId: id,
      terminals: saved?.terminals ?? [],
      activeTerminalId: saved?.activeTerminalId ?? null,
      paneTree: saved?.paneTree ?? null,
      focusedPaneId: saved?.focusedPaneId ?? null,
      focusedTabId: saved?.focusedTabId ?? null,
      terminalSnapshots: snapshots,
    })
  },

  addTerminal: (terminal) =>
    set((s) => {
      const now = Date.now()
      const nextTerminal = {
        ...terminal,
        updatedAt: terminal.updatedAt ?? now,
        telemetryStartedAt: terminal.telemetryStartedAt ?? now,
      }
      const result = addTerminalToPaneTree(
        s.paneTree,
        s.focusedPaneId,
        createTerminalPaneContent(nextTerminal.id, nextTerminal.workspaceId),
        createPaneId()
      )
      return {
        terminals: [...s.terminals, nextTerminal],
        activeTerminalId: terminal.id,
        paneTree: result.tree,
        focusedPaneId: result.focus.paneId,
        focusedTabId: result.focus.tabId,
      }
    }),
  removeTerminal: (id) =>
    set((s) => {
      const terminals = s.terminals.filter((t) => t.id !== id)
      const paneTree = terminals.length > 0 ? removeTerminalFromPaneTree(s.paneTree, id) : null
      const focus = resolvePaneFocus(paneTree, s.focusedPaneId, s.focusedTabId)
      return {
        terminals,
        activeTerminalId: focus.terminalId,
        paneTree,
        focusedPaneId: focus.paneId,
        focusedTabId: focus.tabId,
      }
    }),
  setActiveTerminal: (id) =>
    set((s) => {
      const terminal = s.terminals.find((t) => t.id === id)
      if (!terminal) return {}

      const existing = findTerminalPane(s.paneTree, id)
      if (existing.paneId && existing.tabId) {
        return {
          activeTerminalId: id,
          paneTree: activatePaneTab(s.paneTree, existing.paneId, existing.tabId),
          focusedPaneId: existing.paneId,
          focusedTabId: existing.tabId,
        }
      }

      const result = addTerminalToPaneTree(
        s.paneTree,
        s.focusedPaneId,
        createTerminalPaneContent(terminal.id, terminal.workspaceId),
        createPaneId()
      )
      return {
        activeTerminalId: id,
        paneTree: result.tree,
        focusedPaneId: result.focus.paneId,
        focusedTabId: result.focus.tabId,
      }
    }),
  updateTerminal: (id, patch) =>
    set((s) => ({
      terminals: s.terminals.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: patch.updatedAt ?? Date.now() } : t
      ),
    })),
  setFocusedPane: (paneId) =>
    set((s) => {
      const focus = resolvePaneFocus(s.paneTree, paneId, null)
      return {
        focusedPaneId: focus.paneId,
        focusedTabId: focus.tabId,
        activeTerminalId: focus.terminalId,
      }
    }),
  setPaneTab: (paneId, tabId) =>
    set((s) => {
      const paneTree = activatePaneTab(s.paneTree, paneId, tabId)
      const focus = resolvePaneFocus(paneTree, paneId, tabId)
      return {
        paneTree,
        focusedPaneId: focus.paneId,
        focusedTabId: focus.tabId,
        activeTerminalId: focus.terminalId,
      }
    }),
  splitPane: (paneId, direction) =>
    set((s) => {
      const result = splitPaneTree(s.paneTree, paneId ?? s.focusedPaneId, direction, createPaneId('split'), createPaneId())
      return {
        paneTree: result.tree,
        focusedPaneId: result.focus.paneId,
        focusedTabId: result.focus.tabId,
        activeTerminalId: result.focus.terminalId,
      }
    }),
  unsplitPane: (paneId) =>
    set((s) => {
      const result = unsplitPaneTree(s.paneTree, paneId ?? s.focusedPaneId)
      return {
        paneTree: result.tree,
        focusedPaneId: result.focus.paneId,
        focusedTabId: result.focus.tabId,
        activeTerminalId: result.focus.terminalId,
      }
    }),
  collapsePaneLayout: () =>
    set((s) => {
      const result = collapsePaneTree(s.paneTree, s.activeTerminalId)
      return {
        paneTree: result.tree,
        focusedPaneId: result.focus.paneId,
        focusedTabId: result.focus.tabId,
        activeTerminalId: result.focus.terminalId,
      }
    }),
  resizePane: (splitId, ratio) =>
    set((s) => ({
      paneTree: resizeSplitPane(s.paneTree, splitId, ratio),
    })),
  closePaneTab: (paneId, tabId) =>
    set((s) => {
      const paneTree = closePaneTab(s.paneTree, paneId, tabId)
      const focus = resolvePaneFocus(paneTree, paneId, null)
      return {
        paneTree,
        focusedPaneId: focus.paneId,
        focusedTabId: focus.tabId,
        activeTerminalId: focus.terminalId,
      }
    }),
  moveTerminalToPane: (terminalId, paneId) =>
    set((s) => {
      const terminal = s.terminals.find((item) => item.id === terminalId)
      if (!terminal) return {}
      const result = addTerminalToPaneTree(
        s.paneTree,
        paneId,
        createTerminalPaneContent(terminal.id, terminal.workspaceId),
        createPaneId()
      )
      return {
        paneTree: result.tree,
        focusedPaneId: result.focus.paneId,
        focusedTabId: result.focus.tabId,
        activeTerminalId: result.focus.terminalId,
      }
    }),
  splitPaneWithTerminal: (terminalId, paneId, edge, ratio = 0.5) =>
    set((s) => {
      const terminal = s.terminals.find((item) => item.id === terminalId)
      if (!terminal) return {}

      const direction: PaneSplitDirection = edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical'
      const placement = edge === 'left' || edge === 'top' ? 'before' : 'after'
      const clampedRatio = Math.min(0.85, Math.max(0.15, ratio))
      const splitResult = splitPaneTree(
        s.paneTree,
        paneId,
        direction,
        createPaneId('split'),
        createPaneId(),
        placement,
        clampedRatio
      )
      const targetPaneId = splitResult.focus.paneId
      if (!targetPaneId) {
        return {
          paneTree: splitResult.tree,
          focusedPaneId: splitResult.focus.paneId,
          focusedTabId: splitResult.focus.tabId,
          activeTerminalId: splitResult.focus.terminalId,
        }
      }

      const result = addTerminalToPaneTree(
        splitResult.tree,
        targetPaneId,
        createTerminalPaneContent(terminal.id, terminal.workspaceId),
        createPaneId()
      )
      return {
        paneTree: result.tree,
        focusedPaneId: result.focus.paneId,
        focusedTabId: result.focus.tabId,
        activeTerminalId: result.focus.terminalId,
      }
    }),

  updateFileTree: (fileTree) => set({ fileTree }),
  setActiveFilePath: (path) => set({ activeFilePath: path }),
}))
