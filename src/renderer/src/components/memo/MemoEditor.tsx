import { useEffect, useRef, useState, type KeyboardEvent, type ChangeEvent } from 'react'
import { Check, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'

export type MemoDraft = { text: string; revision: number; conflicted?: boolean }
type DraftProps = { drafts: Map<string, MemoDraft>; fieldId: string; revision: number; onSave: (value: string, revision: number) => Promise<number> }

export function EditField({ value, revision, label, placeholder, multiline = false, allowEmpty = false, onSave, drafts, fieldId }: DraftProps & {
  value: string; label: string; placeholder?: string; multiline?: boolean; allowEmpty?: boolean
}) {
  const { t } = useI18n('janus')
  const saved = drafts.get(fieldId)
  const [draft, setDraft] = useState(saved?.text ?? value)
  const [status, setStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>(saved?.conflicted ? 'error' : saved ? 'dirty' : 'idle')
  const [focused, setFocused] = useState(false)
  const dirty = useRef(Boolean(saved)), saving = useRef(false)
  const latestDraft = useRef(saved?.text ?? value)
  const baseRevision = useRef(saved?.conflicted ? revision : saved?.revision ?? revision)
  const latestRevision = useRef(revision)
  latestRevision.current = revision
  useEffect(() => { if (!dirty.current) { latestDraft.current = value; setDraft(value) } }, [value])
  useEffect(() => { if (status !== 'saved') return; const timer = setTimeout(() => setStatus('idle'), 1400); return () => clearTimeout(timer) }, [status])
  const change = (text: string) => {
    if (!dirty.current) baseRevision.current = revision
    latestDraft.current = text; dirty.current = true
    drafts.set(fieldId, { text, revision: baseRevision.current }); setStatus('dirty'); setDraft(text)
  }
  const save = async () => {
    if (saving.current || !dirty.current) return
    const snapshot = latestDraft.current
    if (snapshot === value) { dirty.current = false; drafts.delete(fieldId); setStatus('idle'); return }
    if (!allowEmpty && !snapshot.trim()) { setStatus('error'); return }
    saving.current = true; setStatus('saving')
    try {
      const nextRevision = await onSave(snapshot, baseRevision.current)
      baseRevision.current = nextRevision
      if (latestDraft.current === snapshot) { dirty.current = false; drafts.delete(fieldId); setStatus('saved') }
      else { drafts.set(fieldId, { text: latestDraft.current, revision: nextRevision }); setStatus('dirty') }
    } catch {
      baseRevision.current = latestRevision.current
      drafts.set(fieldId, { text: latestDraft.current, revision: baseRevision.current, conflicted: true }); setStatus('error')
    } finally { saving.current = false }
  }
  const revert = () => { if (saving.current) return; latestDraft.current = value; dirty.current = false; drafts.delete(fieldId); setDraft(value); setStatus('idle') }
  const keyboard = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape' && dirty.current) { event.preventDefault(); event.stopPropagation(); revert() }
    else if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) { event.preventDefault(); void save() }
  }
  const props = { 'aria-label': label, placeholder, value: draft, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(event.target.value),
    onFocus: () => setFocused(true), onBlur: () => { setFocused(false); void save() }, onKeyDown: keyboard }
  const stateText = status === 'error' ? !allowEmpty && !draft.trim() ? t('janus:memo.required') : t('janus:memo.saveFailed') : status === 'saving' ? t('janus:memo.saving') : status === 'saved' ? t('janus:memo.saved') : t('janus:memo.unsaved')
  return <div className="memo-field" data-state={status} data-focused={focused}>
    {multiline ? <textarea {...props} rows={1} maxLength={10000} /> : <input {...props} maxLength={120} />}
    {status !== 'idle' && <div className="memo-field-state" role="status"><span>{status === 'saving' && <LoaderCircle size={11} className="memo-saving" />}{status === 'saved' && <Check size={11} />}{stateText}</span>
      {(status === 'dirty' || status === 'error') && <div><button type="button" aria-label={t('janus:memo.discardField', { label })} title={t('janus:memo.discardField', { label })} onPointerDown={event => event.preventDefault()} onClick={revert}><RotateCcw size={12} /></button><button type="button" aria-label={t('janus:memo.saveField', { label })} title={t('janus:memo.saveField', { label })} onPointerDown={event => event.preventDefault()} onClick={() => void save()}><Check size={12} /></button></div>}
    </div>}
  </div>
}

export function PointComposer({ revision, drafts, fieldId, onSave, onClose }: DraftProps & { onClose: () => void }) {
  const { t } = useI18n('janus')
  const saved = drafts.get(fieldId)
  const [text, setText] = useState(saved?.text ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const baseRevision = useRef(saved?.conflicted ? revision : saved?.revision ?? revision)
  const latestRevision = useRef(revision)
  latestRevision.current = revision
  const submit = async () => {
    if (submitting.current) return
    if (!text.trim()) { setError(t('janus:memo.required')); return }
    submitting.current = true; setBusy(true)
    try { await onSave(text, baseRevision.current); drafts.delete(fieldId); onClose() }
    catch { baseRevision.current = latestRevision.current; drafts.set(fieldId, { text, revision: baseRevision.current, conflicted: true }); setError(t('janus:memo.saveFailed')) }
    finally { submitting.current = false; setBusy(false) }
  }
  const cancel = () => { if (submitting.current) return; drafts.delete(fieldId); onClose() }
  return <form className="memo-point-composer" role="dialog" aria-label={t('janus:memo.addPoint')} onSubmit={event => { event.preventDefault(); void submit() }} onKeyDown={event => {
    event.stopPropagation()
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); cancel() }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void submit() }
  }}>
    <textarea autoFocus rows={3} maxLength={10000} aria-label={t('janus:memo.pointText')} placeholder={t('janus:memo.pointPlaceholder')} value={text} disabled={busy} onChange={event => {
      setText(event.target.value); setError(null); drafts.set(fieldId, { text: event.target.value, revision: baseRevision.current })
    }} />
    {error && <p role="status">{error}</p>}
    <div className="memo-composer-actions"><span>{busy ? t('janus:memo.saving') : t('janus:memo.recordHint')}</span><button type="button" aria-label={t('janus:memo.cancel')} onClick={cancel} disabled={busy}><X size={14} /></button><button type="submit" aria-label={t('janus:memo.confirm')} disabled={busy}><Check size={14} /></button></div>
  </form>
}
