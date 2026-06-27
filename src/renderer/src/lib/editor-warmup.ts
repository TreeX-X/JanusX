import { loader } from '@monaco-editor/react'

let editorWarmupPromise: Promise<unknown> | null = null

export function warmupEditorRuntime(): Promise<unknown> {
  if (editorWarmupPromise) return editorWarmupPromise

  editorWarmupPromise = loader
    .init()
    .catch((error) => {
      editorWarmupPromise = null
      console.debug('Editor warmup failed:', error)
    })

  return editorWarmupPromise
}
