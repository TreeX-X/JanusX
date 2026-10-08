// Note: expose budget provenance and apply model-scoped overrides on the next turn — see .agents/notes/blueprint/maintenance/requirements/blueprint-conversation-development.md
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { UseJanusChatReturn } from './useJanusChat'

export function ChatContextIndicator({ controller }: { controller: UseJanusChatReturn | null }) {
  const { t } = useI18n('janus')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const status = controller?.contextStatus
  const model = controller?.activeModel
  const windowTokens = status?.windowTokens
  const scope = `${controller?.conversationId}:${model?.providerId}:${model?.modelId}`
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  useEffect(() => {
    setValue(windowTokens === undefined ? '' : String(windowTokens))
  }, [scope, windowTokens])
  useEffect(() => {
    setError('')
    setSaved(false)
  }, [scope])
  if (!controller || !status) return null
  const phase = status.phase === 'ready' && status.checkpoint ? 'compacted' : status.phase
  const tokens = Number(value)
  const valid = /^\d+$/.test(value) && Number.isSafeInteger(tokens) && tokens >= 1024 && tokens <= 10_000_000
  const disabled = controller.isStreaming || saving
  const saveWindow = (tokens: number | null) => {
    if (disabled || !controller.setContextWindow) return
    setError('')
    setSaved(false)
    setSaving(true)
    void controller.setContextWindow(tokens).then(() => {
      if (scopeRef.current === scope) setSaved(true)
    }).catch(reason => {
      if (scopeRef.current === scope) setError(String(reason))
    }).finally(() => setSaving(false))
  }
  return <details className="janus-context-indicator">
    <summary role="status">{t('janus:chat.context.usage', { used: Math.round(status.usedTokens).toLocaleString(), limit: status.windowTokens.toLocaleString() })}
      {' · '}{t(`janus:chat.context.${status.source}`)}
      {phase !== 'ready' && <> · {t(`janus:chat.context.${phase}`)}</>}
    </summary>
    <p className="janus-context-help">{model?.modelId}{' · '}{t('janus:chat.context.hint')}</p>
    {status.source === 'estimated' && <p className="janus-context-help">{t('janus:chat.context.estimatedHint')}</p>}
    <form onSubmit={event => {
      event.preventDefault()
      if (valid) saveWindow(tokens)
    }}>
      <label>{t('janus:chat.context.configure')} <input type="text" inputMode="numeric" pattern="[0-9]+" maxLength={8} required value={value} disabled={disabled}
        onChange={event => { setValue(event.target.value); setSaved(false); setError('') }} /></label>
      <button type="submit" disabled={disabled || !valid || tokens === status.windowTokens}>{t(saving ? 'janus:chat.context.saving' : 'janus:chat.context.save')}</button>
      {status.source === 'configured' && <button type="button" disabled={disabled} onClick={() => saveWindow(null)}>{t('janus:chat.context.automatic')}</button>}
      <button type="button" disabled={disabled} onClick={() => controller.send('/compact')}>{t('janus:chat.context.compact')}</button>
      {saved && <p role="status">{t('janus:chat.context.saved')}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  </details>
}
