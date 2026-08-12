import { useAppStore, type ActiveWorkbench } from '@/stores/app'
import { useBlueprintStore } from '@/stores/blueprint'
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon'
import { useI18n } from '@/i18n/useI18n'
import styles from './WorkbenchSwitcher.module.css'

type WorkbenchId = Exclude<ActiveWorkbench, null>

const WORKBENCHES: Array<{ id: WorkbenchId; labelKey: string }> = [
  { id: 'blueprint', labelKey: 'common:workbench.blueprint' },
  { id: 'knowledge', labelKey: 'common:workbench.knowledge' },
]

export function WorkbenchSwitcher() {
  const { t } = useI18n()
  const activeWorkbench = useAppStore((s) => s.activeWorkbench)
  const toggleWorkbench = useAppStore((s) => s.toggleWorkbench)
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const activeSession = useBlueprintStore((s) => s.activeSession)

  const pendingCandidateCount =
    currentBlueprint?.requirementCandidates?.filter((candidate) => candidate.status === 'pending').length ?? 0
  const hasBlueprintAttention = pendingCandidateCount > 0 || !!activeSession

  const getButtonStatus = (itemId: WorkbenchId, isActive: boolean) => {
    if (itemId === 'blueprint' && hasBlueprintAttention) return 'attention'
    return isActive ? 'active' : 'idle'
  }

  const getButtonTitle = (itemId: WorkbenchId, labelKey: string, isActive: boolean) => {
    const action = isActive ? t('common:workbench.close') : t('common:workbench.open')
    const label = t(labelKey)
    if (itemId !== 'blueprint') return t('common:workbench.titleAction', { action, label })
    if (pendingCandidateCount > 0) return t('common:workbench.titleWithPending', { action, label, count: pendingCandidateCount })
    if (activeSession) return t('common:workbench.titleWithFocus', { action, label })
    return t('common:workbench.titleAction', { action, label })
  }

  return (
    <div className={styles.switcher} data-open={activeWorkbench ?? 'none'} aria-label={t('common:workbench.switcherAria')}>
      {WORKBENCHES.map((item) => {
        const isActive = activeWorkbench === item.id
        const status = getButtonStatus(item.id, isActive)
        const badge = item.id === 'blueprint' ? pendingCandidateCount : 0
        const title = getButtonTitle(item.id, item.labelKey, isActive)
        return (
          <button
            key={item.id}
            type="button"
            className={styles.button}
            data-id={item.id}
            data-status={status}
            aria-pressed={isActive}
            aria-label={title}
            title={title}
            onClick={() => toggleWorkbench(item.id)}
          >
            <WorkbenchIcon id={item.id} className={styles.icon} />
            <span className={styles.led} aria-hidden="true" />
            {badge > 0 ? <span className={styles.badge} title={t('common:workbench.badgeTitle', { count: badge })}>{badge > 9 ? '9+' : badge}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
