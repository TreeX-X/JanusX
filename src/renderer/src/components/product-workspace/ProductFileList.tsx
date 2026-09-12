import type { ProductFileEntry } from '../../../../shared/product'
import { useI18n } from '@/i18n/useI18n'

const sortEntries = (entries: ProductFileEntry[]) => [...entries].sort((a, b) => b.mtimeMs - a.mtimeMs || a.relPath.localeCompare(b.relPath))
const formatSize = (size: number) => size < 1024 ? `${size} B` : `${(size / 1024).toFixed(size < 10240 ? 1 : 0)} KB`
const formatKind = (kind: ProductFileEntry['kind']) => kind === 'office' ? 'DOC' : kind.toUpperCase()

export function ProductFileList({ entries, onOpen }: {
  entries: ProductFileEntry[]
  onOpen: (relPath: string) => void
}) {
  const { t } = useI18n('editor')
  const visible = sortEntries(entries)
  if (visible.length === 0) return <div className="p-3 text-xs text-[#666]">{t('editor:product.noProducts')}</div>
  return <div className="max-h-44 overflow-y-auto border-b border-white/[0.06]">
    {visible.map((entry) => <button type="button" key={entry.relPath} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.04]" onClick={() => onOpen(entry.relPath)}>
      <span className="min-w-0 flex-1 truncate text-xs text-[#bbb]" title={entry.relPath}>{entry.relPath}</span>
      <span className="shrink-0 text-[10px] uppercase text-[#666]">{formatKind(entry.kind)}</span>
      <span className="shrink-0 text-[10px] text-[#555]">{formatSize(entry.size)}</span>
    </button>)}
  </div>
}
