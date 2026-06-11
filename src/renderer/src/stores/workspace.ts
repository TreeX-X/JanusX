import { create } from 'zustand'
import type { Workspace, Terminal, FileNode } from '@/types'

export interface LogEntry {
  time: number
  level: 'info' | 'warn' | 'error'
  message: string
}

interface WorkspaceStore {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  terminals: Terminal[]
  activeTerminalId: string | null
  fileTree: FileNode[]
  activeFilePath: string | null
  logs: LogEntry[]

  // 每个工作区的终端快照
  terminalSnapshots: Record<string, { terminals: Terminal[]; activeTerminalId: string | null }>

  setWorkspaces: (workspaces: Workspace[]) => void
  addWorkspace: (workspace: Workspace) => void
  removeWorkspace: (id: string) => void
  setActiveWorkspace: (id: string) => void

  addTerminal: (terminal: Terminal) => void
  removeTerminal: (id: string) => void
  setActiveTerminal: (id: string) => void

  updateFileTree: (nodes: FileNode[]) => void
  setActiveFilePath: (path: string | null) => void
  addLog: (level: LogEntry['level'], message: string) => void
  clearLogs: () => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  terminals: [],
  activeTerminalId: null,
  fileTree: [],
  activeFilePath: null,
  logs: [],
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
      }
    }
    // 恢复目标工作区的终端快照
    const saved = snapshots[id]
    set({
      activeWorkspaceId: id,
      terminals: saved?.terminals ?? [],
      activeTerminalId: saved?.activeTerminalId ?? null,
      terminalSnapshots: snapshots,
    })
  },

  addTerminal: (terminal) =>
    set((s) => ({
      terminals: [...s.terminals, terminal],
      activeTerminalId: terminal.id,
    })),
  removeTerminal: (id) =>
    set((s) => ({
      terminals: s.terminals.filter((t) => t.id !== id),
      activeTerminalId:
        s.activeTerminalId === id
          ? s.terminals.find((t) => t.id !== id)?.id ?? null
          : s.activeTerminalId,
    })),
  setActiveTerminal: (id) => set({ activeTerminalId: id }),

  updateFileTree: (fileTree) => set({ fileTree }),
  setActiveFilePath: (path) => set({ activeFilePath: path }),

  addLog: (level, message) =>
    set((s) => ({
      logs: [...s.logs, { time: Date.now(), level, message }].slice(-200),
    })),
  clearLogs: () => set({ logs: [] }),
}))
