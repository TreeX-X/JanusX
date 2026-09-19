import { useEffect, useRef, useState } from 'react'
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
  const previewShareImport = useHarnessStore((s) => s.previewShareImport)
  const applyShareImport = useHarnessStore((s) => s.applyShareImport)
  const clearShareImport = useHarnessStore((s) => s.clearShareImport)
  const importSnapshot = useHarnessStore((s) => s.shareImportSnapshot)
  const importPreview = useHarnessStore((s) => s.shareImportPreview)
  const importReport = useHarnessStore((s) => s.shareImportReport)
  const storeError = useHarnessStore((s) => s.error)
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)

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

  const onPickImport = (): void => {
    setFileError(null)
    if (fileRef.current) fileRef.current.value = ''
    fileRef.current?.click()
  }

  const onImportFile = async (file: File | undefined): Promise<void> => {
    if (!cwd || !file) return
    setFileError(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch (err: unknown) {
      setFileError(t('blueprint:harness.shareImportBadFile', { message: err instanceof Error ? err.message : String(err) }))
      return
    }
    await previewShareImport(cwd, parsed)
  }

  const onCancelImport = (): void => {
    setFileError(null)
    if (fileRef.current) fileRef.current.value = ''
    clearShareImport()
  }

  const onApplyImport = async (): Promise<void> => {
    if (!cwd || !importSnapshot) return
    const report = await applyShareImport(cwd, importSnapshot)
    if (report && report.notes.some((note) => note.action === 'applied') && blueprintId) {
      await loadBlueprint(blueprintId)
    }
  }

  const importActive = importSnapshot !== null || importPreview !== null || importReport !== null
  const importError = fileError ?? (importActive ? storeError : null)
  const countBy = (action: string): number => importPreview?.notes.filter((note) => note.action === action).length ?? 0

  return (
    <div className="harness-scope-bar" data-testid="harness-scope-bar">
      <span className="harness-scope-bar__repo" title={scope.root ?? ''}>
        {t('blueprint:harness.scopeLabel')} · {scope.repoName ?? ''} · {bindings.length}
      </span>
      <button type="button" className="harness-scope-bar__action" onClick={onExport}>
        {t('blueprint:harness.shareExport')}
      </button>
      <button type="button" className="harness-scope-bar__action" onClick={onPickImport}>
        {t('blueprint:harness.shareImport')}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => void onImportFile(event.target.files?.[0])}
      />
      {importPreview && !importReport ? (
        <div className="harness-scope-bar__conflict" role="status">
          <span>
            {t('blueprint:harness.shareImportSummary', {
              created: countBy('create'),
              updated: countBy('replace'),
              identical: countBy('identical'),
              invalid: countBy('invalid'),
              receipts: importPreview.receipts.length,
            })}
          </span>
          <button type="button" onClick={() => void onApplyImport()}>
            {t('blueprint:harness.shareImportApply')}
          </button>
          <button type="button" onClick={onCancelImport}>
            {t('common:action.cancel')}
          </button>
        </div>
      ) : null}
      {importReport ? (
        <div className="harness-scope-bar__conflict" role="status">
          <span>
            {t('blueprint:harness.shareImportDone', {
              applied: importReport.notes.filter((note) => note.action === 'applied').length,
              identical: importReport.notes.filter((note) => note.action === 'identical').length,
              invalid: importReport.notes.filter((note) => note.action === 'invalid').length,
              receipts: importReport.receipts.filter((receipt) => receipt.action === 'applied' || receipt.action === 'kept').length,
            })}
          </span>
          <button type="button" onClick={onCancelImport}>
            {t('common:action.cancel')}
          </button>
        </div>
      ) : null}
      {importError ? (
        <div className="harness-scope-bar__conflict" role="alert">
          <span>{importError}</span>
          <button type="button" onClick={onCancelImport}>
            {t('common:action.cancel')}
          </button>
        </div>
      ) : null}
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
