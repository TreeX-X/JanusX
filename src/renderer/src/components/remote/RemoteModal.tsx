import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/i18n/useI18n'
import { RemotePanel } from './RemotePanel'

interface RemoteModalProps {
  open: boolean
  onClose: () => void
}

/**
 * 远控独立弹窗（xdo：远控搬离侧栏左下角）。
 * 左下角只留 TeamFooter；远控经 StatusBar 胶囊进入此处，获得足够宽度展示
 * 指纹 / 终端输出 / 命令输入，避免窄栏嵌套滚动。
 */
export function RemoteModal({ open, onClose }: RemoteModalProps) {
  const { t } = useI18n()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        background: 'rgba(8,8,10,0.62)',
        backdropFilter: 'blur(10px)',
        zIndex: 1000,
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('team:remote.title')}
        className="flex max-h-[80vh] w-[560px] max-w-[calc(100vw-48px)] flex-col overflow-hidden"
        style={{
          background: 'rgba(22,22,22,0.98)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 8,
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="font-semibold" style={{ fontSize: 13, color: '#fff' }}>
            {t('team:remote.title')}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common:action.close')}
            className="flex h-7 w-7 items-center justify-center rounded-[4px] transition-colors hover:bg-white/[0.06]"
            style={{ color: 'var(--shell-dim)' }}
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: '4px 8px 12px' }}>
          <RemotePanel />
        </div>
      </div>
    </div>,
    document.body,
  )
}
