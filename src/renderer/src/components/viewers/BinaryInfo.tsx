import { useI18n } from '@/i18n/useI18n'

interface BinaryInfoProps {
  fileName: string
  size?: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function BinaryInfo({ fileName, size }: BinaryInfoProps) {
  const { t } = useI18n('editor')
  return (
    <div
      className="flex flex-col items-center justify-center flex-1 gap-3"
      style={{ background: 'var(--shell-void)', minHeight: 0 }}
    >
      <svg
        width="48"
        height="56"
        viewBox="0 0 48 56"
        fill="none"
        style={{ opacity: 0.5 }}
      >
        <path
          d="M4 6C4 3.79086 5.79086 2 8 2H32L44 14V50C44 52.2091 42.2091 54 40 54H8C5.79086 54 4 52.2091 4 50V6Z"
          fill="none"
          style={{ fill: 'var(--shell-chrome-raised)', stroke: 'var(--shell-dim)' }}
          strokeWidth="1.5"
        />
        <path
          d="M32 2L44 14H36C33.7909 14 32 12.2091 32 10V2Z"
          fill="none"
          style={{ fill: 'var(--shell-hover)', stroke: 'var(--shell-dim)' }}
          strokeWidth="1.5"
        />
      </svg>
      <span style={{ color: 'var(--shell-muted)', fontSize: 13 }}>{fileName}</span>
      {size !== undefined && (
        <span style={{ color: 'var(--shell-dim)', fontSize: 11 }}>{formatSize(size)}</span>
      )}
      <span style={{ color: 'var(--shell-dim)', fontSize: 11, marginTop: 4 }}>
        {t('editor:binaryInfo.notSupported')}
      </span>
    </div>
  )
}
