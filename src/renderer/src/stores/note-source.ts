// Note: single-Note delivery is independent of whole-workspace sync — see .agents/notes/blueprint/navigation/note-updates-and-suggestion-navigation.md
import { create } from 'zustand'
import type { NoteSourceRead } from '../../../shared/notes'
import { readNoteSource } from '@/services/harness'
import { readReviewWithDeadline } from '@/services/blueprint-review-read'

export const noteSourceKey = (root: string, uri: string) => root.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase() + '::' + uri
interface State {
  sources: Record<string, NoteSourceRead>
  refresh(root: string, uri: string, force?: boolean): Promise<NoteSourceRead>
}
const pending = new Map<string, { promise: Promise<NoteSourceRead>; controller: AbortController }>()
export const useNoteSourceStore = create<State>((set) => ({
  sources: {},
  refresh(root, uri, force = false) {
    const key = noteSourceKey(root, uri), previous = pending.get(key)
    if (previous && !force) return previous.promise
    previous?.controller.abort(new Error('Note read superseded'))
    const controller = new AbortController()
    const task = { controller, promise: undefined as unknown as Promise<NoteSourceRead> }
    task.promise = readReviewWithDeadline(() => readNoteSource(root, uri), undefined, controller.signal).then(source => {
      if (pending.get(key) === task) set(state => {
        const sources = { ...state.sources }
        // Keep only a small delivery cache; ordinary visits still read actual bytes.
        delete sources[key]
        if (Object.keys(sources).length >= 16) delete sources[Object.keys(sources)[0]]
        return { sources: { ...sources, [key]: source } }
      })
      return source
    }).catch(error => {
      const latest = pending.get(key)
      if (controller.signal.aborted && latest && latest !== task) return latest.promise
      throw error
    }).finally(() => { if (pending.get(key) === task) pending.delete(key) })
    pending.set(key, task)
    return task.promise
  },
}))
