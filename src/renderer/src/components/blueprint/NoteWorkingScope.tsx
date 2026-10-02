import { useNoteFocusStore } from '@/stores/note-focus'
import { useBlueprintStore } from '@/stores/blueprint'
import { useI18n } from '@/i18n/useI18n'
import { sameCheckoutPath } from '@/features/blueprint/resolveNodeWorkspace'
import { resolveFocusNodes } from '@/features/blueprint/note-focus'
import type { NoteFocusEvent } from '../../../../shared/note-chat'
import './note-focus.css'

export function NoteWorkingScope({ conversationId, workspacePath, history = false }: { conversationId: string; workspacePath: string; history?: boolean }) {
  const { t } = useI18n('blueprint')
  const state = useNoteFocusStore()
  const blueprint = useBlueprintStore(store => store.currentBlueprint)
  const owner = useBlueprintStore(store => blueprint ? store.blueprintWorkspace[blueprint.id] ?? null : null)
  if (history) return <div className="bp-note-locations">{state.history.filter(event => event.conversationId === conversationId && sameCheckoutPath(event.workspacePath, workspacePath)).map(event => <details key={event.id}>
    <summary>{event.reason}</summary>
    <p>{event.notes.map(note => note.title).join(' · ')}</p>
    {resolveFocusNodes(blueprint, owner, event).missing.length > 0 && <p role="status">{t('blueprint:noteFocus.unavailable', { names: resolveFocusNodes(blueprint, owner, event).missing.join(' · ') })}</p>}
    <button type="button" onClick={() => state.locate(event)}>{t('blueprint:noteFocus.locate')}</button>
  </details>)}</div>
  const scope = state.scopes[conversationId]
  const access = [...state.history].reverse().find(event => event.mode === 'access' && event.conversationId === conversationId && sameCheckoutPath(event.workspacePath, workspacePath))
  const accessCard = access && <section className="bp-note-scope bp-note-access" aria-label={t('blueprint:noteFocus.read')}>
    <header><span>{t('blueprint:noteFocus.read')} · {access.notes.length}</span>
      <button type="button" onClick={() => state.locate(access)}>{t('blueprint:noteFocus.locate')}</button>
      <button type="button" onClick={() => state.receive({ ...access, id: crypto.randomUUID(), mode: 'scope', focus: 'none',
        notes: [...(scope?.notes ?? []), ...access.notes.filter(note => !scope?.notes.some(current => current.uri === note.uri))] })}>{t('blueprint:noteFocus.addScope')}</button>
    </header>
    <p>{access.notes.map(note => note.title).join(' · ')}</p>
    {!!state.hidden[conversationId]?.length && <p role="status">{t('blueprint:noteFocus.hidden', { count: state.hidden[conversationId].length })}</p>}
    {!!resolveFocusNodes(blueprint, owner, access).missing.length && <p role="status">{t('blueprint:noteFocus.unavailable', { names: resolveFocusNodes(blueprint, owner, access).missing.join(' · ') })}</p>}
  </section>
  if (!scope || (!scope.notes.length && !scope.excluded.length) || !sameCheckoutPath(scope.workspacePath, workspacePath)) return accessCard ?? null
  const event: NoteFocusEvent = { id: 'current', conversationId, workspacePath, mode: 'display', focus: 'explicit', reason: '', notes: scope.notes }
  const { missing } = resolveFocusNodes(blueprint, owner, event)
  return <>{accessCard}<section className="bp-note-scope" aria-label={t('blueprint:noteFocus.scope')}>
    <header><span>{t('blueprint:noteFocus.scope')} · {scope.notes.length}</span>
      <button type="button" onClick={() => state.locate(event)}>{t('blueprint:noteFocus.locate')}</button>
      <button type="button" onClick={() => state.clear(conversationId)}>{t('blueprint:noteFocus.clear')}</button>
    </header>
    <details><summary>{scope.notes.map(note => note.title).join(' · ')}</summary>
      <ul>{scope.notes.map(note => <li key={note.uri}>
        <span className={`bp-note-role-${note.role}`}>{t(`blueprint:noteFocus.${note.role}`)}</span>
        <button className="bp-note-title" type="button" onClick={() => state.locate({ ...event, notes: [note] })}>{note.title}</button>
        <button type="button" aria-label={t('blueprint:noteFocus.pin') + ' ' + note.title} aria-pressed={!!note.pinned} onClick={() => state.pin(conversationId, note.uri)}>{note.pinned ? '●' : '○'}</button>
        <button type="button" aria-label={t('blueprint:noteFocus.remove') + ' ' + note.title} onClick={() => state.remove(conversationId, note.uri)}>×</button>
        <p>{note.reason}</p>
      </li>)}</ul>
    </details>
    {missing.length > 0 && <p role="status">{t('blueprint:noteFocus.unavailable', { names: missing.join(' · ') })}</p>}
  </section></>
}
