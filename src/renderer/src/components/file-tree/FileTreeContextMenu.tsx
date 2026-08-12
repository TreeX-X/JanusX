import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FileNode } from '@/types'
import { useI18n } from '@/i18n/useI18n'
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
  const { t } = useI18n('editor')
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
          {t('editor:fileTree.contextMenu.open')}
        </button>
      )}
      <button type="button" className={styles.menuItem} onClick={() => onCreate('file')}>
        {t('editor:fileTree.contextMenu.newFile')}
      </button>
      <button type="button" className={styles.menuItem} onClick={() => onCreate('directory')}>
        {t('editor:fileTree.contextMenu.newDirectory')}
      </button>
      <div className={styles.menuSeparator} />
      <button type="button" className={styles.menuItem} onClick={() => onCopyPath('relative')}>
        {t('editor:fileTree.contextMenu.copyRelativePath')}
      </button>
      <button type="button" className={styles.menuItem} onClick={() => onCopyPath('absolute')}>
        {t('editor:fileTree.contextMenu.copyAbsolutePath')}
      </button>
      <button type="button" className={styles.menuItem} onClick={onReveal}>
        {t('editor:fileTree.contextMenu.revealInExplorer')}
      </button>
      {menu.target.node && (
        <>
          <div className={styles.menuSeparator} />
          <button type="button" className={styles.menuItem} onClick={onRename}>
            {t('editor:fileTree.contextMenu.rename')}
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={onDelete}
          >
            {t('editor:fileTree.contextMenu.delete')}
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
