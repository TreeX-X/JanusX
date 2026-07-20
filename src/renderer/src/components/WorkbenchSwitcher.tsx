import type { ReactNode } from 'react'
import { useAppStore, type ActiveWorkbench } from '@/stores/app'
import { useBlueprintStore } from '@/stores/blueprint'
import styles from './WorkbenchSwitcher.module.css'

type WorkbenchId = Exclude<ActiveWorkbench, null>

const WORKBENCHES: Array<{ id: WorkbenchId; label: string }> = [
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'knowledge', label: 'Knowledge' },
]

const WORKBENCH_ICON_SHAPES: Record<WorkbenchId, ReactNode> = {
  blueprint: (
    <>
      <circle cx="4" cy="4.5" r="1.75" />
      <circle cx="12" cy="4.5" r="1.75" />
      <circle cx="8" cy="11.5" r="1.75" />
      <path d="M4.85 6 7.15 10M11.15 6 8.85 10" />
    </>
  ),
  knowledge: (
    <>
      <path d="M8 4.1C6.9 3.2 5.3 2.85 2.75 3.05v9.4c2.55-.2 4.15.15 5.25 1.05 1.1-.9 2.7-1.25 5.25-1.05v-9.4C10.7 2.85 9.1 3.2 8 4.1Z" />
      <path d="M8 4.1v9.4" />
    </>
  ),
}

function WorkbenchIcon({ id }: { id: WorkbenchId }) {
  return (
    <svg
      className={styles.icon}
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
      {WORKBENCH_ICON_SHAPES[id]}
    </svg>
  )
}

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
            <WorkbenchIcon id={item.id} />
            <span className={styles.led} aria-hidden="true" />
            {badge > 0 ? <span className={styles.badge} title={`${badge} pending requirement${badge > 1 ? 's' : ''}`}>{badge > 9 ? '9+' : badge}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
