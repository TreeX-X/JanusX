import { useCallback, type DragEvent, type MouseEvent } from 'react'
import type { FileNode, GitFileChange } from '@/types'
import { setWorkspaceFileDragData } from '@/lib/terminal-file-reference'
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

export interface FileTreeItemProps {
  node: FileNode
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
  onOpenContextMenu: (event: MouseEvent<HTMLDivElement>, node: FileNode) => void
}

export function FileTreeItem({
  node,
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
  onOpenContextMenu,
}: FileTreeItemProps) {
  const isFolder = node.type === 'directory'
  const isActive = activeFilePath === node.path
  const isGitIgnored = node.isGitIgnored === true
  const changeVisual = !isFolder && fileChange ? FILE_CHANGE_VISUALS[fileChange.status] : null
  const presentation = resolveFilePresentation(classifyFile(node.path, node.type))

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
      if (isFolder) return
      setWorkspaceFileDragData(event.dataTransfer, {
        type: 'file',
        name: node.name,
        path: node.path,
      })
    },
    [isFolder, node.name, node.path],
  )

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
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        draggable={!isFolder}
        onDragStart={handleDragStart}
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
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
}
