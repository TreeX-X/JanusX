/**
 * @file 蓝图视图容器
 * @description
 *  组合「蓝图选择 / 新建」+ 画布。
 *  onMount 用当前 workspace path 拉取蓝图列表；workspace path 取自 workspace store 的活跃工作区。
 *  样式见 ./blueprint.css。
 */

import { useEffect, useState } from 'react'
import './blueprint.css'
import { useBlueprintStore } from '@/stores/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'
import { BlueprintCanvas } from './BlueprintCanvas'

export function BlueprintView() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const workspacePath = activeWorkspace?.path ?? null

  const blueprints = useBlueprintStore((s) => s.blueprints)
  const currentBlueprint = useBlueprintStore((s) => s.currentBlueprint)
  const loading = useBlueprintStore((s) => s.loading)
  const error = useBlueprintStore((s) => s.error)
  const loadBlueprints = useBlueprintStore((s) => s.loadBlueprints)
  const loadBlueprint = useBlueprintStore((s) => s.loadBlueprint)
  const createBlueprint = useBlueprintStore((s) => s.createBlueprint)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 工作区变化时拉取蓝图列表
  useEffect(() => {
    if (!workspacePath) return
    loadBlueprints(workspacePath)
  }, [workspacePath, loadBlueprints])

  // 列表到达后默认选中第一个
  useEffect(() => {
    if (!selectedId && blueprints.length > 0) {
      const first = blueprints[0]
      setSelectedId(first.id)
      loadBlueprint(first.id)
    }
    if (selectedId && !blueprints.some((b) => b.id === selectedId)) {
      setSelectedId(blueprints[0]?.id ?? null)
    }
  }, [blueprints, selectedId, loadBlueprint])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    loadBlueprint(id)
  }

  const handleCreate = async () => {
    const name = window.prompt('蓝图名称：', `蓝图-${new Date().toLocaleDateString()}`)?.trim()
    if (!name) return
    const bp = await createBlueprint({ name, rootTitle: '根目标', rootType: 'epic' })
    if (bp) {
      setSelectedId(bp.id)
      loadBlueprint(bp.id)
    }
  }

  if (!workspacePath) {
    return (
      <div className="blueprint-view">
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 13 }}>
          请先选择一个工作区
        </div>
      </div>
    )
  }

  return (
    <div className="blueprint-view">
      {/* 顶部：选择 / 新建 */}
      <div className="blueprint-toolbar">
        <span className="blueprint-toolbar__title">蓝图</span>
        <select
          value={selectedId ?? ''}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={blueprints.length === 0}
        >
          {blueprints.length === 0 ? (
            <option value="">（暂无蓝图）</option>
          ) : (
            blueprints.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))
          )}
        </select>
        <button className="blueprint-btn blueprint-btn--primary" onClick={handleCreate}>+ 新建蓝图</button>
        <div className="blueprint-toolbar__spacer" />
        {loading ? <span className="blueprint-toolbar__loading">加载中…</span> : null}
        {error ? <span className="blueprint-toolbar__error">{error}</span> : null}
      </div>

      {/* 画布 */}
      {currentBlueprint ? (
        <BlueprintCanvas
          key={currentBlueprint.id}
          blueprintId={currentBlueprint.id}
          workspacePath={workspacePath}
        />
      ) : (
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 13 }}>
          {blueprints.length === 0 ? '点击「+ 新建蓝图」开始' : '请选择一个蓝图'}
        </div>
      )}
    </div>
  )
}
