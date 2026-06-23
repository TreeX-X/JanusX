/**
 * @file 蓝图视图容器
 * @description
 *  组合「蓝图选择 / 新建」+ 画布。
 *  onMount 拉取应用级全局蓝图列表；节点再单独绑定工作区。
 *  样式见 ./blueprint.css。
 */

import { useEffect, useState } from 'react'
import './blueprint.css'
import { useBlueprintStore } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import { BlueprintCanvas } from './BlueprintCanvas'
import { PromptDialog } from './PromptDialog'
import { Select } from '../ui/Select'

export function BlueprintView() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const blueprints = useBlueprintStore((s) => s.blueprints)
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const loading = useBlueprintStore((s) => s.loading)
  const error = useBlueprintStore((s) => s.error)
  const loadBlueprints = useBlueprintStore((s) => s.loadBlueprints)
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint)
  const createBlueprint = useBlueprintStore((s) => s.createBlueprint)
  const deleteBlueprint = useBlueprintStore((s) => s.deleteBlueprint)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // 拉取全局蓝图列表
  useEffect(() => {
    loadBlueprints(activeWorkspace?.path)
  }, [activeWorkspace?.path, loadBlueprints])

  // 列表到达后默认选中第一个
  useEffect(() => {
    if (!selectedId && blueprints.length > 0) {
      const first = blueprints[0]
      setSelectedId(first.id)
      loadBlueprint(first.id)
    }
    if (selectedId && !blueprints.some((b) => b.id === selectedId)) {
      const next = blueprints[0]
      setSelectedId(next?.id ?? null)
      if (next) loadBlueprint(next.id)
    }
  }, [blueprints, selectedId, loadBlueprint])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    loadBlueprint(id)
  }

  const handleCreate = () => setCreateDialogOpen(true)

  const handleCreateConfirm = async (name: string) => {
    setCreateDialogOpen(false)
    const bp = await createBlueprint({ name, rootTitle: '根任务', rootType: 'epic' })
    if (bp) {
      setSelectedId(bp.id)
      loadBlueprint(bp.id)
    }
  }

  const handleDelete = async () => {
    if (!selectedId) return
    const target = blueprints.find((b) => b.id === selectedId)
    const ok = window.confirm(`确认删除蓝图「${target?.name ?? selectedId}」？此操作不可恢复。`)
    if (!ok) return
    const deleted = await deleteBlueprint(selectedId)
    if (!deleted) return
    const next = useBlueprintStore.getState().blueprints[0]
    setSelectedId(next?.id ?? null)
    if (next) loadBlueprint(next.id)
  }

  return (
    <div className="blueprint-view">
      {/* 顶部：选择 / 新建 */}
      <div className="blueprint-toolbar">
        <span className="blueprint-toolbar__title">蓝图</span>
        <Select
          value={selectedId ?? ''}
          onChange={handleSelect}
          disabled={blueprints.length === 0}
          placeholder="（暂无蓝图）"
          options={
            blueprints.length === 0
              ? [{ value: '', label: '（暂无蓝图）' }]
              : blueprints.map((b) => ({ value: b.id, label: b.name }))
          }
          className="blueprint-select blueprint-select--toolbar"
        />
        <button className="blueprint-btn blueprint-btn--primary" onClick={handleCreate}>+ 新建蓝图</button>
        <button className="blueprint-btn blueprint-btn--danger" onClick={handleDelete} disabled={!selectedId}>
          删除蓝图
        </button>
        <div className="blueprint-toolbar__spacer" />
        {loading ? <span className="blueprint-toolbar__loading">加载中…</span> : null}
        {error ? <span className="blueprint-toolbar__error">{error}</span> : null}
      </div>

      {/* 画布 */}
      {currentBlueprint ? (
        <BlueprintCanvas
          key={currentBlueprint.id}
          blueprintId={currentBlueprint.id}
        />
      ) : (
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 13 }}>
          {blueprints.length === 0 ? '点击「+ 新建蓝图」开始' : '请选择一个蓝图'}
        </div>
      )}

      <PromptDialog
        open={createDialogOpen}
        title="新建蓝图"
        label="蓝图名称"
        placeholder="输入蓝图名称"
        defaultValue={`蓝图-${new Date().toLocaleDateString()}`}
        onConfirm={handleCreateConfirm}
        onCancel={() => setCreateDialogOpen(false)}
      />
    </div>
  )
}
