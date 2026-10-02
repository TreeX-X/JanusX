import { useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { UseJanusChatReturn } from './useJanusChat'

export function ChatContextIndicator({ controller }: { controller: UseJanusChatReturn | null }) {
  const { t } = useI18n('janus')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const status = controller?.contextStatus
  if (!controller || !status) return null
  const phase = status.phase === 'ready' && status.checkpoint ? 'compacted' : status.phase
  return <details className="janus-context-indicator">
    <summary role="status">{t('janus:chat.context.usage', { used: Math.round(status.usedTokens).toLocaleString(), limit: status.windowTokens.toLocaleString() })}
      {' · '}{t(`janus:chat.context.${status.source}`)}
      {phase !== 'ready' && <> · {t(`janus:chat.context.${phase}`)}</>}
    </summary>
    <form onSubmit={event => {
      event.preventDefault()
      setError('')
      void controller.setContextWindow?.(Number(value)).catch(reason => setError(String(reason)))
    }}>
      <label>{t('janus:chat.context.configure')} <input type="number" min={1024} max={10000000} step={1} required value={value}
        placeholder={String(status.windowTokens)} onChange={event => setValue(event.target.value)} /></label>
      <button type="submit" disabled={controller.isStreaming}>{t('janus:chat.context.save')}</button>
      <button type="button" disabled={controller.isStreaming} onClick={() => controller.send('/compact')}>{t('janus:chat.context.compact')}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </details>
}
