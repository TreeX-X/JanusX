// Note: explicit profile overrides stay private and bind the displayed snapshot — see .agents/notes/2026-09-28-unified-memory-laya-primary--736081fc.md
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { PersonalProfileEditContext, PersonalProfileOverrides } from '../../../../shared/ipc/knowledge'
import { useI18n } from '@/i18n/useI18n'
import styles from './PersonalProfileEditor.module.css'
import { CardSkeleton } from '../shared/CardFrame'
import surface from './MemorySurface.module.css'
import { PersonalMemoryForgetForm } from './PersonalMemoryForgetForm'

export function PersonalProfileEditor({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n('knowledge')
  const [context, setContext] = useState<PersonalProfileEditContext | null>(null)
  const [draft, setDraft] = useState<PersonalProfileOverrides>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const generation = useRef(0)
  const pending = useRef(false)
  const [forgetting, setForgetting] = useState<{ id: string; content: string; contentHash: string; kind: 'override' } | null>(null)

  const load = async () => {
    const request = ++generation.current
    setBusy(true)
    setError('')
    try {
      const next = await window.electron.knowledge.personalProfileEditContext()
      if (request !== generation.current) return
      setContext(next)
      setDraft(next.overrides)
      setStale(false)
    } catch {
      if (request === generation.current) setError(t('knowledge:persona.overrides.loadFailed'))
    } finally {
      if (request === generation.current) setBusy(false)
    }
  }
  useEffect(() => {
    void load()
    return () => { generation.current += 1 }
    // Opening the editor reads once; activation and language changes must not discard edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const identity = draft.identity?.trim()
  const formats = (draft.formatPrefs ?? []).map(value => value.trim()).filter(Boolean)
  const tools = (draft.toolPrefs ?? []).map(value => value.trim()).filter(Boolean)
  const overrides: PersonalProfileOverrides = {
    ...(identity ? { identity } : {}),
    ...(formats.length ? { formatPrefs: formats } : {}),
    ...(tools.length ? { toolPrefs: tools } : {}),
  }
  const valid = (identity?.length ?? 0) <= 500 && [...formats, ...tools].every(value => value.length <= 500)
    && formats.length <= 50 && tools.length <= 50
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!context || !valid || busy || stale || pending.current) return
    pending.current = true
    const request = generation.current
    setBusy(true)
    setError('')
    try {
      await window.electron.knowledge.savePersonalProfile({ expectedHash: context.hash, overrides })
      if (request === generation.current) onSaved()
    } catch (reason) {
      if (request !== generation.current) return
      const message = reason instanceof Error ? reason.message : ''
      const changed = message.includes('Personal profile changed')
      setStale(changed)
      setError(t(changed ? 'knowledge:persona.overrides.stale'
        : message.includes('forgotten content') ? 'knowledge:persona.overrides.forgotten' : 'knowledge:persona.overrides.saveFailed'))
    } finally {
      pending.current = false
      if (request === generation.current) setBusy(false)
    }
  }

  if (forgetting) return <PersonalMemoryForgetForm memory={forgetting} onClose={() => setForgetting(null)}
    onForgotten={() => { setForgetting(null); void load() }} />
  const forgetButton = (id: string, content: string | undefined) => content && context && <button type="button" disabled={busy}
    onClick={() => setForgetting({ id, content, contentHash: context.hash, kind: 'override' })}>{t('knowledge:persona.forgetMemory')}</button>
  return <form className={`${styles.root} ${surface.enter}`} onSubmit={event => void submit(event)} aria-label={t('knowledge:persona.overrides.edit')} aria-busy={busy}>
    <header className={styles.header}><h3>{t('knowledge:persona.overrides.edit')}</h3><p>{t('knowledge:persona.overrides.detail')}</p></header>
    <div className={styles.body}>
    {!context && busy && <CardSkeleton lines={4} label={t('knowledge:state.loading.title')} />}
    {context && <>
      <section className={styles.field}><label>{t('knowledge:persona.overrides.identity')}<textarea rows={3} className={styles.editor} maxLength={500} disabled={busy}
        value={draft.identity ?? ''} onChange={event => setDraft({ ...draft, identity: event.target.value })} /></label>
      {forgetButton('identity', context.overrides.identity)}</section>
      {(['formatPrefs', 'toolPrefs'] as const).map(field => <fieldset key={field} disabled={busy}>
        <legend>{t(field === 'formatPrefs' ? 'knowledge:persona.overrides.formatPrefs' : 'knowledge:persona.overrides.toolPrefs')}</legend>
        {(draft[field] ?? []).map((value, index) => <label key={index}>
          {t('knowledge:persona.overrides.entry', { index: index + 1 })}
          <textarea rows={2} className={styles.editor} maxLength={500} value={value} onChange={event => setDraft({ ...draft,
            [field]: draft[field]!.map((item, i) => i === index ? event.target.value : item) })} />
          {forgetButton(`${field}:${index}`, context.overrides[field]?.[index])}
        </label>)}
        <div className={styles.filters}><button type="button" disabled={(draft[field]?.length ?? 0) >= 50}
          onClick={() => setDraft({ ...draft, [field]: [...(draft[field] ?? []), ''] })}>{t('knowledge:persona.overrides.add')}</button></div>
      </fieldset>)}
    </>}
    {error && <p role="alert">{error}</p>}
    </div>
    <footer className={styles.footer}>
      <button type="submit" disabled={!context || !valid || busy || stale}>{t('knowledge:persona.overrides.save')}</button>
      {(!context || stale) && <button type="button" disabled={busy} onClick={() => void load()}>{t('knowledge:persona.overrides.reload')}</button>}
      <button type="button" onClick={onClose}>{t('knowledge:action.close')}</button>
    </footer>
  </form>
}
