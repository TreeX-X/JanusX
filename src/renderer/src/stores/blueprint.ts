/**
 * @file Blueprint Store — 蓝图数据状态管理
 * @description
 *  V2 工作区投影底座：只在工作区之间切换，不读取 legacy JSON 蓝图。
 *  `blueprints` 为各工作区 checkout 的 note 投影摘要；`blueprintWorkspace`
 *  记录每个投影所属的 checkout 路径，后续 load 经同一路径回源，保证读写
 *  同一工作区。内容变更走对话 + Agent 事务，本 store 不再持有任何直写入口。
 * 仿照 stores/git.ts 的 async + loading/error 风格。
 */

import { create } from 'zustand'
import {
  listBlueprintSummaries,
  loadBlueprint,
  focusNode as focusNodeIPC,
  type Blueprint,
  type BlueprintSummary,
  type BlueprintNode
} from '@/services/blueprint'
import { useWorkspaceStore } from '@/stores/workspace'

const PROJECT_GRAPH_PREFIX = 'harness:project:'

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
  /** 各工作区投影摘要（仅 harness:project:*，无 legacy） */
  blueprints: BlueprintSummary[]
  /** 当前打开的投影（含 nodes 树） */
  currentBlueprint: Blueprint | null
  /** 投影 id -> 所属 checkout 路径；回源加载与 overlay 写回共用 */
  blueprintWorkspace: Record<string, string>
  /** 当前通过“开始工作”激活的节点协作会话 */
  activeSession: ActiveBlueprintSession | null
  loading: boolean
  loadingBlueprintId: string | null
  /** Increments on every completed blueprint load so views can replay entry motion. */
  loadEpoch: number
  loadState: 'idle' | 'listing' | 'loading' | 'refreshing' | 'error'
  error: string | null

  /** 拉取给定 checkout 列表的投影摘要并合并；只保留 project 通道 */
  loadBlueprints: (workspacePaths: string[]) => Promise<void>
  /** 加载指定投影；非 project id 直接拒绝，不发 IPC */
  loadBlueprint: (id: string) => Promise<void>
  /** 查询投影所属 checkout 路径（布局持久化等 overlay 写回共用） */
  workspacePathFor: (blueprintId: string) => string | null
  /** 激活节点协作会话，不创建终端，不注入上下文 */
  focusNode: (input: {
    blueprintId: string
    nodeId: string
    workspaceId: string
    workspaceName: string
    workspacePath: string
  }) => Promise<BlueprintNode | null>
  mergeCanvasLayout: (blueprintId: string, canvasLayout: Blueprint['canvasLayout']) => void
  /** 分析完成后，重新拉取 currentBlueprint 以同步 analyzer 写入的字段 */
  refreshAfterAnalysis: () => Promise<void>
}

export const useBlueprintStore = create<BlueprintStore>((set, get) => {
  let loadRequestId = 0
  let listRequest: Promise<void> | null = null
  let listRequestKey: string | null = null
  const blueprintRequests = new Map<string, Promise<void>>()

  return {
  blueprints: [],
  currentBlueprint: null,
  blueprintWorkspace: {},
  activeSession: null,
  loading: false,
  loadingBlueprintId: null,
  loadEpoch: 0,
  loadState: 'idle',
  error: null,

  loadBlueprints: async (workspacePaths) => {
    const paths = [...new Set(workspacePaths.filter(Boolean))].sort()
    const requestKey = paths.join('\u0000')
    if (listRequest && listRequestKey === requestKey) return listRequest
    set({ loading: true, loadState: 'listing', error: null })
    listRequestKey = requestKey
    listRequest = (async () => {
      try {
        const merged: BlueprintSummary[] = []
        const owners: Record<string, string> = {}
        for (const cwd of paths) {
          const list = await listBlueprintSummaries(cwd).catch(() => null)
          for (const summary of list ?? []) {
            if (!summary.id.startsWith(PROJECT_GRAPH_PREFIX)) continue
            if (merged.some((item) => item.id === summary.id)) continue
            merged.push(summary)
            owners[summary.id] = cwd
          }
        }
        set((s) => ({
          blueprints: merged,
          blueprintWorkspace: { ...s.blueprintWorkspace, ...owners },
          loading: false,
          loadState: 'idle',
        }))
      } catch (err: unknown) {
        set({ error: err instanceof Error ? err.message : String(err), loading: false, loadState: 'error' })
      } finally {
        listRequest = null
        listRequestKey = null
      }
    })()
    return listRequest
  },

  loadBlueprint: async (id) => {
    if (!id.startsWith(PROJECT_GRAPH_PREFIX)) {
      set({ error: '仅支持工作区图谱，旧蓝图数据不再读取', loading: false })
      return
    }
    const existingRequest = blueprintRequests.get(id)
    if (existingRequest) return existingRequest
    const workspaceState = useWorkspaceStore.getState()
    const cwd = get().blueprintWorkspace[id]
      ?? workspaceState.workspaces.find((w) => w.id === workspaceState.activeWorkspaceId)?.path
      ?? null
    if (!cwd) {
      set({ error: '找不到该图谱所属的工作区', loading: false })
      return
    }
    const requestId = ++loadRequestId
    set({ loading: true, loadingBlueprintId: id, loadState: get().currentBlueprint ? 'refreshing' : 'loading', error: null })
    const request = (async () => {
      try {
        const bp = await loadBlueprint(cwd, id)
        if (requestId !== loadRequestId) return
        set((s) => {
          const active = s.activeSession
          const nextNode = active && bp?.id === active.blueprintId ? bp.nodes[active.nodeId] : null
          return {
            currentBlueprint: bp,
            blueprintWorkspace: bp ? { ...s.blueprintWorkspace, [bp.id]: cwd } : s.blueprintWorkspace,
            activeSession: active && nextNode ? { ...active, nodeSnapshot: nextNode } : active,
            loading: false,
            loadingBlueprintId: null,
            loadState: 'idle',
            loadEpoch: s.loadEpoch + 1
          }
        })
      } catch (err: unknown) {
        if (requestId !== loadRequestId) return
        set({ error: err instanceof Error ? err.message : String(err), loading: false, loadingBlueprintId: null, loadState: 'error' })
      } finally {
        blueprintRequests.delete(id)
      }
    })()
    blueprintRequests.set(id, request)
    return request
  },

  workspacePathFor: (blueprintId) => get().blueprintWorkspace[blueprintId] ?? null,

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

  mergeCanvasLayout: (blueprintId, canvasLayout) => {
    set((s) => s.currentBlueprint?.id === blueprintId
      ? { currentBlueprint: { ...s.currentBlueprint, canvasLayout } }
      : s)
  },

  refreshAfterAnalysis: async () => {
    const current = get().currentBlueprint
    if (!current) return
    await get().loadBlueprint(current.id)
  }
  }
})
