import { useId, useState } from 'react'
import { ChevronDown, ExternalLink, RotateCw } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { useWorkflowXStore } from '@/stores/workflowx'
import { useWorkspaceStore } from '@/stores/workspace'
import styles from './WorkflowXMonitor.module.css'

export function WorkflowXMonitor() {
  return <WorkflowXStatus />
}

// Note: settings and Island share detection state and actions — see .agents/notes/blueprint/requirements/workflowx-onboarding.md
export function WorkflowXStatus({ surface = 'island' }: { surface?: 'island' | 'settings' }) {
  const { t } = useI18n('janus')
  const { snapshot, checking, check } = useWorkflowXStore()
  const workspaceId = useWorkspaceStore(state => state.activeWorkspaceId)
  const workspaceName = useWorkspaceStore(state => state.workspaces.find(workspace => workspace.id === state.activeWorkspaceId)?.name)
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const [linkFailed, setLinkFailed] = useState(false)
  const current = snapshot?.workspaceId === workspaceId ? snapshot : null
  const status = current?.status ?? 'checking'
  const isSettings = surface === 'settings'
  const sourceSummary = [...new Set(current?.sources.filter(source => source.status === 'detected')
    .map(source => `${t(`workflowx.${source.scope}`)} · ${source.format === 'claude' ? 'Claude' : 'Codex'}`) ?? [])].join(' / ')
  const statusLabel = <span className={styles.state} data-status={status}>
    <i aria-hidden="true" />{t(`workflowx.status.${status}`)}
  </span>
  const actions = <div className={styles.actions}>
    {isSettings && <button type="button" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(value => !value)}>
      <ChevronDown size={12} aria-hidden="true" />{t('workflowx.sources')}
    </button>}
    <button type="button" disabled={checking} onClick={() => void check(workspaceId, true)}>
      <RotateCw size={12} aria-hidden="true" />{t(checking ? 'workflowx.status.checking' : 'workflowx.refresh')}
    </button>
    <button type="button" onClick={() => {
      setLinkFailed(false)
      void window.electron.workflowx.openRepository().then(ok => setLinkFailed(!ok)).catch(() => setLinkFailed(true))
    }}><ExternalLink size={12} aria-hidden="true" />{t('workflowx.repository')}</button>
  </div>
  return (
    <div className={`${styles.root} ${isSettings ? styles.settings : ''}`} data-testid={isSettings ? 'workflowx-settings' : 'workflowx-monitor'} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false) } }}>
      {isSettings ? <>
        <div className={styles.summary}>
          <span className={styles.target}>{workspaceId ? t('workflowx.currentWorkspace', { name: workspaceName ?? t('workflowx.workspace') }) : t('workflowx.globalEnvironment')}</span>
          {statusLabel}
        </div>
        {sourceSummary && <p className={styles.sourceSummary}>{t('workflowx.detectedSources', { sources: sourceSummary })}</p>}
        {actions}
        {linkFailed && <p className={styles.feedback}>{t('workflowx.linkFailed')}</p>}
      </> : <button type="button" className={styles.summary} aria-expanded={open} aria-controls={detailsId}
        aria-label={t('workflowx.sources')} onClick={() => setOpen(value => !value)}>
        <span>WorkflowX</span>
        <span className={styles.state} data-status={status}>
          <i aria-hidden="true" />{t(`workflowx.status.${status}`)}<ChevronDown size={12} aria-hidden="true" />
        </span>
      </button>}
      {open && <div id={detailsId} className={styles.details}>
        <p>{t(workspaceId ? 'workflowx.scope' : 'workflowx.globalScope')}</p>
        <p>{t(current?.unavailable ? 'workflowx.unavailable' : status === 'missing' ? 'workflowx.missingHint' : 'workflowx.limits')}</p>
        {current && current.sources.length > 0 && <ul>
          {current.sources.map(source => <li key={`${source.format}:${source.path}:${source.reason}`}>
            <span>{source.format === 'claude' ? 'Claude' : 'Codex'} · {t(`workflowx.${source.scope}`)} · {t(`workflowx.reason.${source.reason}`)}</span>
            <code>{source.path}</code>
          </li>)}
        </ul>}
        {!isSettings && actions}
        {!isSettings && linkFailed && <p>{t('workflowx.linkFailed')}</p>}
      </div>}
    </div>
  )
}
