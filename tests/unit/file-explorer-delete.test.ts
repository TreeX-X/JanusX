import React, { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  createPendingFileTreeDelete,
  executeFileTreeDelete,
  FileTreeItem,
  reloadWorkspaceDirectory,
  type FileTreeItemProps,
  type PendingFileTreeDelete,
} from '../../src/renderer/src/components/FileExplorerTool'
import { PromptDialog, type PromptDialogProps } from '../../src/renderer/src/components/blueprint/PromptDialog'
import { useWorkspaceStore } from '../../src/renderer/src/stores/workspace'
import type { FileNode, Workspace } from '../../src/renderer/src/types'

type ElementProps = Record<string, unknown> & { children?: ReactNode }
type TestElement = ReactElement<ElementProps>

const request: PendingFileTreeDelete = {
  workspacePath: 'C:\\workspace',
  targetPath: 'src/original.ts',
  targetName: 'original.ts',
  parentPath: 'src',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function withSynchronousHooks<T>(render: () => T): T {
  const internals = (React as unknown as {
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
      ReactCurrentDispatcher: { current: unknown }
    }
  }).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
  const previous = internals.ReactCurrentDispatcher.current

  internals.ReactCurrentDispatcher.current = {
    useCallback: <V>(callback: V) => callback,
    useEffect: () => undefined,
    useRef: <V>(value: V) => ({ current: value }),
    useState: <V>(initial: V | (() => V)) => [
      typeof initial === 'function' ? (initial as () => V)() : initial,
      vi.fn(),
    ],
  }

  try {
    return render()
  } finally {
    internals.ReactCurrentDispatcher.current = previous
  }
}

function findElement(root: ReactNode, predicate: (element: TestElement) => boolean): TestElement {
  if (isValidElement<ElementProps>(root)) {
    if (predicate(root)) return root
    for (const child of Children.toArray(root.props.children)) {
      try {
        return findElement(child, predicate)
      } catch {
        // Continue through sibling branches.
      }
    }
  }
  throw new Error('Element not found')
}

function renderConfirmDialog(overrides: Partial<PromptDialogProps> = {}): TestElement {
  return withSynchronousHooks(() => PromptDialog({
    open: true,
    title: '确认删除',
    description: React.createElement('span', null, '确认删除「original.ts」吗？此操作不可恢复。'),
    confirmOnly: true,
    confirmText: '删除',
    tone: 'danger',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }) as TestElement)
}

