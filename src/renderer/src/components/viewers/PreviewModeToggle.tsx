export type PreviewMode = 'editor' | 'split' | 'preview'

interface PreviewModeToggleProps {
  value: PreviewMode
  onChange: (value: PreviewMode) => void
}

const modes: Array<{ value: PreviewMode; label: string }> = [
  { value: 'editor', label: '代码' },
  { value: 'split', label: '双栏' },
  { value: 'preview', label: '预览' },
]

export function PreviewModeToggle({ value, onChange }: PreviewModeToggleProps) {
  return (
    <div
      className="flex shrink-0 overflow-hidden rounded"
      style={{
        background: 'rgba(255, 255, 255, 0.035)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
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
              background: active ? 'rgba(255, 120, 48, 0.16)' : 'transparent',
              color: active ? '#ffb084' : '#777',
              borderRight: mode.value === 'preview' ? 'none' : '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            {mode.label}
          </button>
        )
      })}
    </div>
  )
}
