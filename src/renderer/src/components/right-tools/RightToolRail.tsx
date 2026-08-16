import { Files, GitBranch, History, PanelRightClose, PanelRightOpen, Sparkles, type LucideIcon } from 'lucide-react'
import { RIGHT_TOOL_REGISTRY } from '@/right-tools/registry'
import type { RightToolId } from '@/right-tools/types'
import { useI18n } from '@/i18n/useI18n'
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
  const panelToggleLabel = collapsed
    ? t('common:rightDock.expandAria')
    : t('common:rightDock.collapseAria')
  return (
    <div className={styles.rail} role="toolbar" aria-label={t('common:rightTool.railAria')}>
      <div className={styles.railTools}>
        {panelToggle && (
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
