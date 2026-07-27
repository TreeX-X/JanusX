import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FileNode } from '@/types'
import styles from './file-tree.module.css'

export interface FileTreeContextMenuTarget {
  node: FileNode | null
  name: string
  path: string
  type: 'file' | 'directory'
}

export interface FileTreeContextMenuState {
  x: number
  y: number
  target: FileTreeContextMenuTarget
}

const MENU_MARGIN = 8

interface FileTreeContextMenuProps {
  menu: FileTreeContextMenuState
  onOpen: () => void
  onCreate: (type: 'file' | 'directory') => void
  onCopyPath: (mode: 'relative' | 'absolute') => void
  onReveal: () => void
  onRename: () => void
  onDelete: () => void
}

export function FileTreeContextMenu({
  menu,
  onOpen,
  onCreate,
  onCopyPath,
  onReveal,
  onRename,
  onDelete,
}: FileTreeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: menu.x, y: menu.y })

  // 菜单条目随目标类型变化,渲染后按实际尺寸钳制到视口内
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPosition({
      x: Math.max(MENU_MARGIN, Math.min(menu.x, window.innerWidth - rect.width - MENU_MARGIN)),
      y: Math.max(MENU_MARGIN, Math.min(menu.y, window.innerHeight - rect.height - MENU_MARGIN)),
    })
  }, [menu.x, menu.y])

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: position.x, top: position.y, width: 196 }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {menu.target.type === 'file' && (
        <button type="button" className={styles.menuItem} onClick={onOpen}>
          打开
        </button>
      )}
      <button type="button" className={styles.menuItem} onClick={() => onCreate('file')}>
        新建文件
      </button>
      <button type="button" className={styles.menuItem} onClick={() => onCreate('directory')}>
        新建文件夹
      </button>
      <div className={styles.menuSeparator} />
      <button type="button" className={styles.menuItem} onClick={() => onCopyPath('relative')}>
        复制相对路径
      </button>
      <button type="button" className={styles.menuItem} onClick={() => onCopyPath('absolute')}>
        复制绝对路径
      </button>
      <button type="button" className={styles.menuItem} onClick={onReveal}>
        在资源管理器中显示
      </button>
      {menu.target.node && (
        <>
          <div className={styles.menuSeparator} />
          <button type="button" className={styles.menuItem} onClick={onRename}>
            重命名
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={onDelete}
          >
            删除
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
