/**
 * @file 蓝图视图容器
 * @description
 *  V2 工作区投影视图：切换器只在工作区之间切换（每个工作区一张 note 投影），
 *  不读取 legacy JSON 蓝图。内容变更走对话 + Agent 事务，本视图无编辑入口。
 *  样式见 ./blueprint.css。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import './blueprint.css'
import { useI18n } from '@/i18n/useI18n'
import { useBlueprintStore } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import { BlueprintCanvas } from './BlueprintCanvas'
import { Select } from '../ui/Select'
import { useBlueprintSelectPortal } from './blueprintSelectPortal'
import { useBlueprintMaintenanceStore } from '@/stores/blueprint-maintenance'
import { useNoteRefresh } from './useNoteRefresh'

interface BlueprintViewProps {
  density?: 'embedded' | 'workbench'
  onDetailOpenChange?: (open: boolean) => void
  onRegisterFlush?: (flush: () => Promise<boolean>) => void
}

export function BlueprintView({ density = 'embedded', onDetailOpenChange, onRegisterFlush }: BlueprintViewProps) {
  const { t } = useI18n('blueprint')
  const flushRef = useRef<(() => Promise<boolean>) | null>(null)
  const registerFlush = useCallback((flush: () => Promise<boolean>) => {
    flushRef.current = flush
    onRegisterFlush?.(flush)
  }, [onRegisterFlush])
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const blueprints = useBlueprintStore((s) => s.blueprints)
  const blueprintWorkspace = useBlueprintStore((s) => s.blueprintWorkspace)
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const loading = useBlueprintStore((s) => s.loading)
  const error = useBlueprintStore((s) => s.error)
  const loadBlueprints = useBlueprintStore((s) => s.loadBlueprints)
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint)
  const maintenanceOpenRequest = useBlueprintMaintenanceStore((s) => s.openRequest)
  useNoteRefresh(currentBlueprint?.source === 'harness' ? currentBlueprint.id : undefined, currentBlueprint ? blueprintWorkspace[currentBlueprint.id] : undefined)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 工作台模式下由 BlueprintWorkbench 注入承载层；embedded 模式下为 null，
  // Select 回退到 document.body，行为与引入 Context 之前一致。
  const selectPortal = useBlueprintSelectPortal()
  const getSelectPortalContainer = selectPortal ? () => selectPortal : undefined

  // 拉取全部工作区的投影摘要：一切换即一工作区，无 legacy。
  const workspacePathsKey = workspaces.map((w) => w.path).filter(Boolean).join('\u0000')
  useEffect(() => {
    const paths = workspaces.map((w) => w.path).filter(Boolean)
    if (paths.length) void loadBlueprints(paths)
  }, [workspacePathsKey, loadBlueprints]) // eslint-disable-line react-hooks/exhaustive-deps

  // 默认打开活动工作区的投影，回退到第一个
  useEffect(() => {
    const preferred = blueprints.find((b) => blueprintWorkspace[b.id] === activeWorkspace?.path)
      ?? blueprints[0]
    if (!selectedId && preferred) {
      setSelectedId(preferred.id)
      void loadBlueprint(preferred.id)
    }
    if (selectedId && !blueprints.some((b) => b.id === selectedId)) {
      const next = blueprints.find((b) => blueprintWorkspace[b.id] === activeWorkspace?.path)
        ?? blueprints[0]
      setSelectedId(next?.id ?? null)
      if (next) void loadBlueprint(next.id)
    }
  }, [blueprints, blueprintWorkspace, activeWorkspace?.path, selectedId, loadBlueprint])

  useEffect(() => {
    if (!maintenanceOpenRequest || maintenanceOpenRequest.blueprintId === selectedId) return
    if (!blueprints.some((blueprint) => blueprint.id === maintenanceOpenRequest.blueprintId)) return
    setSelectedId(maintenanceOpenRequest.blueprintId)
    void loadBlueprint(maintenanceOpenRequest.blueprintId)
  }, [blueprints, loadBlueprint, maintenanceOpenRequest, selectedId])

  // 工作台顶栏已承载蓝图切换器（高保真 bp-switch）：workbench 密度下工具栏不再重复
  // 切换器，仅保留 scope 徽 + 只读锁；选中态跟随 store 的 currentBlueprint。
  useEffect(() => {
    if (density !== 'workbench') return
    if (currentBlueprint && selectedId !== currentBlueprint.id) setSelectedId(currentBlueprint.id)
  }, [density, currentBlueprint, selectedId])

  const handleSelect = async (id: string) => {
    await flushRef.current?.()
    setSelectedId(id)
    await loadBlueprint(id)
  }

  const isBlueprintEmpty = !currentBlueprint || currentBlueprint.nodeIds.length === 0

  return (
    <div className={`blueprint-view blueprint-view--${density}${isBlueprintEmpty ? ' blueprint-view--empty' : ''}`}>
      {/* 顶部工具栏（embedded 保留；workbench 已收敛到 shell 统一栏，此处不再渲染） */}
      {density === 'workbench' ? null : (
      <div className="blueprint-toolbar">
        <div className="blueprint-toolbar__group blueprint-toolbar__group--manager">
          <Select
            value={selectedId ?? ''}
            onChange={(id) => { void handleSelect(id) }}
            disabled={blueprints.length === 0}
            placeholder={t('blueprint:view.noBlueprints')}
            options={
              blueprints.length === 0
                ? [{ value: '', label: t('blueprint:view.noBlueprints') }]
                : blueprints.map((b) => ({ value: b.id, label: b.name }))
            }
            className="blueprint-select blueprint-select--toolbar"
            getPortalContainer={getSelectPortalContainer}
          />
          {currentBlueprint ? (
            <span className="blueprint-toolbar__hint" title={t('blueprint:view.scopeBadge', { name: currentBlueprint.name, rev: currentBlueprint.contentRevision, count: currentBlueprint.nodeIds.length, adapter: currentBlueprint.adapterVersion ?? 'v1' })}>
              {t('blueprint:view.scopeBadge', { name: currentBlueprint.name, rev: currentBlueprint.contentRevision, count: currentBlueprint.nodeIds.length, adapter: currentBlueprint.adapterVersion ?? 'v1' })}
            </span>
          ) : null}
          <span className="blueprint-toolbar__hint" title={t('blueprint:view.readOnlyBadge')}>
            {t('blueprint:view.readOnlyBadge')}
          </span>
        </div>
        <div className="blueprint-toolbar__spacer" />
        {loading ? <span className="blueprint-toolbar__loading">{t('blueprint:toolbar.loading')}</span> : null}
        {error ? <span className="blueprint-toolbar__error">{error}</span> : null}
      </div>
      )}

      {/* 画布 */}
      {density === 'workbench' && error ? <div className="blueprint-toolbar__error" role="alert">{error}</div> : null}
      {currentBlueprint ? (
        <BlueprintCanvas
          key={currentBlueprint.id}
          blueprintId={currentBlueprint.id}
          onDetailOpenChange={onDetailOpenChange}
          onRegisterFlush={registerFlush}
        />
      ) : (
        <div className="blueprint-view__loading-state" aria-live="polite">
          {loading ? t('blueprint:toolbar.loading') : t('blueprint:view.emptySelectHint')}
        </div>
      )}
    </div>
  )
}
