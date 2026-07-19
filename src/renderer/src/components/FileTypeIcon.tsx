import type { FilePresentation } from '@/lib/file-presentation'
import styles from './FileTypeIcon.module.css'

interface FileTypeIconProps {
  presentation: FilePresentation
  active?: boolean
}

export function FileTypeIcon({ presentation, active = false }: FileTypeIconProps) {
  const kind = presentation.iconKind
  return (
    <span
      className={`${styles.icon} ${styles[presentation.colorToken]}${active ? ` ${styles.active}` : ''}`}
      data-file-kind={kind}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'folder' ? (
          <path d="M1.5 4.5h5l1.2 1.4h6.8v6.6h-13zM1.5 4.5V3h4.2l1.2 1.5" />
        ) : kind === 'image' ? (
          <><rect x="2" y="2" width="12" height="12" rx="1.5" /><circle cx="5.2" cy="5.3" r="1" /><path d="m3.5 12 3.2-3.2 2.1 2 1.6-1.5 2.1 2.7" /></>
        ) : kind === 'database' ? (
          <><ellipse cx="8" cy="3.5" rx="5" ry="2" /><path d="M3 3.5v4c0 1.1 2.2 2 5 2s5-.9 5-2v-4M3 7.5v4c0 1.1 2.2 2 5 2s5-.9 5-2v-4" /></>
        ) : kind === 'archive' ? (
          <><path d="M3 2.5h10v11H3zM3 5.5h10M7 2.5v3M9 2.5v3" /><path d="M6.5 8h3v2h-3z" /></>
        ) : kind === 'config' ? (
          <><path d="M3 4h10M3 8h10M3 12h10" /><circle cx="6" cy="4" r="1.3" fill="var(--icon-surface)" /><circle cx="10" cy="8" r="1.3" fill="var(--icon-surface)" /><circle cx="7.5" cy="12" r="1.3" fill="var(--icon-surface)" /></>
        ) : kind === 'data' ? (
          <><path d="M5.5 2.5H4v4L2.5 8 4 9.5v4h1.5M10.5 2.5H12v4L13.5 8 12 9.5v4h-1.5" /><circle cx="8" cy="8" r=".65" fill="currentColor" stroke="none" /></>
        ) : kind === 'code' ? (
          <path d="m5.5 4-3 4 3 4M10.5 4l3 4-3 4M9 2.8 7 13.2" />
        ) : kind === 'binary' ? (
          <><rect x="2.5" y="2.5" width="4" height="4" /><rect x="9.5" y="2.5" width="4" height="4" /><rect x="2.5" y="9.5" width="4" height="4" /><rect x="9.5" y="9.5" width="4" height="4" /></>
        ) : (
          <><path d="M3 1.8h6.5L13 5.3v8.9H3zM9.5 1.8v3.5H13" />{kind === 'markdown' ? <path d="M5 11V7l1.8 2L8.5 7v4M10 7v4m-1.2-1.2L10 11l1.2-1.2" /> : kind === 'document' ? <path d="M5 7h6M5 9.5h6M5 12h4" /> : <text x="8" y="11" textAnchor="middle" stroke="none" fill="currentColor" fontSize="4.2" fontWeight="600">{languageMark(kind)}</text>}</>
        )}
      </svg>
    </span>
  )
}

function languageMark(kind: FilePresentation['iconKind']): string {
  if (kind === 'typescript') return 'TS'
  if (kind === 'javascript') return 'JS'
  if (kind === 'python') return 'PY'
  if (kind === 'rust') return 'RS'
  return '<>'
}
