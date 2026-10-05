import { useId, useState } from 'react'
import { ChevronDown, ExternalLink, RotateCw } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { useWorkflowXStore } from '@/stores/workflowx'
import { useWorkspaceStore } from '@/stores/workspace'
import styles from './WorkflowXMonitor.module.css'

export function WorkflowXMonitor() {
  const { t } = useI18n('janus')
  const { snapshot, checking, check } = useWorkflowXStore()
  const workspaceId = useWorkspaceStore(state => state.activeWorkspaceId)
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const [linkFailed, setLinkFailed] = useState(false)
  const current = snapshot?.workspaceId === workspaceId ? snapshot : null
  const status = current?.status ?? 'checking'
  return (
    <div className={styles.root} data-testid="workflowx-monitor" onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false) } }}>
      <button type="button" className={styles.summary} aria-expanded={open} aria-controls={detailsId}
        aria-label={t('workflowx.sources')} onClick={() => setOpen(value => !value)}>
        <span>WorkflowX</span>
        <span className={styles.state} data-status={status}>
          <i aria-hidden="true" />{t(`workflowx.status.${status}`)}<ChevronDown size={12} aria-hidden="true" />
        </span>
      </button>
      {open && <div id={detailsId} className={styles.details}>
        <p>{t('workflowx.scope')}</p>
        <p>{t(current?.unavailable ? 'workflowx.unavailable' : status === 'missing' ? 'workflowx.missingHint' : 'workflowx.limits')}</p>
        {current && current.sources.length > 0 && <ul>
          {current.sources.map(source => <li key={`${source.format}:${source.path}:${source.reason}`}>
            <span>{source.format === 'claude' ? 'Claude' : 'Codex'} · {t(`workflowx.${source.scope}`)} · {t(`workflowx.reason.${source.reason}`)}</span>
            <code>{source.path}</code>
          </li>)}
        </ul>}
        <div className={styles.actions}>
          <button type="button" disabled={checking} onClick={() => void check(workspaceId, true)}>
            <RotateCw size={12} aria-hidden="true" />{t(checking ? 'workflowx.status.checking' : 'workflowx.refresh')}
          </button>
          <button type="button" onClick={() => {
            setLinkFailed(false)
            void window.electron.workflowx.openRepository().then(ok => setLinkFailed(!ok)).catch(() => setLinkFailed(true))
          }}><ExternalLink size={12} aria-hidden="true" />{t('workflowx.repository')}</button>
        </div>
        {linkFailed && <p>{t('workflowx.linkFailed')}</p>}
      </div>}
    </div>
  )
}
