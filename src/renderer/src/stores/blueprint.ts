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
  updateNode as updateNodeIPC,
  deleteNode as deleteNodeIPC,
  type Blueprint,
  type BlueprintCreateInput,
  type NodeCreateInput
} from '@/services/blueprint'

interface BlueprintStore {
  /** 当前工作区下的蓝图摘要列表 */
  blueprints: Blueprint[]
  /** 当前打开的蓝图（含 nodes 树） */
  currentBlueprint: Blueprint | null
  /** 当前 store 绑定的工作区路径 */
  workspacePath: string | null

  loading: boolean
  error: string | null

  /** 拉取工作区下的蓝图列表（同时刷新 workspacePath） */
  loadBlueprints: (workspacePath: string) => Promise<void>
  /** 加载指定蓝图的完整数据（含 nodes 树） */
  loadBlueprint: (id: string) => Promise<void>
  /** 新建蓝图，成功后追加到列表并设为 currentBlueprint */
  createBlueprint: (input: BlueprintCreateInput) => Promise<Blueprint | null>
  /** 局部更新节点，成功后同步 currentBlueprint.nodes */
  updateNode: (
    blueprintId: string,
    nodeId: string,
    patch: Partial<Blueprint['nodes'][string]>
  ) => Promise<void>
  /** 删除节点，成功后从 currentBlueprint 移除 */
  deleteNode: (blueprintId: string, nodeId: string) => Promise<void>
  /** 分析完成后，重新拉取 currentBlueprint 以同步 analyzer 写入的字段 */
  refreshAfterAnalysis: () => Promise<void>
}

export const useBlueprintStore = create<BlueprintStore>((set, get) => ({
  blueprints: [],
  currentBlueprint: null,
  workspacePath: null,
  loading: false,
  error: null,

  loadBlueprints: async (workspacePath) => {
    set({ loading: true, error: null, workspacePath })
    try {
      const list = await listBlueprints(workspacePath)
      set({ blueprints: list ?? [], loading: false })
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false
      })
    }
  },

  loadBlueprint: async (id) => {
    const cwd = get().workspacePath
    if (!cwd) {
      set({ error: '未设置 workspacePath，无法加载蓝图' })
      return
    }
    set({ loading: true, error: null })
    try {
      const bp = await loadBlueprint(cwd, id)
      set({ currentBlueprint: bp, loading: false })
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false
      })
    }
  },

  createBlueprint: async (input) => {
    const cwd = get().workspacePath
    if (!cwd) {
      set({ error: '未设置 workspacePath，无法创建蓝图' })
      return null
    }
    set({ loading: true, error: null })
    try {
      const bp = await createBlueprintIPC(cwd, input)
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

  updateNode: async (blueprintId, nodeId, patch) => {
    const cwd = get().workspacePath
    const current = get().currentBlueprint
    if (!cwd || !current || current.id !== blueprintId) {
      set({ error: '当前未打开目标蓝图，无法更新节点' })
      return
    }
    set({ loading: true, error: null })
    try {
      const updated = await updateNodeIPC(cwd, blueprintId, nodeId, patch)
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
    const cwd = get().workspacePath
    const current = get().currentBlueprint
    if (!cwd || !current || current.id !== blueprintId) {
      set({ error: '当前未打开目标蓝图，无法删除节点' })
      return
    }
    set({ loading: true, error: null })
    try {
      const ok = await deleteNodeIPC(cwd, blueprintId, nodeId)
      if (ok) {
        set((s) => {
          if (!s.currentBlueprint) return { loading: false }
          const { [nodeId]: _removed, ...restNodes } = s.currentBlueprint.nodes
          return {
            currentBlueprint: {
              ...s.currentBlueprint,
              nodes: restNodes,
              nodeIds: s.currentBlueprint.nodeIds.filter((id) => id !== nodeId)
            },
            loading: false
          }
        })
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

  refreshAfterAnalysis: async () => {
    const current = get().currentBlueprint
    if (!current) return
    await get().loadBlueprint(current.id)
  }
}))