describe('file explorer delete confirmation', () => {
  it('captures the original target before the context menu is torn down', () => {
    expect(createPendingFileTreeDelete('C:\\workspace', {
      name: 'original.ts',
      path: 'src/original.ts',
    })).toEqual(request)
  })

  it.each(['Cancel', 'Escape', 'backdrop'])('%s closes the production dialog without deleting', (route) => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const dialog = renderConfirmDialog({ onCancel, onConfirm })

    if (route === 'Cancel') {
      const cancelButton = findElement(dialog, (element) =>
        element.type === 'button' && Children.toArray(element.props.children).join('') === '取消')
      ;(cancelButton.props.onClick as () => void)()
    } else if (route === 'Escape') {
      const modal = findElement(dialog, (element) => element.props.role === 'dialog')
      ;(modal.props.onKeyDown as (event: unknown) => void)({ key: 'Escape', preventDefault: vi.fn() })
    } else {
      const overlay = dialog
      const backdrop = {}
      ;(overlay.props.onMouseDown as (event: unknown) => void)({ target: backdrop, currentTarget: backdrop })
    }

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms exactly once for the captured target', async () => {
    const deleteTarget = vi.fn().mockResolvedValue({ success: true })
    const reloadDirectory = vi.fn().mockResolvedValue(undefined)
    const onDeleted = vi.fn()
    const execute = vi.fn(() => executeFileTreeDelete(request, {
      deleteTarget,
      isWorkspaceActive: () => true,
      reloadDirectory,
      onDeleted,
    }))
    const dialog = renderConfirmDialog({ onConfirm: execute })
    const confirmButton = findElement(dialog, (element) =>
      element.type === 'button' && String(element.props.className).includes('blueprint-btn--danger'))

    ;(confirmButton.props.onClick as () => void)()
    await execute.mock.results[0].value

    expect(execute).toHaveBeenCalledTimes(1)
    expect(deleteTarget).toHaveBeenCalledTimes(1)
    expect(deleteTarget).toHaveBeenCalledWith('C:\\workspace', 'src/original.ts')
    expect(onDeleted).toHaveBeenCalledWith('src/original.ts')
    expect(reloadDirectory).toHaveBeenCalledWith('src', 'C:\\workspace')
  })

  it('does not clean or reload the newly active workspace after deletion', async () => {
    const deleteTarget = vi.fn().mockResolvedValue({ success: true })
    const reloadDirectory = vi.fn().mockResolvedValue(undefined)
    const onDeleted = vi.fn()

    await expect(executeFileTreeDelete(request, {
      deleteTarget,
      isWorkspaceActive: () => false,
      reloadDirectory,
      onDeleted,
    })).resolves.toBe(true)

    expect(deleteTarget).toHaveBeenCalledOnce()
    expect(deleteTarget).toHaveBeenCalledWith('C:\\workspace', 'src/original.ts')
    expect(onDeleted).not.toHaveBeenCalled()
    expect(reloadDirectory).not.toHaveBeenCalled()
  })

  it('discards a directory reload that resolves after the active workspace changes', async () => {
    const originalWindow = globalThis.window
    const originalState = useWorkspaceStore.getState()
    const childrenLoad = deferred<FileNode[]>()
    const loadChildren = vi.fn(() => childrenLoad.promise)
    const oldWorkspace = { id: 'old', path: 'C:\\workspace' } as Workspace
    const newWorkspace = { id: 'new', path: 'C:\\other' } as Workspace
    const oldTree = [{ name: 'src', path: 'src', type: 'directory' }] as FileNode[]
    const newTree = [{ name: 'new.ts', path: 'new.ts', type: 'file' }] as FileNode[]

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { electron: { fileTree: { children: loadChildren } } },
    })
    useWorkspaceStore.setState({
      workspaces: [oldWorkspace, newWorkspace],
      activeWorkspaceId: oldWorkspace.id,
      activeFilePath: request.targetPath,
      fileTree: oldTree,
    })

    try {
      const operation = executeFileTreeDelete(request, {
        deleteTarget: vi.fn().mockResolvedValue({ success: true }),
        isWorkspaceActive: (workspacePath) =>
          useWorkspaceStore.getState().workspaces.find(
            (workspace) => workspace.id === useWorkspaceStore.getState().activeWorkspaceId,
          )?.path === workspacePath,
        reloadDirectory: (path, workspacePath) => reloadWorkspaceDirectory(workspacePath, path),
        onDeleted: () => useWorkspaceStore.setState({ activeFilePath: null }),
      })
      await vi.waitFor(() => expect(loadChildren).toHaveBeenCalledWith('C:\\workspace', 'src'))

      useWorkspaceStore.setState({
        activeWorkspaceId: newWorkspace.id,
        activeFilePath: 'new.ts',
        fileTree: newTree,
      })
      childrenLoad.resolve([{ name: 'old.ts', path: 'src/old.ts', type: 'file' }])
      await operation

      expect(useWorkspaceStore.getState().activeFilePath).toBe('new.ts')
      expect(useWorkspaceStore.getState().fileTree).toBe(newTree)
    } finally {
      useWorkspaceStore.setState({
        workspaces: originalState.workspaces,
        activeWorkspaceId: originalState.activeWorkspaceId,
        activeFilePath: originalState.activeFilePath,
        fileTree: originalState.fileTree,
      })
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: originalWindow,
      })
    }
  })

  it('preserves the neighboring file-row context-menu operation', () => {
    const node = { name: 'original.ts', path: 'src/original.ts', type: 'file' } as FileNode
    const onSelect = vi.fn()
    const onOpenContextMenu = vi.fn()
    const props: FileTreeItemProps = {
      node,
      depth: 0,
      activeFilePath: null,
      expanded: false,
      expandedPaths: new Set(),
      fileChange: null,
      fileChangeMap: new Map(),
      changedDirs: new Set(),
      onSelect,
      onToggleDirectory: vi.fn(),
      onOpenFile: vi.fn(),
      onOpenContextMenu,
    }
    const tree = withSynchronousHooks(() => FileTreeItem(props) as TestElement)
    const row = findElement(tree, (element) => element.props['data-file-path'] === node.path)
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() }

    ;(row.props.onContextMenu as (event: unknown) => void)(event)

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(node.path)
    expect(onOpenContextMenu).toHaveBeenCalledWith(event, node)
  })
})
