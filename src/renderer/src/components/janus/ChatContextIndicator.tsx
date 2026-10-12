// Note: automatic capacity first, manual fallback after refresh — see .agents/notes/agent/model-registry.md
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { getChatModelBudget, refreshModelCatalog } from '@/services/llm'
import { validChatModelLimits, type ChatModelBudget, type ChatModelLimits } from '../../../../shared/chat-model-limits'
import type { UseJanusChatReturn } from './useJanusChat'

export function ChatContextIndicator({ controller }: { controller: UseJanusChatReturn | null }) {
  const { t } = useI18n('janus')
  const [budget, setBudget] = useState<ChatModelBudget | null>(null)
  const [context, setContext] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshed, setRefreshed] = useState(false)
  const [saved, setSaved] = useState(false)
  const status = controller?.contextStatus
  const model = controller?.activeModel
  const providerId = model?.providerId, modelId = model?.modelId
  const scope = `${controller?.conversationId}:${model?.providerId}:${model?.modelId}`
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const applyBudget = (value: ChatModelBudget) => {
    setBudget(value)
    setContext(value.resolved ? String(value.contextWindow) : '')
    setOutput(value.resolved ? String(value.maxOutputTokens) : '')
  }
  useEffect(() => {
    const current = ++generation.current
    setBudget(null); setContext(''); setOutput(''); setError(''); setSaved(false); setRefreshed(false); setBusy(false)
    if (!providerId || !modelId) return
    void getChatModelBudget(providerId, modelId).then(value => {
      if (current === generation.current && scope === scopeRef.current) applyBudget(value)
    }).catch(reason => { if (current === generation.current && scope === scopeRef.current) setError(String(reason)) })
    return invalidate
  }, [scope, providerId, modelId, invalidate])
  if (!controller || !model) return null
  const disabled = controller.isStreaming || busy
  const manual = budget?.source === 'configured' || refreshed && !budget?.resolved
  const limits: ChatModelLimits = { contextWindow: Number(context), maxOutputTokens: Number(output) }
  const valid = /^\d+$/.test(context) && /^\d+$/.test(output) && validChatModelLimits(limits)
  const unchanged = budget?.resolved && limits.contextWindow === budget.contextWindow && limits.maxOutputTokens === budget.maxOutputTokens
  const update = async () => {
    if (disabled) return
    const current = ++generation.current, requestScope = scope
    setBusy(true); setError(''); setSaved(false)
    try {
      const result = await refreshModelCatalog()
      const value = await getChatModelBudget(model.providerId, model.modelId)
      if (current !== generation.current || requestScope !== scopeRef.current) return
      applyBudget(value); setRefreshed(true)
      if (!result.success) setError(result.error ?? t('janus:chat.context.refreshFailed'))
    } catch (reason) {
      if (current === generation.current && requestScope === scopeRef.current) { setRefreshed(true); setError(String(reason)) }
    } finally { if (current === generation.current) setBusy(false) }
  }
  const save = async (value: ChatModelLimits | null) => {
    if (disabled || !controller.setModelLimits) return
    const current = ++generation.current, requestScope = scope
    setBusy(true); setError(''); setSaved(false)
    try {
      await controller.setModelLimits(value)
      const detected = await getChatModelBudget(model.providerId, model.modelId)
      if (current !== generation.current || requestScope !== scopeRef.current) return
      applyBudget(detected); setSaved(true)
    } catch (reason) { if (current === generation.current && requestScope === scopeRef.current) setError(String(reason)) }
    finally { if (current === generation.current) setBusy(false) }
  }
  const phase = status?.phase === 'ready' && status.checkpoint ? 'compacted' : status?.phase
  return <details className="janus-context-indicator">
    <summary role="status">{budget?.resolved
      ? t('janus:chat.context.usage', { used: Math.round(status?.usedTokens ?? 0).toLocaleString(), limit: budget.contextWindow.toLocaleString() })
      : t(budget || error ? 'janus:chat.context.unmatched' : 'janus:chat.context.detecting')}
      {budget?.resolved && <> · {t(`janus:chat.context.${budget.source}`)}</>}
      {phase && phase !== 'ready' && <> · {t(`janus:chat.context.${phase}`)}</>}
    </summary>
    <p className="janus-context-help">{model.modelId}{' · '}{t('janus:chat.context.hint')}</p>
    {budget?.resolved && <p className="janus-context-help">{t('janus:chat.context.output', { tokens: budget.maxOutputTokens.toLocaleString() })}</p>}
    {!budget?.resolved && (budget || error) && <p className="janus-context-help">{t(refreshed ? 'janus:chat.context.manualHint' : 'janus:chat.context.updateHint')}</p>}
    <button type="button" disabled={disabled} onClick={() => void update()}>{t(busy ? 'janus:chat.context.refreshing' : 'janus:chat.context.refresh')}</button>
    {manual && <form onSubmit={event => {
      event.preventDefault()
      if (valid) void save(limits)
    }}>
      <label>{t('janus:chat.context.configure')} <input type="text" inputMode="numeric" pattern="[0-9]+" maxLength={8} required value={context} disabled={disabled}
        onChange={event => { setContext(event.target.value); setSaved(false); setError('') }} /></label>
      <label>{t('janus:chat.context.configureOutput')} <input type="text" inputMode="numeric" pattern="[0-9]+" maxLength={8} required value={output} disabled={disabled}
        onChange={event => { setOutput(event.target.value); setSaved(false); setError('') }} /></label>
      <button type="submit" disabled={disabled || !valid || unchanged}>{t(busy ? 'janus:chat.context.saving' : 'janus:chat.context.save')}</button>
      {budget?.source === 'configured' && <button type="button" disabled={disabled} onClick={() => void save(null)}>{t('janus:chat.context.automatic')}</button>}
    </form>}
    {status && <button type="button" disabled={disabled || !budget?.resolved} onClick={() => controller.send('/compact')}>{t('janus:chat.context.compact')}</button>}
    {saved && <p role="status">{t('janus:chat.context.saved')}</p>}
    {error && <p role="alert">{error}</p>}
  </details>
}
