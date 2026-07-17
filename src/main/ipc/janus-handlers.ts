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
import { knowledgeObservationService } from '../knowledge/observation-service'
import type {
  BlueprintFeatureItem,
  BlueprintNode,
} from '../../shared/janus/types'
import {
  JANUS_COMMAND_CHANNELS,
  type AcceptCandidatePayload,
  type AcceptDiscoveredPayload,
  type AnalysisHistoryPayload,
  type AnalyzerAnalyzePayload,
  type ApplyAnalysisPatchPayload,
  type ApplyAnalysisPayload,
  type BlueprintCreateInput,
  type BlueprintUpdatePatch,
  type FeatureItemInput,
  type ListCandidatesPayload,
  type NodeCreateInput,
  type RejectCandidatePayload,
} from '../../shared/ipc/janus'

export function registerJanusHandlers(mainWindow: BrowserWindow): void {
  analyzer.setMainWindow(mainWindow)

  // ───────────── 蓝图 CRUD（§6.1） ─────────────
  ipcMain.handle(JANUS_COMMAND_CHANNELS.listBlueprints, async (_e, cwd: string) => {
    return blueprintStore.listBlueprints(cwd)
  })

  ipcMain.handle(JANUS_COMMAND_CHANNELS.loadBlueprint, async (_e, cwd: string, id: string) => {
    return blueprintStore.loadBlueprint(cwd, id)
  })

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.createBlueprint,
    async (_e, cwd: string, input: BlueprintCreateInput) => {
      const bp = await blueprintStore.createBlueprint(cwd, input)
      analyzer.registerNodeWorkspace(bp.rootNodeId, cwd)
      return bp
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.updateBlueprint,
    async (_e, cwd: string, id: string, patch: BlueprintUpdatePatch) => {
      return blueprintStore.updateBlueprint(cwd, id, patch)
    }
  )

  ipcMain.handle(JANUS_COMMAND_CHANNELS.deleteBlueprint, async (_e, cwd: string, id: string) => {
    return blueprintStore.deleteBlueprint(cwd, id)
  })

  // ───────────── 节点操作（§6.2） ─────────────
  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.createNode,
    async (
      _e,
      cwd: string,
      blueprintId: string,
      input: NodeCreateInput,
      parentId: string | null
    ) => {
      const node = await blueprintStore.createNode(cwd, blueprintId, input, parentId)
      if (node) analyzer.registerNodeWorkspace(node.id, cwd)
      return node
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.updateNode,
    async (_e, cwd: string, blueprintId: string, nodeId: string, patch: Partial<BlueprintNode>) => {
      return blueprintStore.updateNode(cwd, blueprintId, nodeId, patch)
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.replaceNodeFeatures,
    async (
      _e,
      cwd: string,
      blueprintId: string,
      nodeId: string,
      features: FeatureItemInput[]
    ) => {
      return blueprintStore.patchNodeFeatures(cwd, blueprintId, nodeId, features)
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.addNodeFeature,
    async (
      _e,
      cwd: string,
      blueprintId: string,
      nodeId: string,
      feature: FeatureItemInput
    ) => {
      return blueprintStore.appendNodeFeature(cwd, blueprintId, nodeId, feature)
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.updateNodeFeature,
    async (
      _e,
      cwd: string,
      blueprintId: string,
      nodeId: string,
      featureId: string,
      patch: Partial<BlueprintFeatureItem>
    ) => {
      return blueprintStore.updateNodeFeature(cwd, blueprintId, nodeId, featureId, patch)
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.deleteNodeFeature,
    async (_e, cwd: string, blueprintId: string, nodeId: string, featureId: string) => {
      return blueprintStore.deleteNodeFeature(cwd, blueprintId, nodeId, featureId)
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.deleteNode,
    async (_e, cwd: string, blueprintId: string, nodeId: string) => {
      return blueprintStore.deleteNode(cwd, blueprintId, nodeId)
    }
  )

  // ───────────── 节点协作会话 / 终端绑定（§6.4） ─────────────
  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.focusNode,
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
    JANUS_COMMAND_CHANNELS.bindTerminal,
    async (_e, cwd: string, nodeId: string, terminalId: string) => {
      const node = await blueprintStore.bindTerminal(cwd, nodeId, terminalId)
      if (node) analyzer.registerNodeWorkspace(node.id, cwd)
      return node
    }
  )

  // ───────────── 分析器：手动触发（入口③） ─────────────
  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.analyze,
    async (
      _e,
      payload: AnalyzerAnalyzePayload
    ) => {
      const trigger = payload.trigger ?? 'manual'
      // 手动入口直接 await，IPC 返回分析结果
      const result = await analyzer.analyzeNode(payload.nodeId, {
        workspacePath: payload.workspacePath,
        trigger,
        commitLimit: payload.commitLimit
      })
      if (payload.workspacePath && result) {
        void knowledgeObservationService.capture({
          workspacePath: payload.workspacePath,
          source: 'git-analyzer',
          type: 'analysis-result',
          content: result.result.summary || `Janus analysis for ${payload.nodeId}`,
          summary: `Janus analyzer: ${trigger}`,
          tags: ['janus-analysis', trigger],
          actor: 'janus-analyzer',
          correlationId: result.id,
          metadata: {
            nodeId: payload.nodeId,
            trigger,
            applied: result.applied,
            error: result.error,
            confidence: result.result.confidence,
            progress: result.result.progress,
            status: result.result.status,
          },
        }).catch(() => {})
      }
      return result
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.applyAnalysisPatch,
    async (
      _e,
      payload: ApplyAnalysisPatchPayload
    ) => {
      return blueprintStore.applyAnalysisPatch(payload.workspacePath, payload.blueprintId, payload.nodeId, payload.patch)
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.listAnalyses,
    async (
      _e,
      payload: AnalysisHistoryPayload
    ) => {
      return blueprintStore.listAnalyses(payload.workspacePath, payload.blueprintId, payload.nodeId)
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.applyAnalysis,
    async (
      _e,
      payload: ApplyAnalysisPayload
    ) => {
      return blueprintStore.applyAnalysis(payload.workspacePath, payload.blueprintId, payload.nodeId, payload.analysisId)
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.listRequirementCandidates,
    async (
      _e,
      payload: ListCandidatesPayload
    ) => {
      return blueprintStore.listRequirementCandidates(payload.workspacePath, payload.blueprintId, payload.status)
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.acceptRequirementCandidate,
    async (
      _e,
      payload: AcceptCandidatePayload
    ) => {
      const node = await blueprintStore.acceptRequirementCandidate(
        payload.workspacePath,
        payload.blueprintId,
        payload.candidateId,
        {
          title: payload.title,
          description: payload.description,
          parentId: payload.parentId,
          decisionNote: payload.decisionNote
        }
      )
      if (node) analyzer.registerNodeWorkspace(node.id, payload.workspacePath)
      return node
    }
  )

  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.rejectRequirementCandidate,
    async (
      _e,
      payload: RejectCandidatePayload
    ) => {
      return blueprintStore.rejectRequirementCandidate(
        payload.workspacePath,
        payload.blueprintId,
        payload.candidateId,
        payload.decisionNote
      )
    }
  )

  // ───────────── 分析器：接受新需求提议（§5.5 闭环） ─────────────
  ipcMain.handle(
    JANUS_COMMAND_CHANNELS.acceptDiscovered,
    async (
      _e,
      payload: AcceptDiscoveredPayload
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
