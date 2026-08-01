let editorWarmupPromise: Promise<unknown> | null = null

/**
 * P4: @monaco-editor/react 经动态 import 加载，Monaco 相关代码不进首屏 bundle；
 * 预热仍在空闲期触发（App 的 requestIdleCallback 路径），首次打开编辑器即热。
 */
export function warmupEditorRuntime(): Promise<unknown> {
  if (editorWarmupPromise) return editorWarmupPromise

  editorWarmupPromise = import('@monaco-editor/react')
    .then(({ loader }) => loader.init())
    .catch((error) => {
      editorWarmupPromise = null
      console.debug('Editor warmup failed:', error)
    })

  return editorWarmupPromise
}
