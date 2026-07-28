import { useCallback, useState, type DragEvent, type MouseEvent } from 'react'
import type { FileNode, GitFileChange } from '@/types'
import {
  clearWorkspaceFileDragData,
  getActiveWorkspaceFileDragData,
  hasWorkspaceFileDrag,
  readWorkspaceFileDragData,
  setWorkspaceFileDragData,
  type WorkspaceFileDragPayload,
} from '@/lib/terminal-file-reference'
import { getParentPath } from '@/features/workspace/file-tree'
import { warmupEditorRuntime } from '@/lib/editor-warmup'
import { classifyFile } from '@/lib/file-classification'
import { resolveFilePresentation } from '@/lib/file-presentation'
import { FileTypeIcon } from '@/components/FileTypeIcon'
import styles from './file-tree.module.css'

const FILE_CHANGE_VISUALS: Record<GitFileChange['status'], { label: string; color: string }> = {
  M: { label: 'M', color: '#d99a4e' },
  A: { label: 'A', color: '#7fae7f' },
  D: { label: 'D', color: '#c96a5f' },
  R: { label: 'R', color: '#7ba3bd' },
  '??': { label: '?', color: '#9a9a9a' },
  UU: { label: '!', color: '#e05f4a' },
}

function canMoveFileToDirectory(
  payload: WorkspaceFileDragPayload | null,
  targetDirectoryPath: string,
  workspacePath: string,
): payload is WorkspaceFileDragPayload & { type: 'file' } {
  return payload?.type === 'file'
    && payload.workspacePath === workspacePath
    && getParentPath(payload.path) !== targetDirectoryPath
}

export interface FileTreeItemProps {
  node: FileNode
  workspacePath: string
  depth: number
  activeFilePath: string | null
  expanded: boolean
  expandedPaths: Set<string>
  fileChange: GitFileChange | null
  fileChangeMap: Map<string, GitFileChange>
  changedDirs: Set<string>
  onSelect: (path: string) => void
  onToggleDirectory: (node: FileNode) => void
  onOpenFile: (path: string) => void
  onMoveFile: (sourcePath: string, targetDirectoryPath: string, workspacePath: string) => void | Promise<void>
  onOpenContextMenu: (event: MouseEvent<HTMLDivElement>, node: FileNode) => void
}

export function FileTreeItem({
  node,
  workspacePath,
  depth,
  activeFilePath,
  expanded,
  expandedPaths,
  fileChange,
  fileChangeMap,
  changedDirs,
  onSelect,
  onToggleDirectory,
  onOpenFile,
  onMoveFile,
  onOpenContextMenu,
}: FileTreeItemProps) {
  const isFolder = node.type === 'directory'
  const isActive = activeFilePath === node.path
  const isGitIgnored = node.isGitIgnored === true
  const changeVisual = !isFolder && fileChange ? FILE_CHANGE_VISUALS[fileChange.status] : null
  const presentation = resolveFilePresentation(classifyFile(node.path, node.type))
  const [dropActive, setDropActive] = useState(false)

  const handleClick = useCallback(() => {
    if (isFolder) {
      void onToggleDirectory(node)
    } else {
      onSelect(node.path)
      void warmupEditorRuntime()
    }
  }, [isFolder, node, onSelect, onToggleDirectory])

  const handleDoubleClick = useCallback(() => {
    if (!isFolder) {
      void warmupEditorRuntime()
      onOpenFile(node.path)
    }
  }, [isFolder, node.path, onOpenFile])

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      setWorkspaceFileDragData(event.dataTransfer, {
        type: node.type,
        name: node.name,
        path: node.path,
        workspacePath,
      })
    },
    [node.name, node.path, node.type, workspacePath],
  )

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    const payload = getActiveWorkspaceFileDragData()
    if (!isFolder || !hasWorkspaceFileDrag(event.dataTransfer) || !canMoveFileToDirectory(payload, node.path, workspacePath)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setDropActive(true)
  }, [isFolder, node.path, workspacePath])

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false)
  }, [])

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    setDropActive(false)
    if (!isFolder) return
    const payload = readWorkspaceFileDragData(event.dataTransfer) ?? getActiveWorkspaceFileDragData()
    if (!canMoveFileToDirectory(payload, node.path, workspacePath)) return
    event.preventDefault()
    event.stopPropagation()
    clearWorkspaceFileDragData()
    void onMoveFile(payload.path, node.path, payload.workspacePath)
  }, [isFolder, node.path, onMoveFile, workspacePath])

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (!isFolder) onSelect(node.path)
      onOpenContextMenu(event, node)
    },
    [isFolder, node, onOpenContextMenu, onSelect],
  )

  return (
    <div>
      <div
        data-file-path={node.path}
        data-selected={isActive}
        data-git-ignored={isGitIgnored ? 'true' : undefined}
        data-drop-target={dropActive ? 'true' : undefined}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={clearWorkspaceFileDragData}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={styles.row}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {isFolder && <div className={styles.chevron} data-expanded={expanded} />}
        <span className="flex shrink-0" style={{ marginLeft: isFolder ? 0 : 6 }}>
          <FileTypeIcon presentation={presentation} active={isActive} />
        </span>
        <span className={styles.name} data-file-name={node.name}>
          {node.name}
        </span>
        {changeVisual && (
          <span
            data-git-status={fileChange?.status}
            className={styles.gitMarker}
            title={`${fileChange?.staged ? 'Staged' : 'Modified'} · ${fileChange?.status}`}
            style={{
              color: changeVisual.color,
              opacity: fileChange?.staged ? 1 : 0.85,
              background: fileChange?.staged ? `${changeVisual.color}24` : 'transparent',
            }}
          >
            {changeVisual.label}
          </span>
        )}
        {isFolder && changedDirs.has(node.path) && (
          <span data-git-dirty className={styles.gitMarker} title="包含改动">
            <span className={styles.gitDirtyDot} />
          </span>
        )}
      </div>
      {isFolder && node.children && expanded && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              workspacePath={workspacePath}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              expanded={expandedPaths.has(child.path)}
              expandedPaths={expandedPaths}
              fileChange={fileChangeMap.get(child.path) ?? null}
              fileChangeMap={fileChangeMap}
              changedDirs={changedDirs}
              onSelect={onSelect}
              onToggleDirectory={onToggleDirectory}
              onOpenFile={onOpenFile}
              onMoveFile={onMoveFile}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
}
