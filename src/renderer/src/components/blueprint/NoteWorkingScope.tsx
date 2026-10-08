import { useNoteFocusStore } from '@/stores/note-focus'
import { useBlueprintStore } from '@/stores/blueprint'
import { useI18n } from '@/i18n/useI18n'
import { sameCheckoutPath } from '@/features/blueprint/resolveNodeWorkspace'
import { groupFocusNotes, resolveFocusNodes } from '@/features/blueprint/note-focus'
import type { NoteFocusEvent } from '../../../../shared/note-chat'
import './note-focus.css'

// Note: every entry has an independent module navigation action — see .agents/notes/blueprint/requirements/module-focus-navigation.md
function FocusNoteList({ event, editable = false }: { event: NoteFocusEvent; editable?: boolean }) {
  const { t } = useI18n('blueprint')
  const state = useNoteFocusStore()
  const blueprint = useBlueprintStore(store => store.currentBlueprint)
  const owner = useBlueprintStore(store => blueprint ? store.blueprintWorkspace[blueprint.id] ?? null : null)
  const primary = event.notes.find(note => note.role === 'target') ?? event.notes[0]
  const groups = groupFocusNotes(blueprint, owner, event, state.browser)
  return <div className="bp-note-groups">{groups.map(group => <section className="bp-note-group" key={group.key} data-module-group={group.key}>
    <h4>{group.title ?? t(group.key === 'unavailable' ? 'blueprint:noteFocus.unavailableGroup' : group.key === 'unassigned' ? 'blueprint:noteFocus.unassigned' : 'blueprint:noteFocus.documents')}</h4>
    <ul>{group.items.map(({ note, nodeId, isModule, location }) => <li key={note.uri}>
      <span className={`bp-note-role-${note.role}`}>{t(`blueprint:noteFocus.${note.role}`)}</span>
      {note.uri === primary?.uri && <small>{t('blueprint:noteFocus.primary')}</small>}
      <button className="bp-note-title" type="button" disabled={!nodeId} onClick={() => state.locate({ ...event, notes: [note] }, isModule ? 'preview' : 'locate')}>{note.title}</button>
      {isModule && <button type="button" aria-label={t('blueprint:noteFocus.enter') + ' ' + note.title} onClick={() => state.locate({ ...event, notes: [note] }, 'enter')}>{t('blueprint:noteFocus.enter')}</button>}
      {editable && <>
        <button type="button" aria-label={t('blueprint:noteFocus.pin') + ' ' + note.title} aria-pressed={!!note.pinned} onClick={() => state.pin(event.conversationId, note.uri)}>{note.pinned ? '●' : '○'}</button>
        <button type="button" aria-label={t('blueprint:noteFocus.remove') + ' ' + note.title} onClick={() => state.remove(event.conversationId, note.uri)}>×</button>
      </>}
      <small className="bp-note-location">{t(`blueprint:noteFocus.location.${location}`)}</small>
      {note.reason && <p>{note.reason}</p>}
    </li>)}</ul>
  </section>)}</div>
}

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
      <FocusNoteList event={event} editable />
    </details>
    {missing.length > 0 && <p role="status">{t('blueprint:noteFocus.unavailable', { names: missing.join(' · ') })}</p>}
  </section>
}

// Note: per-turn evidence stays folded beside its reply — see .agents/notes/blueprint/requirements/blueprint-conversation-development.md
export function NoteTurnActivity({ conversationId, workspacePath, turnId }: {
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
    <FocusNoteList event={access} />
    <button type="button" onClick={() => state.locate(access)}>{t('blueprint:noteFocus.locate')}</button>
    <button type="button" onClick={() => state.receive({ ...access, id: crypto.randomUUID(), mode: 'scope', focus: 'none',
      notes: [...(scope?.notes ?? []), ...notes.filter(note => !scope?.notes.some(current => current.uri === note.uri))] })}>{t('blueprint:noteFocus.addScope')}</button>
    {!!missing.length && <p role="status">{t('blueprint:noteFocus.unavailable', { names: missing.join(' · ') })}</p>}
  </details></div>
}
