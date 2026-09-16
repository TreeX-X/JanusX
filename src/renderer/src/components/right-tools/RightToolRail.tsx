// Note: rail-only is the normal empty state with no panel toggle — see .agents/notes/implemented/bug-fix/2026-09-16-right-dock-empty-collapse.md
import { useEffect, useState } from 'react'
import { Files, GitBranch, History, PanelRightClose, PanelRightOpen, Sparkles, UserRound, type LucideIcon } from 'lucide-react'
import { RIGHT_TOOL_REGISTRY } from '@/right-tools/registry'
import type { RightToolId } from '@/right-tools/types'
import { useI18n } from '@/i18n/useI18n'
import { getUserMemoryOverview } from '@/services/knowledge'
import styles from './RightDock.module.css'

interface RightToolRailProps {
  openToolIds: readonly RightToolId[]
  activeToolId: RightToolId | null
  onToggleTool: (toolId: RightToolId) => void
  collapsed?: boolean
  onExpandPanel?: () => void
  forcedCollapsed?: boolean
  onTogglePanel?: () => void
}

export function RightToolRail({
  openToolIds,
  activeToolId,
  onToggleTool,
  collapsed = false,
  onExpandPanel,
  forcedCollapsed = false,
  onTogglePanel,
}: RightToolRailProps) {
  const { t } = useI18n('common')
  const panelToggle = onTogglePanel ?? onExpandPanel
  const hasOpenTools = openToolIds.length > 0
  const panelToggleLabel = collapsed
    ? t('common:rightDock.expandAria')
    : t('common:rightDock.collapseAria')
  return (
    <div className={styles.rail} role="toolbar" aria-label={t('common:rightTool.railAria')}>
      <div className={styles.railTools}>
        {hasOpenTools && panelToggle && (
          <button
            type="button"
            className={styles.railButton}
            aria-label={panelToggleLabel}
            title={panelToggleLabel}
            aria-expanded={!collapsed}
            aria-controls="right-tool-panel"
            disabled={forcedCollapsed}
            onClick={panelToggle}
          >
            {collapsed
              ? <PanelRightOpen size={16} strokeWidth={1.6} aria-hidden="true" />
              : <PanelRightClose size={16} strokeWidth={1.6} aria-hidden="true" />}
          </button>
        )}
        {RIGHT_TOOL_REGISTRY.map((tool) => {
          const state = activeToolId === tool.id ? 'active' : openToolIds.includes(tool.id) ? 'open' : 'closed'
          const stateLabel = state === 'active'
            ? t('common:rightTool.railStateActive')
            : state === 'open'
              ? t('common:rightTool.railStateOpen')
              : t('common:rightTool.railStateClosed')
          return (
            <button
              key={tool.id}
              type="button"
              className={styles.railButton}
              data-state={state}
              aria-label={t('common:rightTool.railButtonAria', { label: t(tool.ariaLabelKey), state: stateLabel })}
              aria-pressed={state === 'active'}
              title={t(tool.titleKey)}
              onClick={() => onToggleTool(tool.id)}
            >
              <ToolIcon toolId={tool.id} />
              {tool.id === 'persona' && <PersonaPendingDot />}
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
  persona: UserRound,
}

function ToolIcon({ toolId }: { toolId: RightToolId }) {
  const Icon = TOOL_ICONS[toolId]
  return <Icon className={styles.railIcon} size={16} strokeWidth={1.6} aria-hidden="true" />
}

/** Quiet badge: pending habit candidates awaiting Inbox review. Shows state only. */
function PersonaPendingDot() {
  const [pending, setPending] = useState(0)
  useEffect(() => {
    let alive = true
    void getUserMemoryOverview().then((overview) => {
      if (alive && overview && overview.pendingHabitCount > 0) setPending(overview.pendingHabitCount)
    }).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  if (pending === 0) return null
  return <span className={styles.railBadge} data-count={pending > 9 ? '9+' : String(pending)} aria-hidden="true" />
}
