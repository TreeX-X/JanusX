import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { FileViewerContent } from '@/components/FileViewerContent'
import { getFileName, getFileViewType } from '@/lib/file-utils'
import type { OpenFile } from '@/types'
import { Maximize2, PanelRightOpen, Pin, PinOff, Save } from 'lucide-react'

interface EditorWindowParams {
  filePath: string
  workspacePath: string
}

function getEditorWindowParams(): EditorWindowParams | null {
  const params = new URLSearchParams(window.location.search)
  const filePath = params.get('editorFile')
  const workspacePath = params.get('workspacePath')
  if (!filePath || !workspacePath) return null
  return { filePath, workspacePath }
}

function createLoadingFile(filePath: string, workspacePath: string): OpenFile {
  return {
    id: filePath,
    name: getFileName(filePath),
    path: filePath.replace(workspacePath, '').replace(/^[\\/]/, ''),
    absolutePath: filePath,
    viewType: getFileViewType(filePath),
    content: '',
    isDirty: false,
    isLoading: true,
  }
}

function WindowTrafficLights() {
  const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties

  return (
    <div className="flex gap-2" style={noDrag}>
      <button
        type="button"
        aria-label="Close"
        title="Close"
        onClick={() => window.electron.window.close()}
        className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] transition hover:brightness-110 active:brightness-90"
      />
      <button
        type="button"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => window.electron.window.minimize()}
        className="h-3 w-3 rounded-full bg-[#ffbd2e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] transition hover:brightness-110 active:brightness-90"
      />
      <button
        type="button"
        aria-label="Maximize"
        title="Maximize"
        onClick={() => window.electron.window.maximize()}
        className="h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] transition hover:brightness-110 active:brightness-90"
      />
    </div>
  )
}

