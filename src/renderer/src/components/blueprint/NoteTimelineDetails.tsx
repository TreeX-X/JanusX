// Note: process cards reference current business records; rendering never replays writes — see .agents/notes/agent/requirements/chat-work-timeline.md
import type { ChatToolBlock } from '../../../../shared/chat-timeline'
import { useEffect } from 'react'
import { useNoteChatStore } from '@/stores/note-chat'
import { useNoteFocusStore } from '@/stores/note-focus'
import { useI18n } from '@/i18n/useI18n'
import { ChangeCard } from './NoteChatActivity'
import { FocusNoteList } from './NoteWorkingScope'

export function NoteTimelineDetails({ block }: { block: ChatToolBlock }) {
  const { t } = useI18n(['janus', 'blueprint'])
  const changes = useNoteChatStore(state => state.changes)
  const locate = useNoteFocusStore(state => state.locate)
  useEffect(() => {
    const missing = block.details?.find(detail => detail.kind === 'note-change' && detail.workspacePath && detail.conversationId
      && !useNoteChatStore.getState().changes.some(change => change.id === detail.id))
    if (missing?.kind !== 'note-change') return
    let active = true
    void window.electron.harness.noteChatChanges(missing.workspacePath!, missing.conversationId!).then(records => {
      if (!active) return
      useNoteChatStore.setState(state => {
        const merged = new Map(state.changes.map(change => [change.id, change]))
        for (const record of records) if (!merged.has(record.id)) merged.set(record.id, record)
        return { changes: [...merged.values()] }
      })
    }).catch(() => undefined)
    return () => { active = false }
  }, [block.details])
  return <>{block.details?.map(detail => {
    if (detail.kind === 'config') return null
    if (detail.kind === 'note-change') {
      const change = changes.find(change => change.id === detail.id)
      return change ? <ChangeCard key={detail.id} change={change} /> : <p key={detail.id} role="status">{t('janus:chat.timeline.changeUnavailable')}</p>
    }
    return <details key={detail.focus.id} className="bp-note-access">
      <summary>{t('blueprint:noteFocus.read')} · {detail.focus.notes.length}</summary>
      <FocusNoteList event={detail.focus} />
      <button type="button" onClick={() => locate(detail.focus)}>{t('blueprint:noteFocus.locate')}</button>
      <button type="button" onClick={() => {
        const state = useNoteFocusStore.getState()
        const current = state.scopes[detail.focus.conversationId]?.notes ?? []
        state.receive({ ...detail.focus, id: crypto.randomUUID(), mode: 'scope', focus: 'none',
          notes: [...current, ...detail.focus.notes.filter(note => !current.some(item => item.uri === note.uri))] })
      }}>{t('blueprint:noteFocus.addScope')}</button>
    </details>
  })}</>
}
