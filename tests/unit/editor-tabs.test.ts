import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
})