export function StandaloneFileEditor() {
  const editorParams = useMemo(() => getEditorWindowParams(), [])
  const [file, setFile] = useState<OpenFile | null>(() =>
    editorParams ? createLoadingFile(editorParams.filePath, editorParams.workspacePath) : null,
  )
  const [isPinned, setIsPinned] = useState(false)

  useEffect(() => {
    if (!editorParams) return

    let disposed = false
    const loadFile = async () => {
      const viewType = getFileViewType(editorParams.filePath)
      try {
        if (viewType === 'image') {
          const result = await window.electron.file.readBinary(editorParams.filePath)
          if (disposed) return
          if (result.error) throw new Error(result.error)
          setFile((current) =>
            current
              ? {
                  ...current,
                  viewType,
                  base64: result.base64 ?? '',
                  mimeType: result.mimeType ?? 'application/octet-stream',
                  size: result.size,
                  mtime: result.mtime,
                  isLoading: false,
                }
              : current,
          )
          return
        }

        if (viewType === 'binary') {
          const result = await window.electron.file.stat(editorParams.filePath)
          if (disposed) return
          if (result.error) throw new Error(result.error)
          setFile((current) =>
            current
              ? {
                  ...current,
                  viewType,
                  size: result.size,
                  mtime: result.mtime,
                  isLoading: false,
                }
              : current,
          )
          return
        }

        const result = await window.electron.file.read(editorParams.filePath)
        if (disposed) return
        if (result.error) throw new Error(result.error)
        setFile((current) =>
          current
            ? {
                ...current,
                viewType,
                content: result.content ?? '',
                size: result.size,
                mtime: result.mtime,
                isLoading: false,
              }
            : current,
        )
      } catch (err: any) {
        if (disposed) return
        setFile((current) =>
          current
            ? {
                ...current,
                error: err.message || 'Failed to load file',
                isLoading: false,
              }
            : current,
        )
      }
    }

    void loadFile()
    return () => {
      disposed = true
    }
  }, [editorParams])

  const saveFile = useCallback(async () => {
    if (!file || file.isLoading || file.viewType === 'image' || file.viewType === 'binary') return
    await window.electron.file.save(file.absolutePath, file.content)
    setFile((current) => (current ? { ...current, isDirty: false, mtime: Date.now() } : current))
  }, [file])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveFile()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [saveFile])

  useEffect(() => {
    if (!file) return
    document.title = `${file.isDirty ? '* ' : ''}${file.name} - JanusX`
  }, [file])

  const handleContentChange = useCallback((content: string) => {
    setFile((current) => (current ? { ...current, content, isDirty: true } : current))
  }, [])

  const togglePinned = useCallback(async () => {
    const result = await window.electron.window.setAlwaysOnTop(!isPinned)
    setIsPinned(result.value)
  }, [isPinned])

  const embedInWorkspace = useCallback(async () => {
    if (!file || !editorParams) return
    await window.electron.window.embedEditor({
      filePath: file.absolutePath,
      workspacePath: editorParams.workspacePath,
      content: file.content,
      isDirty: file.isDirty,
    })
  }, [editorParams, file])

  const titlebarDrag = { WebkitAppRegion: 'drag' } as CSSProperties
  const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties
  const canSave = Boolean(file && file.viewType !== 'image' && file.viewType !== 'binary')

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#0a0a0a', color: '#d4d4d4' }}>
      <div
        className="h-[38px] shrink-0 flex items-center gap-3 px-3 select-none"
        style={{
          ...titlebarDrag,
          background: 'rgba(6, 6, 6, 0.96)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <WindowTrafficLights />
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs">
          {file ? `${file.isDirty ? '* ' : ''}${file.path || file.name}` : 'File preview'}
        </span>
        <div className="flex shrink-0 items-center gap-1.5" style={noDrag}>
          <button
            type="button"
            aria-pressed={isPinned}
            aria-label={isPinned ? '\u53d6\u6d88\u7a97\u53e3\u7f6e\u9876' : '\u9501\u5b9a\u7a97\u53e3\u7f6e\u9876'}
            title={isPinned ? '\u53d6\u6d88\u7a97\u53e3\u7f6e\u9876' : '\u9501\u5b9a\u7a97\u53e3\u7f6e\u9876'}
            onClick={() => void togglePinned()}
            onMouseDown={(event) => event.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded transition-colors"
            style={{
              background: isPinned ? 'rgba(255, 120, 48, 0.14)' : 'rgba(255, 255, 255, 0.04)',
              border: isPinned ? '1px solid rgba(255, 120, 48, 0.28)' : '1px solid rgba(255, 255, 255, 0.08)',
              color: isPinned ? '#ff9b64' : '#888',
            }}
          >
            {isPinned ? <PinOff size={14} strokeWidth={1.8} /> : <Pin size={14} strokeWidth={1.8} />}
          </button>
          <button
            type="button"
            aria-label="Maximize editor window"
            title="Maximize editor window"
            onClick={() => void window.electron.window.maximize()}
            onMouseDown={(event) => event.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-[#999] transition-colors hover:border-white/[0.14] hover:text-white"
          >
            <Maximize2 size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            aria-label={'\u5d4c\u5165\u4e3b\u7a97\u53e3\u5de5\u4f5c\u533a'}
            title={'\u5d4c\u5165\u4e3b\u7a97\u53e3\u5de5\u4f5c\u533a'}
            disabled={!file || !editorParams}
            onClick={() => void embedInWorkspace()}
            onMouseDown={(event) => event.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-white/[0.04] text-[#999] transition-colors enabled:hover:border-white/[0.14] enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
          >
            <PanelRightOpen size={14} strokeWidth={1.8} />
          </button>
        </div>
        {canSave && (
          <button
            type="button"
            onClick={() => void saveFile()}
            aria-label={'\u4fdd\u5b58'}
            title={'\u4fdd\u5b58'}
            onMouseDown={(event) => event.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded transition-colors"
            style={{
              ...noDrag,
              background: file?.isDirty ? 'rgba(255, 120, 48, 0.14)' : 'rgba(255, 255, 255, 0.04)',
              border: file?.isDirty ? '1px solid rgba(255, 120, 48, 0.24)' : '1px solid rgba(255, 255, 255, 0.08)',
              color: file?.isDirty ? '#ffb084' : '#777',
            }}
          >
            <Save size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {file ? (
          <FileViewerContent file={file} onContentChange={handleContentChange} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[#666]">
            Missing file information
          </div>
        )}
      </div>
    </div>
  )
}
