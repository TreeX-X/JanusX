import type { Memo, MemoEdit } from '../memo'

export const MEMO_CHANNELS = { list: 'memo:list', create: 'memo:create', edit: 'memo:edit', remove: 'memo:remove', changed: 'memo:changed' } as const
export interface MemoAPI {
  list(): Promise<Memo[]>
  create(title: string): Promise<Memo>
  edit(id: string, edit: MemoEdit): Promise<Memo>
  remove(id: string, expectedRevision: number): Promise<void>
  onChanged(callback: (change: { id: string; revision: number | null }) => void): () => void
}
