import { useEffect } from 'react'
import { useHarnessStore } from '@/stores/harness'
import { useBlueprintStore } from '@/stores/blueprint'
import { useI18n } from '@/i18n/useI18n'

interface HarnessScopeBarProps {
  cwd: string | null
  blueprintId: string | null
  blueprintSource?: string
}

/**
 * Project scope strip (S4): repo identity, binding state, share entry, and
 * save-conflict notice for harness-backed graphs. Legacy JSON blueprints
 * render nothing here.
 */
export function HarnessScopeBar({ cwd, blueprintId, blueprintSource }: HarnessScopeBarProps) {
  const { t } = useI18n('blueprint')
  const scope = useHarnessStore((s) => s.scope)
  const bindings = useHarnessStore((s) => s.bindings)
  const conflict = useHarnessStore((s) => s.conflict)
  const dismissConflict = useHarnessStore((s) => s.dismissConflict)
  const resolveScope = useHarnessStore((s) => s.resolveScope)
  const exportShare = useHarnessStore((s) => s.exportShare)
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint)

  useEffect(() => {
    if (cwd) void resolveScope(cwd)
  }, [cwd, resolveScope])

  if (!cwd || blueprintSource !== 'harness' || !scope?.ok) return null

  const onExport = async (): Promise<void> => {
    const picked = await window.electron.dialog.saveFile({ defaultName: 'harness-share.json', extension: 'json' })
    if (picked.canceled || !picked.filePath) return
    void exportShare(cwd, picked.filePath)
  }

  const onReload = async (): Promise<void> => {
    dismissConflict()
    if (blueprintId) await loadBlueprint(blueprintId)
  }

  return (
    <div className="harness-scope-bar" data-testid="harness-scope-bar">
      <span className="harness-scope-bar__repo" title={scope.root ?? ''}>
        {t('blueprint:harness.scopeLabel')} · {scope.repoName ?? ''} · {bindings.length}
      </span>
      <button type="button" className="harness-scope-bar__action" onClick={onExport}>
        {t('blueprint:harness.shareExport')}
      </button>
      {conflict ? (
        <div className="harness-scope-bar__conflict" role="alert">
          <strong>{t('blueprint:harness.conflictTitle')}</strong>
          <span>{conflict}</span>
          <button type="button" onClick={() => void onReload()}>
            {t('blueprint:harness.conflictReload')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
