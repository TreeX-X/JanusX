import { lazy, Suspense } from 'react'
import { useEditorStore } from '@/stores/editor'
const FileWindow = lazy(() => import('./StandaloneFileEditor').then(module => ({ default: module.StandaloneFileEditor })))
// Note: same content and toolbar in both hosts ? .agents/notes/workbench/unified-file-window.md
export function FileEditor() {
  const visible = useEditorStore(state => state.isVisible && state.openFiles.length > 0)
  return visible ? <Suspense fallback={null}><FileWindow embedded /></Suspense> : null
}
