import { useAppStore, type ActiveWorkbench } from '@/stores/app'
import { useBlueprintStore } from '@/stores/blueprint'
import styles from './WorkbenchSwitcher.module.css'

const WORKBENCHES: Array<{ id: Exclude<ActiveWorkbench, null>; initial: string; label: string }> = [
  { id: 'blueprint', initial: 'B', label: 'Blueprint' },
  { id: 'knowledge', initial: 'K', label: 'Knowledge' },
]

export function WorkbenchSwitcher() {
  const activeWorkbench = useAppStore((s) => s.activeWorkbench)
  const toggleWorkbench = useAppStore((s) => s.toggleWorkbench)
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const activeSession = useBlueprintStore((s) => s.activeSession)

  const pendingCandidateCount =
    currentBlueprint?.requirementCandidates?.filter((candidate) => candidate.status === 'pending').length ?? 0
  const hasBlueprintAttention = pendingCandidateCount > 0 || !!activeSession

  const getButtonStatus = (itemId: Exclude<ActiveWorkbench, null>, isActive: boolean) => {
    if (itemId === 'blueprint' && hasBlueprintAttention) return 'attention'
    return isActive ? 'active' : 'idle'
  }

  const getButtonTitle = (itemId: Exclude<ActiveWorkbench, null>, label: string, isActive: boolean) => {
    if (itemId !== 'blueprint') return `${isActive ? 'Close' : 'Open'} ${label} Workbench`
    if (pendingCandidateCount > 0) return `${isActive ? 'Close' : 'Open'} Blueprint Workbench - ${pendingCandidateCount} pending`
    if (activeSession) return `${isActive ? 'Close' : 'Open'} Blueprint Workbench - node focused`
    return `${isActive ? 'Close' : 'Open'} Blueprint Workbench`
  }

  return (
    <div className={styles.switcher} data-open={activeWorkbench ?? 'none'} aria-label="Workbench switcher">
      {WORKBENCHES.map((item) => {
        const isActive = activeWorkbench === item.id
        const isBlueprint = item.id === 'blueprint'
        const status = getButtonStatus(item.id, isActive)
        const badge = isBlueprint ? pendingCandidateCount : 0
        const title = getButtonTitle(item.id, item.label, isActive)
        return (
          <button
            key={item.id}
            type="button"
            className={`${styles.capsule} ${isActive ? styles.capsuleActive : ''}`}
            data-id={item.id}
            data-status={status}
            aria-pressed={isActive}
            aria-label={title}
            title={title}
            onClick={() => toggleWorkbench(item.id)}
          >
            <span className={styles.dot} aria-hidden="true">{item.initial}</span>
            <span className={styles.label}>{item.label}</span>
            <span className={styles.led} />
            {badge > 0 ? <span className={styles.badge} title={`${badge} pending requirement${badge > 1 ? 's' : ''}`}>{badge > 9 ? '9+' : badge}</span> : null}
          </button>
        )
      })}
    </div>
  )
}