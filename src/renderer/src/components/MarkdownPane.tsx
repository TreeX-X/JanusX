import { useEffect } from 'react'
import { QuickNote } from './note/QuickNote'
import { useDraftCardStore } from '@/stores/draft-card'
import { useWorkspaceStore } from '@/stores/workspace'
import { useI18n } from '@/i18n/useI18n'
import styles from './MarkdownPane.module.css'

/**
 * 中央工作区的 Markdown 面板：一个面板承载草稿列表与当前文稿编辑器。
 *
 * `panelId` 就是草稿作用域（首版每个工作区复用一个面板，因此与 workspaceId 同值）。
 * 这里刻意不读活动工作区：切换工作区时其他 surface 仍 mounted 只是被 inert 隐藏，
 * 若按活动工作区取作用域，那些挂起的面板会显示别的项目的文稿。
 * 草稿按作用域归属，因此面板被拖到别的 pane、分屏、合并后继续编辑同一批正文。
 */
export function MarkdownPane({ panelId }: { panelId: string }) {
  const { t } = useI18n('terminal')
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
      <QuickNote scopeId={panelId} />
    </div>
  )
}
