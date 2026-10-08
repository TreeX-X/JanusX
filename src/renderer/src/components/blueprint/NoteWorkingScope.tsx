import { useNoteFocusStore } from '@/stores/note-focus'
import { useBlueprintStore } from '@/stores/blueprint'
import { useI18n } from '@/i18n/useI18n'
import { sameCheckoutPath } from '@/features/blueprint/resolveNodeWorkspace'
import { resolveFocusNodes } from '@/features/blueprint/note-focus'
import type { NoteFocusEvent } from '../../../../shared/note-chat'
import './note-focus.css'

export function NoteWorkingScope({ conversationId, workspacePath }: { conversationId: string; workspacePath: string }) {
  const { t } = useI18n('blueprint')
  const state = useNoteFocusStore()
  const blueprint = useBlueprintStore(store => store.currentBlueprint)
  const owner = useBlueprintStore(store => blueprint ? store.blueprintWorkspace[blueprint.id] ?? null : null)
  const scope = state.scopes[conversationId]
  if (!scope || (!scope.notes.length && !scope.excluded.length) || !sameCheckoutPath(scope.workspacePath, workspacePath)) return null
  const event: NoteFocusEvent = { id: 'current', conversationId, workspacePath, mode: 'display', focus: 'explicit', reason: '', notes: scope.notes }
  const { missing } = resolveFocusNodes(blueprint, owner, event)
  return <section className="bp-note-scope" aria-label={t('blueprint:noteFocus.scope')}>
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
  </section>
}

// Note: per-turn evidence stays folded beside its reply — see .agents/notes/blueprint/requirements/blueprint-conversation-development.md
export function NoteTurnActivity({ conversationId, workspacePath, turnId, live = false }: {
  conversationId: string; workspacePath: string; turnId?: string; live?: boolean
}) {
  const { t } = useI18n('blueprint')
  const state = useNoteFocusStore()
  const blueprint = useBlueprintStore(store => store.currentBlueprint)
  const owner = useBlueprintStore(store => blueprint ? store.blueprintWorkspace[blueprint.id] ?? null : null)
  const events = state.history.filter(event => event.conversationId === conversationId
    && sameCheckoutPath(event.workspacePath, workspacePath)
    && !!turnId && event.turnId === turnId)
  const latest = events.at(-1)
  if (!latest) return null
  const notes = [...new Map(events.flatMap(event => event.notes).map(note => [note.uri, note])).values()]
  const access: NoteFocusEvent = { ...latest, notes }
  const scope = state.scopes[conversationId]
  const { missing } = resolveFocusNodes(blueprint, owner, access)
  return <div className="bp-note-locations"><details className="bp-note-access">
    <summary>{t('blueprint:noteFocus.read')} · {notes.length}</summary>
    <ul>{notes.map(note => <li key={note.uri}>{note.title}</li>)}</ul>
    <button type="button" onClick={() => state.locate(access)}>{t('blueprint:noteFocus.locate')}</button>
    <button type="button" onClick={() => state.receive({ ...access, id: crypto.randomUUID(), mode: 'scope', focus: 'none',
      notes: [...(scope?.notes ?? []), ...notes.filter(note => !scope?.notes.some(current => current.uri === note.uri))] })}>{t('blueprint:noteFocus.addScope')}</button>
    {live && !!state.hidden[conversationId]?.length && <p role="status">{t('blueprint:noteFocus.hidden', { count: state.hidden[conversationId].length })}</p>}
    {!!missing.length && <p role="status">{t('blueprint:noteFocus.unavailable', { names: missing.join(' · ') })}</p>}
  </details></div>
}
