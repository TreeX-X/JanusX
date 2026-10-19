import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react'
import { getRightToolDefinitions, rightToolLabel } from '@/right-tools/registry'
import { useExtensionViews } from '@/extensions/react'
import type { RightToolId } from '@/right-tools/types'
import { useI18n } from '@/i18n/useI18n'
import { ThemedTooltip } from '@/components/ui/ThemedTooltip'
import { usePendingToolActivation } from './usePendingToolActivation'
import styles from './RightDock.module.css'

interface RightToolTabsProps {
  openToolIds: readonly RightToolId[]
  activeToolId: RightToolId | null
  onActivate: (toolId: RightToolId) => void
  onClose: (toolId: RightToolId) => void
  disabled?: boolean
}

export function RightToolTabs({ openToolIds, activeToolId, onActivate, onClose, disabled = false }: RightToolTabsProps) {
  const { t } = useI18n('common')
  useExtensionViews()
  const [focusedToolId, setFocusedToolId] = useState<RightToolId | null>(activeToolId)
  const tabRefs = useRef(new Map<RightToolId, HTMLDivElement>())
  const tablistRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)
  const { pendingToolId, visualToolId, requestActivate, cancelPending } = usePendingToolActivation({
    activeToolId, validToolIds: openToolIds, onActivate, disabled,
  })
  const tools = getRightToolDefinitions().filter(({ id }) => openToolIds.includes(id))

  const closeTab = (toolId: RightToolId) => {
    cancelPending()
    onClose(toolId)
  }

  const updateOverflow = useCallback(() => {
    const tablist = tablistRef.current
    if (!tablist) return
    const next = {
      left: tablist.scrollLeft > 1,
      right: tablist.scrollLeft + tablist.clientWidth < tablist.scrollWidth - 1,
    }
    setOverflow((current) => current.left === next.left && current.right === next.right ? current : next)
  }, [])

  useLayoutEffect(() => {
    const measure = () => {
      const tab = visualToolId ? tabRefs.current.get(visualToolId) : null
      const next = tab ? { left: tab.offsetLeft, width: tab.offsetWidth } : null
      setIndicator((current) => current?.left === next?.left && current?.width === next?.width ? current : next)
      updateOverflow()
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (tablistRef.current) observer.observe(tablistRef.current)
    for (const tab of tabRefs.current.values()) observer.observe(tab)
    return () => observer.disconnect()
  }, [visualToolId, openToolIds, updateOverflow])

  useEffect(() => {
    if (focusedToolId && openToolIds.includes(focusedToolId)) return
    const nextToolId = activeToolId ?? openToolIds[0] ?? null
    setFocusedToolId(nextToolId)
    if (nextToolId) window.requestAnimationFrame(() => tabRefs.current.get(nextToolId)?.focus())
  }, [activeToolId, focusedToolId, openToolIds])

  useEffect(() => {
    if (!visualToolId) return
    tabRefs.current.get(visualToolId)?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [visualToolId])

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
    if (event.target !== event.currentTarget) return
    const nextToolId = getTabKeyboardTarget(event.key, toolId, tools.map(({ id }) => id))
    if (nextToolId) {
      focusTool(nextToolId)
      event.preventDefault()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      requestActivate(toolId)
      event.preventDefault()
    } else if (event.key === 'Delete') {
      closeTab(toolId)
      event.preventDefault()
    }
  }

  return (
    <div className={styles.tabsWrap} data-overflow-left={overflow.left} data-overflow-right={overflow.right}>
      <div
        ref={tablistRef}
        className={styles.tabs}
        role="tablist"
        aria-busy={pendingToolId !== null}
        aria-label={t('common:rightTool.openTabsAria')}
        onWheel={handleWheel}
        onScroll={updateOverflow}
      >
      <span
        aria-hidden="true"
        className={styles.tabIndicator}
        data-testid="right-tool-tab-indicator"
        data-visible={indicator !== null}
        style={{ width: indicator?.width ?? 0, transform: `translateX(${indicator?.left ?? 0}px)` }}
      />
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
            data-active={visualToolId === tool.id}
            data-pending={pendingToolId === tool.id}
            onClick={() => requestActivate(tool.id)}
            onFocus={() => setFocusedToolId(tool.id)}
            onKeyDown={(event) => handleKeyDown(event, tool.id)}
          >
            <span className={styles.tabLabel}>{rightToolLabel(tool, t, 'shortTitle')}</span>
            <ThemedTooltip label={t('common:rightTool.closeTitle', { title: rightToolLabel(tool, t) })}>
            <button
              type="button"
              className={styles.tabClose}
              aria-label={t('common:rightTool.closeAria', { title: rightToolLabel(tool, t) })}
              onClick={(event) => {
                event.stopPropagation()
                closeTab(tool.id)
              }}
            />
            </ThemedTooltip>
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
