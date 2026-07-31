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
      activeFileId: 'C:\\workspace\\src\\second.ts',
      isVisible: true,
    })
    expect(useEditorStore.getState().openFiles.map((file) => file.name)).toEqual([
      'first.ts',
      'second.ts',
    ])

    await editor.openFile('C:\\workspace\\src\\first.ts', 'C:\\workspace')

    expect(useEditorStore.getState().openFiles).toHaveLength(2)
    expect(useEditorStore.getState().activeFileId).toBe('C:\\workspace\\src\\first.ts')
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
    expect(standaloneEditorSource).toContain("'\\u9501\\u5b9a\\u7a97\\u53e3\\u7f6e\\u9876'")
  })
})
