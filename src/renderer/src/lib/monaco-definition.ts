import type { editor as MonacoEditor, IDisposable } from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'
import { typescript } from 'monaco-editor/esm/vs/editor/editor.main'
import type { DefinitionLocation, NativeSourceLanguage } from '../../../shared/ipc/language-service'

type MonacoApi = Monaco

export type DefinitionTarget = DefinitionLocation

const workspaceModelLoads = new Map<string, Promise<void>>()
let typescriptConfigured = false

function configureTypescript(): void {
  if (typescriptConfigured) return
  const defaults = [typescript.typescriptDefaults, typescript.javascriptDefaults]
  for (const languageDefaults of defaults) {
    languageDefaults.setEagerModelSync(true)
    languageDefaults.setCompilerOptions({
      allowJs: true,
      allowNonTsExtensions: true,
      jsx: typescript.JsxEmit.ReactJSX,
      module: typescript.ModuleKind.ESNext,
      moduleResolution: typescript.ModuleResolutionKind.NodeJs,
      target: typescript.ScriptTarget.ESNext,
    })
  }
  typescriptConfigured = true
}

export function ensureWorkspaceTypescriptModels(monaco: MonacoApi, workspacePath: string): Promise<void> {
  const cacheKey = workspacePath.replace(/\\/g, '/').toLowerCase()
  const existing = workspaceModelLoads.get(cacheKey)
  if (existing) return existing

  configureTypescript()
  const loading = window.electron.file.sourceFiles(workspacePath).then((result) => {
    if (result.error) throw new Error(result.error)
    for (const source of result.files) {
      const uri = monaco.Uri.file(source.path)
      if (!monaco.editor.getModel(uri)) monaco.editor.createModel(source.content, source.language, uri)
    }
  }).catch((error) => {
    workspaceModelLoads.delete(cacheKey)
    console.debug('TypeScript workspace model preload failed:', error)
  })
  workspaceModelLoads.set(cacheKey, loading)
  return loading
}

function isTypescriptModel(model: MonacoEditor.ITextModel): boolean {
  const language = model.getLanguageId()
  return language === 'typescript' || language === 'javascript'
}

function getNativeLanguage(model: MonacoEditor.ITextModel): NativeSourceLanguage | null {
  const language = model.getLanguageId()
  if (language === 'cpp') return 'cpp'
  if (language !== 'c') return null
  return model.uri.path.toLowerCase().endsWith('.c') ? 'c' : 'cpp'
}

function isPathInWorkspace(filePath: string, workspacePath: string): boolean {
  const normalize = (value: string) => {
    const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '')
    return window.electron.platform === 'win32' ? normalized.toLowerCase() : normalized
  }
  const file = normalize(filePath)
  const workspace = normalize(workspacePath)
  return file === workspace || file.startsWith(`${workspace}/`)
}

export function registerDefinitionNavigation(
  editor: MonacoEditor.IStandaloneCodeEditor,
  monaco: MonacoApi,
  workspacePath: string,
  actionLabel: string,
  onNavigate: (target: DefinitionTarget) => void,
  onError?: () => void,
): IDisposable {
  let requestId = 0
  const run = async () => {
    const currentRequest = ++requestId
    const model = editor.getModel()
    const position = editor.getPosition()
    if (!model || !position) {
      await editor.getAction('editor.action.revealDefinition')?.run()
      return
    }

    const nativeLanguage = getNativeLanguage(model)
    if (nativeLanguage) {
      try {
        const result = await window.electron.languageService.definition({
          workspacePath,
          filePath: model.uri.fsPath,
          language: nativeLanguage,
          content: model.getValue(),
          position: { line: position.lineNumber - 1, character: position.column - 1 },
        })
        if (currentRequest !== requestId) return
        if (result.error) {
          console.debug(`C/C++ definition navigation failed [${result.error.code}]: ${result.error.message}`)
          onError?.()
          return
        }
        if (result.target) onNavigate(result.target)
      } catch (error) {
        if (currentRequest === requestId) {
          console.debug('C/C++ definition navigation failed:', error)
          onError?.()
        }
      }
      return
    }

    if (!isTypescriptModel(model)) {
      await editor.getAction('editor.action.revealDefinition')?.run()
      return
    }

    await ensureWorkspaceTypescriptModels(monaco, workspacePath)
    if (currentRequest !== requestId) return

    const workerFactory = model.getLanguageId() === 'javascript'
      ? await typescript.getJavaScriptWorker()
      : await typescript.getTypeScriptWorker()
    const worker = await workerFactory(model.uri)
    const definitions = await worker.getDefinitionAtPosition(model.uri.toString(), model.getOffsetAt(position))
    if (currentRequest !== requestId) return

    const definition = definitions?.[0]
    if (!definition) {
      await editor.getAction('editor.action.revealDefinition')?.run()
      return
    }
    const targetUri = definition.fileName.startsWith('file:')
      ? monaco.Uri.parse(definition.fileName)
      : monaco.Uri.file(definition.fileName)
    if (!isPathInWorkspace(targetUri.fsPath, workspacePath)) return
    const targetModel = monaco.editor.getModel(targetUri)
    if (!targetModel) {
      await editor.getAction('editor.action.revealDefinition')?.run()
      return
    }
    const start = targetModel.getPositionAt(definition.textSpan.start)
    const end = targetModel.getPositionAt(definition.textSpan.start + definition.textSpan.length)
    onNavigate({
      absolutePath: targetUri.fsPath,
      selection: {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      },
    })
  }
  const action = editor.addAction({
    id: 'janusx.editor.goToDefinition',
    label: actionLabel,
    run,
  })
  editor.addCommand(monaco.KeyCode.F12, run, 'editorTextFocus')
  return {
    dispose: () => {
      requestId += 1
      action.dispose()
    },
  }
}
