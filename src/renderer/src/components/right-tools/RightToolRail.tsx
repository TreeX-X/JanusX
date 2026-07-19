import type { ReactNode } from 'react'
import { RIGHT_TOOL_REGISTRY } from '@/right-tools/registry'
import type { RightToolId } from '@/right-tools/types'
import styles from './RightDock.module.css'

interface RightToolRailProps {
  openToolIds: readonly RightToolId[]
  activeToolId: RightToolId | null
  collapsed: boolean
  panelToggleDisabled: boolean
  onToggleTool: (toolId: RightToolId) => void
  onTogglePanel: () => void
}

export function RightToolRail({
  openToolIds,
  activeToolId,
  collapsed,
  panelToggleDisabled,
  onToggleTool,
  onTogglePanel,
}: RightToolRailProps) {
  return (
    <div className={styles.rail} role="toolbar" aria-label="右侧工具">
      <div className={styles.railTools}>
        {RIGHT_TOOL_REGISTRY.map((tool) => {
          const state = activeToolId === tool.id ? 'active' : openToolIds.includes(tool.id) ? 'open' : 'closed'
          return (
            <button
              key={tool.id}
              type="button"
              className={styles.railButton}
              data-state={state}
              aria-label={`${tool.ariaLabel}，${state === 'active' ? '当前' : state === 'open' ? '已打开' : '已关闭'}`}
              aria-pressed={state === 'active'}
              title={tool.title}
              onClick={() => onToggleTool(tool.id)}
            >
              <ToolIcon toolId={tool.id} />
              <span className={styles.railState} aria-hidden="true" />
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className={styles.railButton}
        disabled={panelToggleDisabled || openToolIds.length === 0}
        aria-label={collapsed ? '展开右侧工具面板' : '折叠右侧工具面板'}
        title={collapsed ? '展开面板' : '折叠面板'}
        onClick={onTogglePanel}
      >
        <span className={styles.collapseGlyph} data-collapsed={collapsed} aria-hidden="true" />
      </button>
    </div>
  )
}

const TOOL_ICON_SHAPES: Record<RightToolId, ReactNode> = {
  files: (
    <path d="M1.75 4.25c0-.55.45-1 1-1h3.1c.3 0 .58.13.77.36l.95 1.14h5.68c.55 0 1 .45 1 1v6c0 .55-.45 1-1 1H2.75c-.55 0-1-.45-1-1v-7.5Z" />
  ),
  git: (
    <>
      <circle cx="4.5" cy="4" r="1.75" />
      <circle cx="4.5" cy="12" r="1.75" />
      <circle cx="11.5" cy="4" r="1.75" />
      <path d="M4.5 5.75v4.5M11.5 5.75V7c0 1.5-1.5 2.5-3 2.5H6.25" />
    </>
  ),
  checkpoints: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.75V8l2.25 1.5" />
    </>
  ),
  assist: (
    <path d="M8 1.75 9.6 6.4 14.25 8 9.6 9.6 8 14.25 6.4 9.6 1.75 8 6.4 6.4 8 1.75Z" />
  ),
}

function ToolIcon({ toolId }: { toolId: RightToolId }) {
  return (
    <svg
      className={styles.railIcon}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TOOL_ICON_SHAPES[toolId]}
    </svg>
  )
}
