import { afterEach, describe, expect, it } from 'vitest'
import {
  clearWorkspaceFileDragData,
  getActiveWorkspaceFileDragData,
  readWorkspaceFileDragData,
  setWorkspaceFileDragData,
} from '../../src/renderer/src/lib/terminal-file-reference'

function createDataTransfer(): DataTransfer {
  const values = new Map<string, string>()
  return {
    effectAllowed: 'uninitialized',
    dropEffect: 'none',
    get types() { return [...values.keys()] },
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? '',
  } as DataTransfer
}

describe('workspace entry drag payload', () => {
  afterEach(() => clearWorkspaceFileDragData())

  it('allows a directory to be copied into a terminal as a reference', () => {
    const dataTransfer = createDataTransfer()
    setWorkspaceFileDragData(dataTransfer, {
      type: 'directory',
      name: 'my docs',
      path: 'docs\\my docs',
      workspacePath: 'C:\\workspace',
    })

    expect(dataTransfer.effectAllowed).toBe('copy')
    expect(dataTransfer.getData('text/plain')).toBe('@"docs/my docs"')
    expect(readWorkspaceFileDragData(dataTransfer)).toEqual({
      type: 'directory',
      name: 'my docs',
      path: 'docs/my docs',
      workspacePath: 'C:\\workspace',
    })
  })

  it('allows files to choose copy for terminal drops or move for folder drops', () => {
    const dataTransfer = createDataTransfer()
    const payload = {
      type: 'file' as const,
      name: 'demo.ts',
      path: 'src/demo.ts',
      workspacePath: 'C:\\workspace',
    }
    setWorkspaceFileDragData(dataTransfer, payload)

    expect(dataTransfer.effectAllowed).toBe('copyMove')
    expect(getActiveWorkspaceFileDragData()).toEqual(payload)
    clearWorkspaceFileDragData()
    expect(getActiveWorkspaceFileDragData()).toBeNull()
  })
})
