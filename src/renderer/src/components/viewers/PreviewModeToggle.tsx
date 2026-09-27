import { useI18n } from '@/i18n/useI18n'

export type PreviewMode = 'editor' | 'split' | 'preview'

interface PreviewModeToggleProps {
  value: PreviewMode
  onChange: (value: PreviewMode) => void
}

export function PreviewModeToggle({ value, onChange }: PreviewModeToggleProps) {
  const { t } = useI18n('editor')
  const modes: Array<{ value: PreviewMode; label: string }> = [
    { value: 'editor', label: t('editor:previewMode.code') },
    { value: 'split', label: t('editor:previewMode.split') },
    { value: 'preview', label: t('editor:previewMode.preview') },
  ]
  return (
    <div
      className="flex shrink-0 overflow-hidden rounded"
      style={{
        background: 'transparent',
        border: '1px solid var(--control-border)',
      }}
    >
      {modes.map((mode) => {
        const active = mode.value === value
        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            className="h-6 px-2.5 text-[10px] transition-colors"
            style={{
              background: active ? 'var(--shell-accent-mid)' : 'transparent',
              color: active ? 'var(--shell-accent-strong)' : 'var(--shell-dim)',
              borderRight: mode.value === 'preview' ? 'none' : '1px solid var(--shell-border-soft)',
            }}
          >
            {mode.label}
          </button>
        )
      })}
    </div>
  )
}
