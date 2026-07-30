import { Files, GitBranch, History, Sparkles, type LucideIcon } from 'lucide-react'
import { RIGHT_TOOL_REGISTRY } from '@/right-tools/registry'
import type { RightToolId } from '@/right-tools/types'
import styles from './RightDock.module.css'

interface RightToolRailProps {
  openToolIds: readonly RightToolId[]
  activeToolId: RightToolId | null
  onToggleTool: (toolId: RightToolId) => void
}

export function RightToolRail({
  openToolIds,
  activeToolId,
  onToggleTool,
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
    </div>
  )
}

const TOOL_ICONS: Record<RightToolId, LucideIcon> = {
  files: Files,
  git: GitBranch,
  checkpoints: History,
  assist: Sparkles,
}

function ToolIcon({ toolId }: { toolId: RightToolId }) {
  const Icon = TOOL_ICONS[toolId]
  return <Icon className={styles.railIcon} size={16} strokeWidth={1.6} aria-hidden="true" />
}
