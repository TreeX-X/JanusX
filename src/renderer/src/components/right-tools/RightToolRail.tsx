import { useAssistantPendingCount } from '@/components/knowledge/useAssistantPendingCount'
import { useAnimatedOpen } from '@/components/shared/CardFrame'
// Note: rail-only is the normal empty state with no panel toggle — see .agents/notes/workbench/right-dock-empty-collapse.md
import { ListChecks, Files, GitBranch, MessagesSquare, PanelRightClose, PanelRightOpen, Sparkles, UserRound, type LucideIcon } from 'lucide-react'
import { isRightToolEnabled, RIGHT_TOOL_REGISTRY } from '@/right-tools/registry'
import type { RightToolId } from '@/right-tools/types'
import { useExperimentalStore } from '@/stores/experimental'
import { useI18n } from '@/i18n/useI18n'
import { ThemedTooltip } from '@/components/ui/ThemedTooltip'
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

/**
 * 折叠/展开控件的进出场时长（ms）。刻意慢于侧栏默认的 SIDE_PANEL_EXIT_MS（220ms），
 * 让"加载出来/退出"读得成一个过程而不是一次闪现。
 * RightDock.module.css 的 .railToggle 与 .panel 过渡必须与此一致，
 * 尤其 visibility 延时 = 这里的卸载定时器，改一个就要改另一个。
 */
const RAIL_TOGGLE_MOTION_MS = 320

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
  const personaEnabled = useExperimentalStore((s) => s.persona)
  const knowledgeEnabled = useExperimentalStore((s) => s.knowledge)
  const sessionsEnabled = useExperimentalStore((s) => s.sessions)
  const pending = useAssistantPendingCount()
  const panelToggle = onTogglePanel ?? onExpandPanel
  const visibleTools = RIGHT_TOOL_REGISTRY.filter((tool) => isRightToolEnabled(tool.id, { persona: personaEnabled, knowledge: knowledgeEnabled, sessions: sessionsEnabled }))
  const hasOpenTools = openToolIds.length > 0
  // 首次开 tab 时淡入展开、关掉最后一个 tab 时淡出收起，避免控件突然闪现/消失。
  // useAnimatedOpen 在退出动画播完后再卸载，空栏仍然不渲染该控件。
  const toggleVisible = hasOpenTools && Boolean(panelToggle)
  const toggleAnim = useAnimatedOpen(toggleVisible, RAIL_TOGGLE_MOTION_MS)
  const panelToggleLabel = collapsed
    ? t('common:rightDock.expandAria')
    : t('common:rightDock.collapseAria')
  return (
    <div className={styles.rail} role="toolbar" aria-label={t('common:rightTool.railAria')}>
      {toggleAnim.rendered && panelToggle && (
        <div
          className={styles.railToggle}
          data-visible={toggleAnim.visible ? 'true' : 'false'}
          aria-hidden={toggleAnim.visible ? undefined : 'true'}
        >
          <ThemedTooltip label={panelToggleLabel}>
          <button
            type="button"
            className={styles.railButton}
            aria-label={panelToggleLabel}
            aria-expanded={!collapsed}
            aria-controls="right-tool-panel"
            disabled={forcedCollapsed}
            onClick={panelToggle}
          >
            {collapsed
              ? <PanelRightOpen size={16} strokeWidth={1.6} aria-hidden="true" />
              : <PanelRightClose size={16} strokeWidth={1.6} aria-hidden="true" />}
          </button>
          </ThemedTooltip>
        </div>
      )}
      <div className={styles.railTools}>
        {visibleTools.map((tool) => {
          const state = activeToolId === tool.id ? 'active' : openToolIds.includes(tool.id) ? 'open' : 'closed'
          const stateLabel = state === 'active'
            ? t('common:rightTool.railStateActive')
            : state === 'open'
              ? t('common:rightTool.railStateOpen')
              : t('common:rightTool.railStateClosed')
          return (
            <ThemedTooltip key={tool.id} label={t(tool.titleKey)}>
            <button
              type="button"
              className={styles.railButton}
              data-state={state}
              aria-label={t('common:rightTool.railButtonAria', { label: t(tool.ariaLabelKey), state: stateLabel })}
              aria-pressed={state === 'active'}
              onClick={() => onToggleTool(tool.id)}
            >
              <ToolIcon toolId={tool.id} />
              {tool.id === 'assist' && pending !== null && pending > 0 && <span className={styles.railBadge}>{pending > 99 ? '99+' : pending}</span>}
              <span className={styles.railState} aria-hidden="true" />
            </button>
            </ThemedTooltip>
          )
        })}
      </div>
    </div>
  )
}

const TOOL_ICONS: Record<RightToolId, LucideIcon> = {
  files: Files,
  git: GitBranch,
  assist: Sparkles,
  persona: UserRound,
  review: ListChecks,
  sessions: MessagesSquare,
}

function ToolIcon({ toolId }: { toolId: RightToolId }) {
  const Icon = TOOL_ICONS[toolId]
  return <Icon className={styles.railIcon} size={16} strokeWidth={1.6} aria-hidden="true" />
}
