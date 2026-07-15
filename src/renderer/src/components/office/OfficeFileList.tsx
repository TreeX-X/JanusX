import { useEffect, useState } from 'react'
import type { OfficeErrorCode, OfficeFileEntry } from '../../../../shared/office'
import { officeService } from '../../services/office'

const sortEntries = (entries: OfficeFileEntry[]) => [...entries].sort((a, b) => b.mtimeMs - a.mtimeMs)
const formatSize = (size: number) => size < 1024 ? `${size} B` : `${(size / 1024).toFixed(size < 10240 ? 1 : 0)} KB`

export interface OfficeFileListState {
  workspaceId: string
  entries: OfficeFileEntry[]
  errorCode?: OfficeErrorCode
}

export function visibleOfficeFileState(state: OfficeFileListState, workspaceId: string): OfficeFileListState {
  return state.workspaceId === workspaceId ? state : { workspaceId, entries: [] }
}

export function OfficeFileList({ workspaceId, onOpen }: { workspaceId: string; onOpen: (relPath: string) => void }) {
  const [state, setState] = useState<OfficeFileListState>({ workspaceId, entries: [] })
  const visible = visibleOfficeFileState(state, workspaceId)

  useEffect(() => {
    let disposed = false
    setState({ workspaceId, entries: [] })
    void officeService.listFiles({ workspaceId }).then((result) => {
      if (disposed) return
      if (result.ok) setState({ workspaceId, entries: sortEntries(result.value) })
      else setState({ workspaceId, entries: [], errorCode: result.error.code })
    })
    const unsubscribe = officeService.onFilesChanged((event) => {
      if (!disposed && event.workspaceId === workspaceId) setState({ workspaceId, entries: sortEntries(event.entries) })
    })
    return () => { disposed = true; unsubscribe() }
  }, [workspaceId])

  if (visible.errorCode) return <div className="p-3 text-xs text-[#888]">文件列表不可用（{visible.errorCode}）</div>
  if (visible.entries.length === 0) return <div className="p-3 text-xs text-[#666]">当前工作区没有 Office 文档</div>
  return <div className="max-h-44 overflow-y-auto border-b border-white/[0.06]">
    {visible.entries.map((entry) => <button type="button" key={entry.relPath} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.04]" onClick={() => onOpen(entry.relPath)}>
      <span className="min-w-0 flex-1 truncate text-xs text-[#bbb]" title={entry.relPath}>{entry.relPath}</span>
      <span className="shrink-0 text-[10px] uppercase text-[#666]">{entry.ext.slice(1)}</span>
      <span className="shrink-0 text-[10px] text-[#555]">{formatSize(entry.size)}</span>
    </button>)}
  </div>
}
