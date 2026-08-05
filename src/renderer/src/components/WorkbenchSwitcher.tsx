import { useAppStore, type ActiveWorkbench } from '@/stores/app'
import { useBlueprintStore } from '@/stores/blueprint'
import { WorkbenchIcon } from '@/components/ui/WorkbenchIcon'
import styles from './WorkbenchSwitcher.module.css'

type WorkbenchId = Exclude<ActiveWorkbench, null>

const WORKBENCHES: Array<{ id: WorkbenchId; label: string }> = [
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'knowledge', label: 'Knowledge' },
]

export function WorkbenchSwitcher() {
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

  const getButtonTitle = (itemId: WorkbenchId, label: string, isActive: boolean) => {
    if (itemId !== 'blueprint') return `${isActive ? 'Close' : 'Open'} ${label} Workbench`
    if (pendingCandidateCount > 0) return `${isActive ? 'Close' : 'Open'} Blueprint Workbench - ${pendingCandidateCount} pending`
    if (activeSession) return `${isActive ? 'Close' : 'Open'} Blueprint Workbench - node focused`
    return `${isActive ? 'Close' : 'Open'} Blueprint Workbench`
  }

  return (
    <div className={styles.switcher} data-open={activeWorkbench ?? 'none'} aria-label="Workbench switcher">
      {WORKBENCHES.map((item) => {
        const isActive = activeWorkbench === item.id
        const status = getButtonStatus(item.id, isActive)
        const badge = item.id === 'blueprint' ? pendingCandidateCount : 0
        const title = getButtonTitle(item.id, item.label, isActive)
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
            {badge > 0 ? <span className={styles.badge} title={`${badge} pending requirement${badge > 1 ? 's' : ''}`}>{badge > 9 ? '9+' : badge}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
