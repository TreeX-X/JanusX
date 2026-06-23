/**
 * @file Blueprint Store — 蓝图数据状态管理
 * @description
 *  P1 渲染层蓝图数据底座。仅持有数据，不含任何画布 / 视图逻辑（画布是 P2）。
 *  actions 直接委托 services/blueprint.ts 的 IPC 封装；store 不直接碰 window.electron。
 * 仿照 stores/git.ts 的 async + loading/error 风格。
 */

import { create } from 'zustand'
import {
  listBlueprints,
  loadBlueprint,
  createBlueprint as createBlueprintIPC,
  deleteBlueprint as deleteBlueprintIPC,
  updateNode as updateNodeIPC,
  deleteNode as deleteNodeIPC,
  type Blueprint,
  type BlueprintCreateInput,
  type NodeCreateInput
} from '@/services/blueprint'

const GLOBAL_BLUEPRINT_SCOPE = '__global__'

interface BlueprintStore {
  /** 应用级全局蓝图摘要列表 */
  blueprints: Blueprint[]
  /** 当前打开的蓝图（含 nodes 树） */
  currentBlueprint: Blueprint | null
  loading: boolean
  error: string | null

  /** 拉取应用级全局蓝图列表；参数仅为兼容旧调用 */
  loadBlueprints: (workspacePath?: string) => Promise<void>
  /** 加载指定蓝图的完整数据（含 nodes 树） */
  loadBlueprint: (id: string) => Promise<void>
  /** 新建蓝图，成功后追加到列表并设为 currentBlueprint */
  createBlueprint: (input: BlueprintCreateInput) => Promise<Blueprint | null>
  /** 删除蓝图，成功后从列表和当前视图移除 */
  deleteBlueprint: (id: string) => Promise<boolean>
  /** 局部更新节点，成功后同步 currentBlueprint.nodes */
  updateNode: (
    blueprintId: string,
    nodeId: string,
    patch: Partial<Blueprint['nodes'][string]>
  ) => Promise<void>
  /** 删除节点，成功后重新拉取 currentBlueprint */
  deleteNode: (blueprintId: string, nodeId: string) => Promise<boolean>
  /** 分析完成后，重新拉取 currentBlueprint 以同步 analyzer 写入的字段 */
  refreshAfterAnalysis: () => Promise<void>
}

export const useBlueprintStore = create<BlueprintStore>((set, get) => ({
  blueprints: [],
  currentBlueprint: null,
  loading: false,
  error: null,

  loadBlueprints: async (workspacePath) => {
    set({ loading: true, error: null })
    try {
      const list = await listBlueprints(workspacePath ?? GLOBAL_BLUEPRINT_SCOPE)
      set({ blueprints: list ?? [], loading: false })
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false
      })
    }
  },

  loadBlueprint: async (id) => {
    set({ loading: true, error: null })
    try {
      const bp = await loadBlueprint(GLOBAL_BLUEPRINT_SCOPE, id)
      set({ currentBlueprint: bp, loading: false })
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false
      })
    }
  },

  createBlueprint: async (input) => {
    set({ loading: true, error: null })
    try {
      const bp = await createBlueprintIPC(GLOBAL_BLUEPRINT_SCOPE, input)
      set((s) => ({
        blueprints: [...s.blueprints, bp],
        currentBlueprint: bp,
        loading: false
      }))
      return bp
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false
      })
      return null
    }
  },

  deleteBlueprint: async (id) => {
    set({ loading: true, error: null })
    try {
      const ok = await deleteBlueprintIPC(GLOBAL_BLUEPRINT_SCOPE, id)
      if (!ok) {
        set({ loading: false })
        return false
      }
      set((s) => {
        const next = s.blueprints.filter((bp) => bp.id !== id)
        return {
          blueprints: next,
          currentBlueprint: s.currentBlueprint?.id === id ? next[0] ?? null : s.currentBlueprint,
          loading: false
        }
      })
      return true
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false
      })
      return false
    }
  },

  updateNode: async (blueprintId, nodeId, patch) => {
    const current = get().currentBlueprint
    if (!current || current.id !== blueprintId) {
      set({ error: '当前未打开目标蓝图，无法更新节点' })
      return
    }
    set({ loading: true, error: null })
    try {
      const updated = await updateNodeIPC(GLOBAL_BLUEPRINT_SCOPE, blueprintId, nodeId, patch)
      if (updated) {
        set((s) => ({
          currentBlueprint: s.currentBlueprint
            ? {
                ...s.currentBlueprint,
                nodes: { ...s.currentBlueprint.nodes, [nodeId]: updated }
              }
            : null,
          loading: false
        }))
      } else {
        set({ loading: false })
      }
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false
      })
    }
  },

  deleteNode: async (blueprintId, nodeId) => {
    const current = get().currentBlueprint
    if (!current || current.id !== blueprintId) {
      set({ error: '当前未打开目标蓝图，无法删除节点' })
      return false
    }
    set({ loading: true, error: null })
    try {
      const ok = await deleteNodeIPC(GLOBAL_BLUEPRINT_SCOPE, blueprintId, nodeId)
      if (ok) {
        await get().loadBlueprint(blueprintId)
        return true
      } else {
        set({ error: '无法删除最后一个节点，请直接删除蓝图', loading: false })
        return false
      }
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false
      })
      return false
    }
  },

  refreshAfterAnalysis: async () => {
    const current = get().currentBlueprint
    if (!current) return
    await get().loadBlueprint(current.id)
  }
}))
