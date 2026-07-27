import { create } from 'zustand'
import type { OpenFile, FileViewType } from '@/types'
import { getFileViewType, getFileName } from '@/lib/file-utils'

type LoadedFileSnapshot = Pick<
  OpenFile,
  'viewType' | 'content' | 'base64' | 'mimeType' | 'size' | 'mtime'
>

const loadedFileCache = new Map<string, LoadedFileSnapshot>()
const pendingFileLoads = new Map<string, Promise<LoadedFileSnapshot>>()

function isPathInWorkspace(filePath: string, workspacePath: string): boolean {
  const normalizedFile = filePath.replace(/\\/g, '/').toLowerCase()
  const normalizedWorkspace = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return normalizedFile === normalizedWorkspace || normalizedFile.startsWith(`${normalizedWorkspace}/`)
}

/** target 与 base 相同,或位于 base 目录之下(分隔符/大小写不敏感) */
function isSameOrUnderPath(target: string, base: string): boolean {
  const t = target.replace(/\\/g, '/').toLowerCase()
  const b = base.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return t === b || t.startsWith(`${b}/`)
}

/** 把 base 之下的绝对路径迁移到 newBase 下,保留后缀原始分隔符 */
function remapAbsolutePath(target: string, base: string, newBase: string): string {
  if (target.length === base.length) return newBase
  return `${newBase}${target.slice(base.length)}`
}

export function invalidateEditorFileCache(workspacePath?: string): void {
  if (!workspacePath) {
    loadedFileCache.clear()
    pendingFileLoads.clear()
    return
  }

  for (const filePath of loadedFileCache.keys()) {
    if (isPathInWorkspace(filePath, workspacePath)) {
      loadedFileCache.delete(filePath)
    }
  }
}

function readResultError(result: unknown): string | null {
  if (result && typeof result === 'object' && 'error' in result) {
    const error = (result as { error?: unknown }).error
    return typeof error === 'string' ? error : 'Failed to load file'
  }
  return null
}

async function loadFileSnapshot(absolutePath: string, viewType: FileViewType): Promise<LoadedFileSnapshot> {
  const pending = pendingFileLoads.get(absolutePath)
  if (pending) return pending

  const request = (async () => {
    if (viewType === 'image') {
      const result = await window.electron.file.readBinary(absolutePath)
      const error = readResultError(result)
      if (error) throw new Error(error)
      return {
        viewType,
        content: '',
        base64: result.base64 ?? '',
        mimeType: result.mimeType ?? 'application/octet-stream',
        size: result.size,
        mtime: result.mtime,
      }
    }

    if (viewType === 'binary') {
      const result = await window.electron.file.stat(absolutePath)
      const error = readResultError(result)
      if (error) throw new Error(error)
      return {
        viewType,
        content: '',
        size: result.size,
        mtime: result.mtime,
      }
    }

    const result = await window.electron.file.read(absolutePath)
    const error = readResultError(result)
    if (error) throw new Error(error)
    return {
      viewType,
      content: result.content ?? '',
      size: result.size,
      mtime: result.mtime,
    }
  })()

  pendingFileLoads.set(absolutePath, request)
  try {
    const snapshot = await request
    loadedFileCache.set(absolutePath, snapshot)
    return snapshot
  } finally {
    pendingFileLoads.delete(absolutePath)
  }
}

/** 文件树重命名后同步编辑器:迁移打开的 tab 路径与缓存键 */
export function remapEditorPaths(oldAbsolutePath: string, newAbsolutePath: string, workspacePath: string): void {
  for (const key of [...loadedFileCache.keys()]) {
    if (!isSameOrUnderPath(key, oldAbsolutePath)) continue
    const snapshot = loadedFileCache.get(key)!
    loadedFileCache.delete(key)
    loadedFileCache.set(remapAbsolutePath(key, oldAbsolutePath, newAbsolutePath), snapshot)
  }

  useEditorStore.setState((s) => {
    let changed = false
    const openFiles = s.openFiles.map((file) => {
      if (!isSameOrUnderPath(file.absolutePath, oldAbsolutePath)) return file
      changed = true
      const absolutePath = remapAbsolutePath(file.absolutePath, oldAbsolutePath, newAbsolutePath)
      return {
        ...file,
        id: absolutePath,
        absolutePath,
        name: getFileName(absolutePath),
        path: absolutePath.replace(workspacePath, '').replace(/^[\\/]/, ''),
      }
    })
    if (!changed) return {}
    const activeFileId =
      s.activeFileId && isSameOrUnderPath(s.activeFileId, oldAbsolutePath)
        ? remapAbsolutePath(s.activeFileId, oldAbsolutePath, newAbsolutePath)
        : s.activeFileId
    return { openFiles, activeFileId }
  })
}

