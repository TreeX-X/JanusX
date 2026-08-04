import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileTreeItem, type FileTreeItemProps } from '../../src/renderer/src/components/FileExplorerTool'
import {
  clearWorkspaceFileDragData,
  readWorkspaceFileDragData,
} from '../../src/renderer/src/lib/terminal-file-reference'
import type { FileNode } from '../../src/renderer/src/types'
import { withSynchronousHooks, findElement, type TestElement } from './helpers/tree-render'

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

function renderRow(node: FileNode, overrides: Partial<FileTreeItemProps> = {}): TestElement {
  const props: FileTreeItemProps = {
    node,
    workspacePath: 'C:\\workspace',
    depth: 0,
    activeFilePath: null,
    expanded: false,
    expandedPaths: new Set(),
    loading: false,
    loadingDirectoryPaths: new Set(),
    fileChange: null,
    fileChangeMap: new Map(),
    changedDirs: new Map(),
    onSelect: vi.fn(),
    onToggleDirectory: vi.fn(),
    onOpenFile: vi.fn(),
    onMoveFile: vi.fn(),
    onOpenContextMenu: vi.fn(),
    ...overrides,
  }
  const tree = withSynchronousHooks(() => FileTreeItem(props) as TestElement)
  return findElement(tree, (element) => element.props['data-file-path'] === node.path)
}

function dragEvent(dataTransfer: DataTransfer) {
  return {
    dataTransfer,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: { contains: () => false },
    relatedTarget: null,
  }
}

describe('file-tree drag and drop', () => {
  afterEach(() => clearWorkspaceFileDragData())

  it('makes folders draggable as terminal references', () => {
    const folder = { name: 'my docs', path: 'docs/my docs', type: 'directory' } as FileNode
    const row = renderRow(folder)
    const dataTransfer = createDataTransfer()

    expect(row.props.draggable).toBe(true)
    ;(row.props.onDragStart as (event: unknown) => void)({ dataTransfer })

    expect(dataTransfer.effectAllowed).toBe('copy')
    expect(dataTransfer.getData('text/plain')).toBe('@"docs/my docs"')
    expect(readWorkspaceFileDragData(dataTransfer)).toEqual({
      type: 'directory',
      name: 'my docs',
      path: 'docs/my docs',
      workspacePath: 'C:\\workspace',
    })
  })

  it('moves a same-workspace file when it is dropped on a different folder', () => {
    const file = { name: 'demo.ts', path: 'src/demo.ts', type: 'file' } as FileNode
    const target = { name: 'archive', path: 'archive', type: 'directory' } as FileNode
    const onMoveFile = vi.fn()
    const sourceRow = renderRow(file)
    const targetRow = renderRow(target, { onMoveFile })
    const dataTransfer = createDataTransfer()
    const overEvent = dragEvent(dataTransfer)
    const dropEvent = dragEvent(dataTransfer)

    ;(sourceRow.props.onDragStart as (event: unknown) => void)({ dataTransfer })
    ;(targetRow.props.onDragOver as (event: unknown) => void)(overEvent)
    ;(targetRow.props.onDrop as (event: unknown) => void)(dropEvent)

    expect(overEvent.preventDefault).toHaveBeenCalledOnce()
    expect(overEvent.stopPropagation).toHaveBeenCalledOnce()
    expect(dataTransfer.dropEffect).toBe('move')
    expect(dropEvent.preventDefault).toHaveBeenCalledOnce()
    expect(dropEvent.stopPropagation).toHaveBeenCalledOnce()
    expect(onMoveFile).toHaveBeenCalledWith('src/demo.ts', 'archive', 'C:\\workspace')
  })

  it.each([
    ['the current parent', 'C:\\workspace', 'src'],
    ['another workspace', 'D:\\workspace', 'archive'],
  ])('does not offer %s as a move target', (_label, targetWorkspacePath, targetPath) => {
    const file = { name: 'demo.ts', path: 'src/demo.ts', type: 'file' } as FileNode
    const target = { name: 'target', path: targetPath, type: 'directory' } as FileNode
    const onMoveFile = vi.fn()
    const sourceRow = renderRow(file)
    const targetRow = renderRow(target, { workspacePath: targetWorkspacePath, onMoveFile })
    const dataTransfer = createDataTransfer()
    const overEvent = dragEvent(dataTransfer)
    const dropEvent = dragEvent(dataTransfer)

    ;(sourceRow.props.onDragStart as (event: unknown) => void)({ dataTransfer })
    ;(targetRow.props.onDragOver as (event: unknown) => void)(overEvent)
    ;(targetRow.props.onDrop as (event: unknown) => void)(dropEvent)

    expect(overEvent.preventDefault).not.toHaveBeenCalled()
    expect(dropEvent.preventDefault).not.toHaveBeenCalled()
    expect(onMoveFile).not.toHaveBeenCalled()
  })
})
