import { useEffect, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react'
import { RIGHT_TOOL_REGISTRY } from '@/right-tools/registry'
import type { RightToolId } from '@/right-tools/types'
import styles from './RightDock.module.css'

interface RightToolTabsProps {
  openToolIds: readonly RightToolId[]
  activeToolId: RightToolId | null
  onActivate: (toolId: RightToolId) => void
  onClose: (toolId: RightToolId) => void
}

export function RightToolTabs({ openToolIds, activeToolId, onActivate, onClose }: RightToolTabsProps) {
  const [focusedToolId, setFocusedToolId] = useState<RightToolId | null>(activeToolId)
  const tabRefs = useRef(new Map<RightToolId, HTMLDivElement>())
  const tablistRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })
  const tools = RIGHT_TOOL_REGISTRY.filter(({ id }) => openToolIds.includes(id))

  const updateOverflow = () => {
    const tablist = tablistRef.current
    if (!tablist) return
    setOverflow({
      left: tablist.scrollLeft > 1,
      right: tablist.scrollLeft + tablist.clientWidth < tablist.scrollWidth - 1,
    })
  }

  useEffect(() => {
    updateOverflow()
    window.addEventListener('resize', updateOverflow)
    return () => window.removeEventListener('resize', updateOverflow)
  }, [openToolIds])

  useEffect(() => {
    if (focusedToolId && openToolIds.includes(focusedToolId)) return
    const nextToolId = activeToolId ?? openToolIds[0] ?? null
    setFocusedToolId(nextToolId)
    if (nextToolId) window.requestAnimationFrame(() => tabRefs.current.get(nextToolId)?.focus())
  }, [activeToolId, focusedToolId, openToolIds])

  useEffect(() => {
    if (!activeToolId) return
    tabRefs.current.get(activeToolId)?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeToolId])

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.currentTarget.scrollLeft += event.deltaY
    }
  }

  const focusTool = (toolId: RightToolId) => {
    setFocusedToolId(toolId)
    tabRefs.current.get(toolId)?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, toolId: RightToolId) => {
    const nextToolId = getTabKeyboardTarget(event.key, toolId, tools.map(({ id }) => id))
    if (nextToolId) {
      focusTool(nextToolId)
      event.preventDefault()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      onActivate(toolId)
      event.preventDefault()
    } else if (event.key === 'Delete') {
      onClose(toolId)
      event.preventDefault()
    }
  }

  return (
    <div className={styles.tabsWrap} data-overflow-left={overflow.left} data-overflow-right={overflow.right}>
      <div
        ref={tablistRef}
        className={styles.tabs}
        role="tablist"
        aria-label="已打开的右侧工具"
        onWheel={handleWheel}
        onScroll={updateOverflow}
      >
      {tools.map((tool) => {
        const selected = activeToolId === tool.id
        return (
          <div
            key={tool.id}
            ref={(element) => {
              if (element) tabRefs.current.set(tool.id, element)
              else tabRefs.current.delete(tool.id)
            }}
            id={`right-tool-tab-${tool.id}`}
            role="tab"
            aria-selected={selected}
            aria-controls={`right-tool-panel-${tool.id}`}
            tabIndex={focusedToolId === tool.id ? 0 : -1}
            className={styles.tab}
            data-active={selected}
            onClick={() => onActivate(tool.id)}
            onFocus={() => setFocusedToolId(tool.id)}
            onKeyDown={(event) => handleKeyDown(event, tool.id)}
          >
            <span className={styles.tabLabel}>{tool.shortTitle}</span>
            <button
              type="button"
              className={styles.tabClose}
              aria-label={`关闭 ${tool.title}`}
              title={`关闭 ${tool.title}`}
              onClick={(event) => {
                event.stopPropagation()
                onClose(tool.id)
              }}
            />
          </div>
        )
      })}
      </div>
    </div>
  )
}

export function getTabKeyboardTarget(
  key: string,
  currentToolId: RightToolId,
  openToolIds: readonly RightToolId[],
): RightToolId | null {
  const index = openToolIds.indexOf(currentToolId)
  if (index < 0 || openToolIds.length === 0) return null
  if (key === 'Home') return openToolIds[0]
  if (key === 'End') return openToolIds[openToolIds.length - 1]
  if (key === 'ArrowLeft') return openToolIds[(index - 1 + openToolIds.length) % openToolIds.length]
  if (key === 'ArrowRight') return openToolIds[(index + 1) % openToolIds.length]
  return null
}
