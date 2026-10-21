import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateEditorFileCache, useEditorStore } from '../../src/renderer/src/stores/editor'

describe('unified file sessions', () => {
  beforeEach(() => {
    invalidateEditorFileCache()
    useEditorStore.setState({ workspacePath: null, sessions: {}, openFiles: [], activeFileId: null, isVisible: false })
    vi.stubGlobal('window', { electron: { file: { read: vi.fn(async () => ({ content: 'disk' })) } } })
  })

  it('transfers every tab, draft and view mode without writing or replacing drafts with disk contents', async () => {
    const editor = useEditorStore.getState()
    await editor.openFile('C:/one/a.md', 'C:/one')
    await editor.openFile('C:/one/b.ts', 'C:/one')
    editor.updateContent('c:/one/a.md', 'unsaved draft')
    editor.updateViewState('c:/one/a.md', { previewMode: 'editor', cursor: { lineNumber: 2, column: 3 } })
    const session = structuredClone(editor.exportSession())
    editor.releaseScope('C:/one')
    const reads = vi.mocked(window.electron.file.read).mock.calls.length
    await editor.acceptDelivery({ filePath: 'C:/one/b.ts', workspacePath: 'C:/one', session })
    expect(vi.mocked(window.electron.file.read).mock.calls.length).toBe(reads)
    expect(editor.exportSession()).toEqual(session)
    expect(editor.exportSession().files[0]).toMatchObject({ content: 'unsaved draft', isDirty: true, viewState: { previewMode: 'editor' } })
  })

  it('isolates worktrees, restores hidden drafts and never clears another scope after detach finishes', async () => {
    const editor = useEditorStore.getState()
    await editor.openFile('C:/main/a.ts', 'C:/main')
    editor.updateContent('c:/main/a.ts', 'main draft')
    await editor.openFile('C:/tree/a.ts', 'C:/tree')
    editor.updateContent('c:/tree/a.ts', 'tree draft')
    editor.releaseScope('C:/main')
    expect(editor.exportSession().files[0].content).toBe('tree draft')
    editor.hidePanel()
    expect(useEditorStore.getState().isVisible).toBe(false)
    await editor.openFile('c:/TREE/a.ts', 'c:/TREE/')
    expect(editor.exportSession().files).toHaveLength(1)
    expect(editor.exportSession().files[0].content).toBe('tree draft')
    editor.switchScope('C:/main')
    expect(editor.exportSession().files).toHaveLength(0)
    editor.switchScope('C:/tree')
    expect(editor.exportSession().files[0].content).toBe('tree draft')
  })

  it('finishes pending reads in a background scope and rejects incomplete transfers without touching the current draft', async () => {
    let complete!: (value: { content: string }) => void
    vi.mocked(window.electron.file.read).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const editor = useEditorStore.getState()
    const loading = editor.openFile('C:/one/a.ts', 'C:/one')
    editor.switchScope('C:/two')
    complete({ content: 'loaded in background' })
    await loading
    editor.switchScope('C:/one')
    expect(editor.exportSession().files[0]).toMatchObject({ content: 'loaded in background', isLoading: false })
    editor.updateContent('c:/one/a.ts', 'keep me')
    const session = editor.exportSession()
    await expect(editor.acceptDelivery({ filePath: 'C:/two/a.ts', workspacePath: 'C:/two', session: { files: [{ ...session.files[0], isLoading: true }], activeFileId: null } })).rejects.toThrow()
    expect(useEditorStore.getState().workspacePath).toBe('C:/one')
    expect(editor.exportSession().files[0].content).toBe('keep me')
  })
})
