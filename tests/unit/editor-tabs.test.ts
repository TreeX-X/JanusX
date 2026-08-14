import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  invalidateEditorFileCache,
  useEditorStore,
} from '../../src/renderer/src/stores/editor'

describe('file editor tabs', () => {
  beforeEach(() => {
    invalidateEditorFileCache()
    useEditorStore.setState({
      openFiles: [],
      activeFileId: null,
      isVisible: false,
      isEmbedded: false,
      embeddedWidth: 560,
      navigationTarget: null,
    })
    vi.stubGlobal('window', {
      electron: {
        file: {
          read: vi.fn(async (filePath: string) => ({ content: `content:${filePath}` })),
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens multiple files as tabs and reuses an existing tab', async () => {
    const editor = useEditorStore.getState()

    await editor.openFile('C:\\workspace\\src\\first.ts', 'C:\\workspace')
    await editor.openFile('C:\\workspace\\src\\second.ts', 'C:\\workspace')

    expect(useEditorStore.getState()).toMatchObject({
      activeFileId: 'c:/workspace/src/second.ts',
      isVisible: true,
    })
    expect(useEditorStore.getState().openFiles.map((file) => file.name)).toEqual([
      'first.ts',
      'second.ts',
    ])

    await editor.openFile('C:\\workspace\\src\\first.ts', 'C:\\workspace')

    expect(useEditorStore.getState().openFiles).toHaveLength(2)
    expect(useEditorStore.getState().activeFileId).toBe('c:/workspace/src/first.ts')
  })

  it('treats Windows path casing and separators as the same tab', async () => {
    const editor = useEditorStore.getState()

    await editor.openFile('C:\\Workspace\\src\\first.ts', 'C:\\Workspace')
    await editor.openFile('c:/workspace/src/first.ts', 'c:/workspace')

    expect(useEditorStore.getState().openFiles).toHaveLength(1)
    expect(useEditorStore.getState().activeFileId).toBe('c:/workspace/src/first.ts')
    expect(window.electron.file.read).toHaveBeenCalledTimes(1)
  })

  it('clears all tabs when the preview window is closed', async () => {
    const editor = useEditorStore.getState()
    await editor.openFile('C:\\workspace\\src\\first.ts', 'C:\\workspace')
    await editor.openFile('C:\\workspace\\src\\second.ts', 'C:\\workspace')

    useEditorStore.getState().closePanel()

    expect(useEditorStore.getState()).toMatchObject({
      openFiles: [],
      activeFileId: null,
      isVisible: false,
      isEmbedded: false,
    })
  })

  it('preserves the embedded editor width while toggling its workspace placement', () => {
    const editor = useEditorStore.getState()

    editor.setEmbeddedWidth(640)
    editor.setEmbedded(true)

    expect(useEditorStore.getState()).toMatchObject({
      isEmbedded: true,
      embeddedWidth: 640,
    })
  })

  it('opens a definition target in a reused tab and exposes its selection once', async () => {
    const editor = useEditorStore.getState()
    const selection = { startLineNumber: 4, startColumn: 3, endLineNumber: 4, endColumn: 9 }

    await editor.openFile('C:\\workspace\\src\\target.ts', 'C:\\workspace')
    await editor.openFileAt('c:/workspace/src/target.ts', 'C:\\workspace', selection)

    const target = useEditorStore.getState().navigationTarget
    expect(useEditorStore.getState().openFiles).toHaveLength(1)
    expect(target).toMatchObject({ fileId: 'c:/workspace/src/target.ts', selection })

    useEditorStore.getState().consumeNavigationTarget(target!.requestId)
    expect(useEditorStore.getState().navigationTarget).toBeNull()
  })

  it('keeps the preview embed action and the resizable workspace column wired', () => {
    const editorSource = readFileSync(
      new URL('../../src/renderer/src/components/FileEditor.tsx', import.meta.url),
      'utf8',
    )
    const appSource = readFileSync(
      new URL('../../src/renderer/src/App.tsx', import.meta.url),
      'utf8',
    )
    const explorerSource = readFileSync(
      new URL('../../src/renderer/src/components/FileExplorerTool.tsx', import.meta.url),
      'utf8',
    )
    const standaloneEditorSource = readFileSync(
      new URL('../../src/renderer/src/components/StandaloneFileEditor.tsx', import.meta.url),
      'utf8',
    )

    expect(editorSource).toContain('<PanelRightOpen')
    expect(editorSource).toContain('onClick={() => setEmbedded(true)}')
    expect(appSource).toContain('aria-label="Embedded file editor"')
    expect(appSource).toContain('aria-label="Resize embedded editor"')
    expect(appSource).toContain("- (isEditorEmbedded ? EMBEDDED_EDITOR_MIN_WIDTH : 0)")
    expect(explorerSource).toContain('window.electron.window.openEditor({')
    expect(explorerSource).not.toContain('useEditorStore.getState().openFile')
    expect(standaloneEditorSource).toContain("t('editor:fileEditor.pinWindow')")
    expect(standaloneEditorSource).toContain("t('editor:fileEditor.unpinWindow')")
    expect(standaloneEditorSource).toContain('window.electron.window.editorReady()')
    expect(standaloneEditorSource).toContain('window.electron.window.onEditorRefresh((payload) =>')
    expect(standaloneEditorSource).toContain('void openFile(payload.filePath, payload.workspacePath)')
  })
})
