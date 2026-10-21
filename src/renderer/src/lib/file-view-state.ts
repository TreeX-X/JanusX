import { getEditorFileId, useEditorStore } from '@/stores/editor'
import type { FileViewState } from '../../../shared/editor'
export function readFileViewState(path?: string): FileViewState {
  return useEditorStore.getState().openFiles.find(file => file.id === getEditorFileId(path ?? ''))?.viewState ?? {}
}
export function saveFileViewState(path: string | undefined, state: Partial<FileViewState>): void {
  if (path) useEditorStore.getState().updateViewState(getEditorFileId(path), state)
}
