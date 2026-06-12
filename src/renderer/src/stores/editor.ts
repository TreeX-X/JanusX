import { create } from 'zustand'
import type { OpenFile, FileViewType } from '@/types'
import { getFileViewType, getFileName } from '@/lib/file-utils'

interface EditorStore {
  openFiles: OpenFile[]
  activeFileId: string | null
  isVisible: boolean

  openFile: (absolutePath: string, workspacePath: string) => Promise<void>
  closeFile: (id: string) => void
  setActiveFile: (id: string) => void
  markDirty: (id: string) => void
  updateContent: (id: string, content: string) => void
  saveFile: (id: string) => Promise<void>
  hidePanel: () => void
  showPanel: () => void
  togglePanel: () => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  openFiles: [],
  activeFileId: null,
  isVisible: false,

  openFile: async (absolutePath, workspacePath) => {
    const id = absolutePath
    const existing = get().openFiles.find(f => f.id === id)
    if (existing) {
      set({ activeFileId: id, isVisible: true })
      return
    }

    const viewType = getFileViewType(absolutePath)
    const name = getFileName(absolutePath)
    const relativePath = absolutePath.replace(workspacePath, '').replace(/^[\\/]/, '')

    const newFile: OpenFile = {
      id, name, path: relativePath, absolutePath, viewType,
      content: '', isDirty: false, isLoading: true,
    }

    set(s => ({
      openFiles: [...s.openFiles, newFile],
      activeFileId: id,
      isVisible: true,
    }))

    try {
      if (viewType === 'image') {
        const result = await window.electron.invoke('file:readBinary', absolutePath) as { base64: string, mimeType: string }
        set(s => ({
          openFiles: s.openFiles.map(f =>
            f.id === id ? { ...f, base64: result.base64, mimeType: result.mimeType, isLoading: false } : f
          ),
        }))
      } else if (viewType === 'binary') {
        const result = await window.electron.invoke('file:stat', absolutePath) as { size: number }
        set(s => ({
          openFiles: s.openFiles.map(f =>
            f.id === id ? { ...f, content: `Size: ${result.size} bytes`, isLoading: false } : f
          ),
        }))
      } else {
        const result = await window.electron.invoke('file:read', absolutePath) as { content: string }
        set(s => ({
          openFiles: s.openFiles.map(f =>
            f.id === id ? { ...f, content: result.content, isLoading: false } : f
          ),
        }))
      }
    } catch (err: any) {
      set(s => ({
        openFiles: s.openFiles.map(f =>
          f.id === id ? { ...f, error: err.message || 'Failed to load file', isLoading: false } : f
        ),
      }))
    }
  },

  closeFile: (id) => {
    set(s => {
      const filtered = s.openFiles.filter(f => f.id !== id)
      let newActive = s.activeFileId
      if (s.activeFileId === id) {
        const idx = s.openFiles.findIndex(f => f.id === id)
        newActive = filtered[Math.min(idx, filtered.length - 1)]?.id ?? null
      }
      return {
        openFiles: filtered,
        activeFileId: newActive,
        isVisible: filtered.length > 0 ? s.isVisible : false,
      }
    })
  },

  setActiveFile: (id) => set({ activeFileId: id }),

  markDirty: (id) => {
    set(s => ({
      openFiles: s.openFiles.map(f => f.id === id ? { ...f, isDirty: true } : f),
    }))
  },

  updateContent: (id, content) => {
    set(s => ({
      openFiles: s.openFiles.map(f =>
        f.id === id ? { ...f, content, isDirty: true } : f
      ),
    }))
  },

  saveFile: async (id) => {
    const file = get().openFiles.find(f => f.id === id)
    if (!file) return
    try {
      await window.electron.invoke('file:save', file.absolutePath, file.content)
      set(s => ({
        openFiles: s.openFiles.map(f => f.id === id ? { ...f, isDirty: false } : f),
      }))
    } catch (err: any) {
      console.error('Save failed:', err)
    }
  },

  hidePanel: () => set({ isVisible: false }),
  showPanel: () => set(s => ({ isVisible: s.openFiles.length > 0 })),
  togglePanel: () => set(s => ({ isVisible: s.openFiles.length > 0 ? !s.isVisible : false })),
}))
