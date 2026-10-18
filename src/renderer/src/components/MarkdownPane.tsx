import { useEffect } from 'react'
import { QuickNote } from './note/QuickNote'
import { useDraftCardStore } from '@/stores/draft-card'
import { useWorkspaceStore } from '@/stores/workspace'
import { GLOBAL_MARKDOWN_PANEL, useGlobalToolsStore } from '@/stores/global-tools'
import { GLOBAL_PANE_SCOPE } from '@/lib/workspace-front-surface'
import { useI18n } from '@/i18n/useI18n'
import styles from './MarkdownPane.module.css'

// The global panel selects document ownership explicitly; workspace switches do not select another document.
export function MarkdownPane({ panelId }: { panelId: string }) {
  const { t } = useI18n('terminal')
  const selectedScope = useGlobalToolsStore((s) => s.markdownScopeId)
  const setScope = useGlobalToolsStore((s) => s.setMarkdownScope)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const drafts = useDraftCardStore((s) => s.drafts)
  const global = panelId === GLOBAL_MARKDOWN_PANEL
  const scopeId = global ? selectedScope ?? GLOBAL_PANE_SCOPE : panelId
  const scopes = [...new Set([GLOBAL_PANE_SCOPE, ...workspaces.map((w) => w.id), ...Object.keys(drafts), scopeId])]
  const migrateLegacyDraftScopes = useDraftCardStore((s) => s.migrateLegacyDraftScopes)

  // 首次挂载时把旧版按终端归属的草稿迁到作用域上；幂等，之后不再跑。
  useEffect(() => {
    const workspace = useWorkspaceStore.getState()
    const scopeByTerminal = new Map<string, string>()
    for (const terminal of workspace.terminals) scopeByTerminal.set(terminal.id, terminal.workspaceId)
    for (const snapshot of Object.values(workspace.terminalSnapshots)) {
      for (const terminal of snapshot.terminals) scopeByTerminal.set(terminal.id, terminal.workspaceId)
    }
    migrateLegacyDraftScopes((terminalId) => scopeByTerminal.get(terminalId) ?? null)
  }, [migrateLegacyDraftScopes])

  return (
    <div className={styles.pane} aria-label={t('terminal:tab.view.note')}>
      {global && <label className={styles.scope}>
        <span>{t('common:toolGroup.draftScope')}</span>
        <select aria-label={t('common:toolGroup.draftScope')} value={scopeId} onChange={(event) => setScope(event.target.value)}>
          {scopes.map((id) => <option key={id} value={id}>
            {id === GLOBAL_PANE_SCOPE ? t('common:toolGroup.globalDrafts') : workspaces.find((w) => w.id === id)?.name ?? t('common:toolGroup.retainedDrafts', { id })}
          </option>)}
        </select>
      </label>}
      <div className="min-h-0 flex-1"><QuickNote key={scopeId} scopeId={scopeId} /></div>
    </div>
  )
}
