/**
 * @file Janus / Blueprint IPC Handlers
 * @description
 *  - 蓝图 CRUD（§6.1）与节点操作（§6.2）。
 *  - janus:node:focus（§6.4，节点"开始工作"→设焦点 + 调度后台分析）。
 *  - janus:terminal:bind（§6.4，显式进入终端时设焦点 + 绑 terminalId）。
 *  - janus:analyzer:analyze（手动触发，入口③）。
 *  - janus:analyzer:accept-discovered（接受新需求提议 → 在 suggestedParent 下建子节点，§5.5 闭环）。
 *  - 分析完成后主进程发 janus:island:analysis / janus:island:discovered（渲染侧接线为 follow-up）。
 */

import { ipcMain, BrowserWindow } from 'electron'
import { blueprintStore } from '../janus/blueprint-store'
import { analyzer } from '../janus/analyzer'
import type {
  BlueprintFeatureStatus,
  BlueprintNode,
  BlueprintNodeType,
  DiscoveredRequirement
} from '../janus/types'

export function registerJanusHandlers(mainWindow: BrowserWindow): void {
  analyzer.setMainWindow(mainWindow)

  // ───────────── 蓝图 CRUD（§6.1） ─────────────
  ipcMain.handle('blueprint:list', async (_e, cwd: string) => {
    return blueprintStore.listBlueprints(cwd)
  })

  ipcMain.handle('blueprint:load', async (_e, cwd: string, id: string) => {
    return blueprintStore.loadBlueprint(cwd, id)
  })

  ipcMain.handle(
    'blueprint:create',
    async (_e, cwd: string, input: { name: string; description?: string; rootTitle?: string; rootType?: BlueprintNodeType }) => {
      const bp = await blueprintStore.createBlueprint(cwd, input)
      analyzer.registerNodeWorkspace(bp.rootNodeId, cwd)
      return bp
    }
  )

  ipcMain.handle(
    'blueprint:update',
    async (_e, cwd: string, id: string, patch: { name?: string; description?: string; canvasLayout?: Record<string, { x: number; y: number }> }) => {
      return blueprintStore.updateBlueprint(cwd, id, patch)
    }
  )

  ipcMain.handle('blueprint:delete', async (_e, cwd: string, id: string) => {
    return blueprintStore.deleteBlueprint(cwd, id)
  })

  // ───────────── 节点操作（§6.2） ─────────────
  ipcMain.handle(
    'blueprint:node:create',
    async (
      _e,
      cwd: string,
      blueprintId: string,
      input: Partial<BlueprintNode> & { title: string; type: BlueprintNodeType },
      parentId: string | null
    ) => {
      const node = await blueprintStore.createNode(cwd, blueprintId, input, parentId)
      if (node) analyzer.registerNodeWorkspace(node.id, cwd)
      return node
    }
  )

  ipcMain.handle(
    'blueprint:node:update',
    async (_e, cwd: string, blueprintId: string, nodeId: string, patch: Partial<BlueprintNode>) => {
      return blueprintStore.updateNode(cwd, blueprintId, nodeId, patch)
    }
  )

  ipcMain.handle(
    'blueprint:node:features',
    async (
      _e,
      cwd: string,
      blueprintId: string,
      nodeId: string,
      features: Array<{
        title: string
        description?: string
        progress?: number
        status?: BlueprintFeatureStatus
        requirementNotes?: string[]
      }>
    ) => {
      return blueprintStore.patchNodeFeatures(cwd, blueprintId, nodeId, features)
    }
  )

  ipcMain.handle(
    'blueprint:node:feature:add',
    async (
      _e,
      cwd: string,
      blueprintId: string,
      nodeId: string,
      feature: {
        title: string
        description?: string
        progress?: number
        status?: BlueprintFeatureStatus
        requirementNotes?: string[]
      }
    ) => {
      return blueprintStore.appendNodeFeature(cwd, blueprintId, nodeId, feature)
    }
  )

  ipcMain.handle(
    'blueprint:node:feature:update',
    async (
      _e,
      cwd: string,
      blueprintId: string,
      nodeId: string,
      featureId: string,
      patch: {
        title?: string
        description?: string
        progress?: number
        status?: BlueprintFeatureStatus
        requirementNotes?: string[]
      }
    ) => {
      return blueprintStore.updateNodeFeature(cwd, blueprintId, nodeId, featureId, patch)
    }
  )

  ipcMain.handle(
    'blueprint:node:feature:delete',
    async (_e, cwd: string, blueprintId: string, nodeId: string, featureId: string) => {
      return blueprintStore.deleteNodeFeature(cwd, blueprintId, nodeId, featureId)
    }
  )

  ipcMain.handle(
    'blueprint:node:delete',
    async (_e, cwd: string, blueprintId: string, nodeId: string) => {
      return blueprintStore.deleteNode(cwd, blueprintId, nodeId)
    }
  )

  // ───────────── 节点协作会话 / 终端绑定（§6.4） ─────────────
  ipcMain.handle(
    'janus:node:focus',
    async (_e, cwd: string, nodeId: string) => {
      const node = await blueprintStore.focusNode(cwd, nodeId)
      if (node) {
        analyzer.registerNodeWorkspace(node.id, cwd)
        analyzer.scheduleAnalyze(node.id, { workspacePath: cwd, trigger: 'reconcile' })
      }
      return node
    }
  )

  ipcMain.handle(
    'janus:terminal:bind',
    async (_e, cwd: string, nodeId: string, terminalId: string) => {
      const node = await blueprintStore.bindTerminal(cwd, nodeId, terminalId)
      if (node) analyzer.registerNodeWorkspace(node.id, cwd)
      return node
    }
  )

  // ───────────── 分析器：手动触发（入口③） ─────────────
  ipcMain.handle(
    'janus:analyzer:analyze',
    async (
      _e,
      payload: { nodeId: string; workspacePath?: string; trigger?: 'manual' | 'commit-threshold' | 'terminal-close' | 'reconcile' }
    ) => {
      const trigger = payload.trigger ?? 'manual'
      // 手动入口直接 await，IPC 返回分析结果
      return analyzer.analyzeNode(payload.nodeId, {
        workspacePath: payload.workspacePath,
        trigger
      })
    }
  )

  ipcMain.handle(
    'janus:analyzer:apply-patch',
    async (
      _e,
      payload: {
        workspacePath: string
        blueprintId: string
        nodeId: string
        patch: {
          progress?: number
          status?: BlueprintNode['status']
          featureUpdates?: Array<{
            featureId: string
            progress?: number
            status?: BlueprintFeatureStatus
            description?: string
            requirementNotes?: string[]
          }>
          newFeatureRequirements?: Array<{ title: string; description: string }>
        }
      }
    ) => {
      return blueprintStore.applyAnalysisPatch(payload.workspacePath, payload.blueprintId, payload.nodeId, payload.patch)
    }
  )

  // ───────────── 分析器：接受新需求提议（§5.5 闭环） ─────────────
  ipcMain.handle(
    'janus:analyzer:accept-discovered',
    async (
      _e,
      payload: {
        workspacePath: string
        blueprintId: string
        discovered: DiscoveredRequirement
        parentId?: string // 显式指定父节点；缺省按 suggestedParent 标题匹配，再回退到分析所属节点
        fallbackNodeId?: string
      }
    ) => {
      const { workspacePath, blueprintId, discovered, parentId, fallbackNodeId } = payload
      const bp = await blueprintStore.loadBlueprint(workspacePath, blueprintId)
      if (!bp) return null

      // 解析父节点：显式 > 标题匹配 > fallbackNodeId > 根节点
      let resolvedParentId = parentId ?? null
      if (!resolvedParentId && discovered.suggestedParent) {
        const match = Object.values(bp.nodes).find(
          (n) => n.title.trim().toLowerCase() === discovered.suggestedParent.trim().toLowerCase()
        )
        if (match) resolvedParentId = match.id
      }
      if (!resolvedParentId && fallbackNodeId && bp.nodes[fallbackNodeId]) {
        resolvedParentId = fallbackNodeId
      }
      if (!resolvedParentId) resolvedParentId = bp.rootNodeId

      const node = await blueprintStore.createNode(
        workspacePath,
        blueprintId,
        {
          title: discovered.title,
          type: 'task',
          description: discovered.description,
          status: 'not-started',
          progress: 0,
          tags: ['discovered-by-janus']
        },
        resolvedParentId
      )
      if (node) analyzer.registerNodeWorkspace(node.id, workspacePath)
      return node
    }
  )
}
