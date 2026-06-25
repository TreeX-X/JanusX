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
  focusNode as focusNodeIPC,
  type Blueprint,
  type BlueprintCreateInput,
  type BlueprintNode,
  type NodeCreateInput
} from '@/services/blueprint'

const GLOBAL_BLUEPRINT_SCOPE = '__global__'

export interface ActiveBlueprintSession {
  blueprintId: string
  nodeId: string
  workspaceId: string
  workspaceName: string
  workspacePath: string
  startedAt: string
  nodeSnapshot: BlueprintNode
}

interface BlueprintStore {
  /** 应用级全局蓝图摘要列表 */
  blueprints: Blueprint[]
  /** 当前打开的蓝图（含 nodes 树） */
  currentBlueprint: Blueprint | null
  /** 当前通过“开始工作”激活的节点协作会话 */
  activeSession: ActiveBlueprintSession | null
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
  /** 激活节点协作会话，不创建终端，不注入上下文 */
  focusNode: (input: {
    blueprintId: string
    nodeId: string
    workspaceId: string
    workspaceName: string
    workspacePath: string
  }) => Promise<BlueprintNode | null>
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
  activeSession: null,
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
      set((s) => {
        const active = s.activeSession
        const nextNode = active && bp?.id === active.blueprintId ? bp.nodes[active.nodeId] : null
        return {
          currentBlueprint: bp,
          activeSession: active && nextNode ? { ...active, nodeSnapshot: nextNode } : active,
          loading: false
        }
      })
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
          activeSession: s.activeSession?.blueprintId === id ? null : s.activeSession,
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

  focusNode: async (input) => {
    set({ error: null })
    try {
      const node = await focusNodeIPC({
        workspacePath: input.workspacePath,
        nodeId: input.nodeId
      })
      if (!node) {
        set({ error: '无法激活节点协作会话' })
        return null
      }
      set((s) => ({
        currentBlueprint: s.currentBlueprint?.id === input.blueprintId
          ? {
              ...s.currentBlueprint,
              nodes: { ...s.currentBlueprint.nodes, [input.nodeId]: node }
            }
          : s.currentBlueprint,
        activeSession: {
          blueprintId: input.blueprintId,
          nodeId: input.nodeId,
          workspaceId: input.workspaceId,
          workspaceName: input.workspaceName,
          workspacePath: input.workspacePath,
          startedAt: new Date().toISOString(),
          nodeSnapshot: node
        }
      }))
      return node
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
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
          activeSession:
            s.activeSession?.blueprintId === blueprintId && s.activeSession.nodeId === nodeId
              ? { ...s.activeSession, nodeSnapshot: updated }
              : s.activeSession,
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
        set((s) => ({
          activeSession:
            s.activeSession?.blueprintId === blueprintId && s.activeSession.nodeId === nodeId
              ? null
              : s.activeSession
        }))
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