/** 文件树删除后同步编辑器:关闭指向已删除路径的 tab、清理缓存 */
export function closeEditorFilesUnderPath(absolutePath: string): void {
  for (const key of [...loadedFileCache.keys()]) {
    if (isSameOrUnderPath(key, absolutePath)) loadedFileCache.delete(key)
  }

  const store = useEditorStore.getState()
  for (const file of store.openFiles) {
    if (isSameOrUnderPath(file.absolutePath, absolutePath)) store.closeFile(file.id)
  }
}

interface EditorStore {
  openFiles: OpenFile[]
  activeFileId: string | null
  isVisible: boolean
  isEmbedded: boolean
  embeddedWidth: number

  openFile: (absolutePath: string, workspacePath: string) => Promise<void>
  closeFile: (id: string) => void
  setActiveFile: (id: string) => void
  markDirty: (id: string) => void
  updateContent: (id: string, content: string) => void
  saveFile: (id: string) => Promise<void>
  closePanel: () => void
  hidePanel: () => void
  showPanel: () => void
  togglePanel: () => void
  setEmbedded: (embedded: boolean) => void
  setEmbeddedWidth: (width: number) => void
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  openFiles: [],
  activeFileId: null,
  isVisible: false,
  isEmbedded: false,
  embeddedWidth: 560,

  openFile: async (absolutePath, workspacePath) => {
    const id = absolutePath
    const existing = get().openFiles.find(f => f.id === id)
    if (existing) {
      set({ activeFileId: id, isVisible: true, isEmbedded: false })
      return
    }

    const viewType = getFileViewType(absolutePath)
    const name = getFileName(absolutePath)
    const relativePath = absolutePath.replace(workspacePath, '').replace(/^[\\/]/, '')
    const cached = loadedFileCache.get(id)

    const newFile: OpenFile = {
      id, name, path: relativePath, absolutePath, viewType,
      content: cached?.content ?? '', isDirty: false, isLoading: !cached,
      base64: cached?.base64, mimeType: cached?.mimeType,
      size: cached?.size, mtime: cached?.mtime,
    }

    set(s => ({
      openFiles: [...s.openFiles, newFile],
      activeFileId: id,
      isVisible: true,
      isEmbedded: false,
    }))

    if (cached) return

    try {
      const snapshot = await loadFileSnapshot(absolutePath, viewType)
      set(s => ({
        openFiles: s.openFiles.map(f =>
          f.id === id ? { ...f, ...snapshot, isLoading: false } : f
        ),
      }))
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
        isEmbedded: filtered.length > 0 ? s.isEmbedded : false,
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
      await window.electron.file.save(file.absolutePath, file.content)
      loadedFileCache.set(file.absolutePath, {
        viewType: file.viewType,
        content: file.content,
        base64: file.base64,
        mimeType: file.mimeType,
        size: file.size,
        mtime: Date.now(),
      })
      set(s => ({
        openFiles: s.openFiles.map(f => f.id === id ? { ...f, isDirty: false, mtime: Date.now() } : f),
      }))
    } catch (err: any) {
      console.error('Save failed:', err)
    }
  },

  closePanel: () => set({ openFiles: [], activeFileId: null, isVisible: false, isEmbedded: false }),
  hidePanel: () => set({ isVisible: false, isEmbedded: false }),
  showPanel: () => set(s => ({ isVisible: s.openFiles.length > 0 })),
  togglePanel: () => set(s => ({ isVisible: s.openFiles.length > 0 ? !s.isVisible : false })),
  setEmbedded: (isEmbedded) => set({ isEmbedded }),
  setEmbeddedWidth: (embeddedWidth) => set({ embeddedWidth }),
}))
