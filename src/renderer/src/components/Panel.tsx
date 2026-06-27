import { useCallback, useState, type DragEvent } from 'react'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAppStore } from '@/stores/app'
import { useEditorStore } from '@/stores/editor'
import { GitPanel } from '@/components/GitPanel'
import { CheckpointPanel } from '@/components/CheckpointPanel'
import type { FileNode } from '@/types'
import { setWorkspaceFileDragData } from '@/lib/terminal-file-reference'

type PanelView = 'files' | 'git' | 'checkpoints'

interface FileTreeItemProps {
  node: FileNode
  depth: number
  activeFilePath: string | null
  onSelect: (path: string) => void
  onToggleDirectory: (path: string) => Promise<void>
}

function FileTreeItem({ node, depth, activeFilePath, onSelect, onToggleDirectory }: FileTreeItemProps) {
  const [expanded, setExpanded] = useState(false)
  const isFolder = node.type === 'directory'
  const isActive = activeFilePath === node.path

  const handleClick = useCallback(async () => {
    if (isFolder) {
      if (!expanded && !node.loaded) {
        await onToggleDirectory(node.path)
      }
      setExpanded((v) => !v)
    } else {
      onSelect(node.path)
    }
  }, [expanded, isFolder, node.loaded, node.path, onSelect, onToggleDirectory])

  const handleDoubleClick = useCallback(() => {
    if (!isFolder) {
      const { workspaces, activeWorkspaceId } = useWorkspaceStore.getState()
      const ws = workspaces.find(w => w.id === activeWorkspaceId)
      if (ws) {
        const separator = ws.path.includes('\\') ? '\\' : '/'
        const absolutePath = ws.path + separator + node.path.split('/').join(separator)
        useEditorStore.getState().openFile(absolutePath, ws.path)
      }
    }
  }, [isFolder, node.path])

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

  return (
    <div>
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        draggable={!isFolder}
        onDragStart={handleDragStart}
        className="py-[5px] px-2 mb-px rounded cursor-pointer transition-colors flex items-center gap-1.5 text-xs select-none"
        style={{
          paddingLeft: `${8 + depth * 16}px`,
          color: isActive ? '#ff7830' : '#999',
          background: isActive ? 'rgba(255, 120, 48, 0.1)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
            e.currentTarget.style.color = '#ccc'
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = '#999'
          }
        }}
      >
        {isFolder && (
          <div
            className="w-1.5 h-1.5 border-r-[1.5px] border-b-[1.5px] transition-transform"
            style={{
              borderColor: isActive ? '#ff7830' : '#666',
              transform: expanded ? 'rotate(45deg)' : 'rotate(-45deg)',
            }}
          />
        )}
        <div
          className="w-3 h-3 shrink-0 relative"
          style={{
            marginLeft: isFolder ? 0 : '6px',
          }}
        >
          {isFolder ? (
            <div
              className="absolute left-0 top-[3px] w-3 h-2 rounded-px"
              style={{ border: `1.5px solid ${isActive ? '#ff7830' : '#666'}` }}
            />
          ) : (
            <div
              className="absolute left-px top-[2px] w-2.5 h-2.5 rounded-px"
              style={{
                border: `1.5px solid ${isActive ? '#ff7830' : '#666'}`,
                clipPath: 'polygon(0 0, 70% 0, 100% 30%, 100% 100%, 0 100%)',
              }}
            />
          )}
        </div>
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{node.name}</span>
      </div>
      {isFolder && node.children && expanded && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              onSelect={onSelect}
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function Panel() {
  const [activeView, setActiveView] = useState<PanelView>('files')
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath)
  const setActiveFilePath = useWorkspaceStore((s) => s.setActiveFilePath)
  const panelCollapsed = useAppStore((s) => s.panelCollapsed)
  const togglePanel = useAppStore((s) => s.togglePanel)

  const handleToggleDirectory = useCallback(async (path: string) => {
    const { workspaces, activeWorkspaceId, fileTree: currentTree } = useWorkspaceStore.getState()
    const workspace = workspaces.find((item) => item.id === activeWorkspaceId)
    if (!workspace) return

    try {
      const children = (await window.electron.invoke(
        'filetree:children',
        workspace.path,
        path,
      )) as FileNode[]

      const injectChildren = (nodes: FileNode[]): FileNode[] =>
        nodes.map((node) => {
          if (node.path === path && node.type === 'directory') {
            return {
              ...node,
              children,
              loaded: true,
              hasChildren: children.length > 0,
            }
          }
          if (node.children && node.children.length > 0) {
            return {
              ...node,
              children: injectChildren(node.children),
            }
          }
          return node
        })

      useWorkspaceStore.setState({ fileTree: injectChildren(currentTree) })
    } catch {
      // ignore
    }
  }, [])

  return (
    <aside
      className="flex flex-col overflow-hidden"
      style={{
        background: 'var(--surface)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* 展开态 */}
      {!panelCollapsed && (
        <>
          {/* Tabs header */}
          <div
            className="flex items-center"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex-1 flex">
              {(['files', 'git', 'checkpoints'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setActiveView(view)}
                  className="px-3 py-2 text-[11px] transition-colors relative"
                  style={{
                    color: activeView === view ? '#fff' : '#555',
                  }}
                >
                  {view === 'files' ? '文件' : view === 'git' ? 'Git' : '还原点'}
                  {activeView === view && (
                    <div
                      className="absolute bottom-0 left-2 right-2 h-px"
                      style={{ background: '#ff7830' }}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-1 items-center pr-2">
              <button
                onClick={togglePanel}
                title="收起面板"
                className="w-5 h-5 rounded flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.04)]"
              >
                <div
                  className="w-[7px] h-[7px] transition-colors"
                  style={{
                    borderRight: '1.5px solid rgba(255, 255, 255, 0.2)',
                    borderBottom: '1.5px solid rgba(255, 255, 255, 0.2)',
                    transform: 'rotate(-45deg)',
                  }}
                />
              </button>
            </div>
          </div>

          {/* Search box (files view only) */}
          {activeView === 'files' && (
            <div className="p-2">
              <input
                type="text"
                className="w-full h-7 rounded px-2.5 text-xs transition-colors focus:outline-none focus:bg-[rgba(255,255,255,0.05)] focus:border-[rgba(255,120,48,0.4)]"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#d4d4d4',
                }}
                placeholder="搜索文件..."
              />
            </div>
          )}

          {/* Content */}
          {activeView === 'files' ? (
            <div className="flex-1 p-1.5 overflow-y-auto text-xs">
              {fileTree.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="text-[#555]">未加载工作区</div>
                </div>
              ) : (
                fileTree.map((node) => (
                  <FileTreeItem
                    key={node.path}
                    node={node}
                    depth={0}
                    activeFilePath={activeFilePath}
                    onSelect={setActiveFilePath}
                    onToggleDirectory={handleToggleDirectory}
                  />
                ))
              )}
            </div>
          ) : activeView === 'git' ? (
            <GitPanel />
          ) : (
            <CheckpointPanel />
          )}
        </>
      )}

      {/* 收起态 */}
      {panelCollapsed && (
        <div className="flex-1 flex flex-col items-center py-3 gap-2 overflow-hidden">
          <button
            onClick={togglePanel}
            title="展开面板"
            className="w-7 h-7 rounded flex items-center justify-center cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.04)] mb-1"
          >
            <div
              className="w-[7px] h-[7px] transition-colors"
              style={{
                borderRight: '1.5px solid rgba(255, 255, 255, 0.2)',
                borderBottom: '1.5px solid rgba(255, 255, 255, 0.2)',
                transform: 'rotate(135deg)',
              }}
            />
          </button>
          <div
            className="w-5 h-px"
            style={{ background: 'rgba(255, 255, 255, 0.06)' }}
          />
          <span
            className="select-none"
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              fontSize: '10px',
              fontWeight: 500,
              letterSpacing: '1.5px',
              color: 'rgba(255, 255, 255, 0.2)',
            }}
          >
            {activeView === 'files' ? '文件' : activeView === 'git' ? 'Git' : '还原点'}
          </span>
        </div>
      )}
    </aside>
  )
}
