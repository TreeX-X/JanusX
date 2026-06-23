/**
 * @file Blueprint 存储层
 * @description 工作区蓝图的持久化（design §2.6）。
 *              存储目录沿用项目既有 `.janusX/` 约定：
 *                {workspace}/.janusX/blueprints/{blueprintId}.json
 *                {workspace}/.janusX/blueprints/index.json   { blueprints: string[], focusedNodeId: string|null }
 *
 *              焦点（归属机制 B）：每个 workspace 同时最多一个焦点节点，
 *              cursor 为 `focusedNodeId`，commit 归焦点节点。
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  Blueprint,
  BlueprintNode,
  BlueprintNodeType,
  BlueprintAnalysis,
  AnalysisResult
} from './types'

const BLUEPRINTS_DIR = ['blueprints'] // 相对 .janusX
const INDEX_FILE = 'index.json'

interface WorkspaceIndex {
  blueprints: string[]
  focusedNodeId: string | null
}

function dotDir(workspace: string): string {
  return join(workspace, '.janusX')
}

function blueprintsDir(workspace: string): string {
  return join(dotDir(workspace), ...BLUEPRINTS_DIR)
}

function indexFile(workspace: string): string {
  return join(blueprintsDir(workspace), INDEX_FILE)
}

function blueprintFile(workspace: string, id: string): string {
  return join(blueprintsDir(workspace), `${id}.json`)
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeNode(input: Partial<BlueprintNode> & { title: string; type: BlueprintNodeType }): BlueprintNode {
  const ts = nowIso()
  return {
    id: input.id ?? randomUUID(),
    title: input.title,
    type: input.type,
    status: input.status ?? 'not-started',
    progress: input.progress ?? 0,
    statusSource: input.statusSource ?? 'manual',
    positioning: input.positioning ?? '',
    description: input.description ?? '',
    completedItems: input.completedItems ?? [],
    techSolution: input.techSolution ?? '',
    notes: input.notes ?? '',
    todos: input.todos ?? [],
    issues: input.issues ?? [],
    activities: input.activities ?? [],
    analyses: input.analyses ?? [],
    boundTerminalId: input.boundTerminalId ?? null,
    terminalHistory: input.terminalHistory ?? [],
    lastAnalyzedCommitSha: input.lastAnalyzedCommitSha ?? null,
    children: input.children ?? [],
    parentId: input.parentId ?? null,
    tags: input.tags ?? [],
    createdAt: input.createdAt ?? ts,
    updatedAt: ts
  }
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await ensureDir(join(file, '..'))
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8')
}

class BlueprintStore {
  /** workspacePath -> (blueprintId -> Blueprint) 内存缓存（lazy 加载） */
  private cache = new Map<string, Map<string, Blueprint>>()
  private indexCache = new Map<string, WorkspaceIndex>()

  private getWorkspaceMap(workspace: string): Map<string, Blueprint> {
    let m = this.cache.get(workspace)
    if (!m) {
      m = new Map()
      this.cache.set(workspace, m)
    }
    return m
  }

  async loadIndex(workspace: string): Promise<WorkspaceIndex> {
    const cached = this.indexCache.get(workspace)
    if (cached) return cached
    const idx = (await readJson<WorkspaceIndex>(indexFile(workspace))) ?? {
      blueprints: [],
      focusedNodeId: null
    }
    this.indexCache.set(workspace, idx)
    return idx
  }

  private async saveIndex(workspace: string): Promise<void> {
    const idx = await this.loadIndex(workspace)
    await writeJson(indexFile(workspace), idx)
  }

  async listBlueprints(workspace: string): Promise<Blueprint[]> {
    const idx = await this.loadIndex(workspace)
    const map = this.getWorkspaceMap(workspace)
    const out: Blueprint[] = []
    for (const id of idx.blueprints) {
      const bp = map.get(id) ?? (await this.readBlueprintFile(workspace, id))
      if (bp) {
        map.set(id, bp)
        out.push(bp)
      }
    }
    return out
  }

  private async readBlueprintFile(workspace: string, id: string): Promise<Blueprint | null> {
    const bp = await readJson<Blueprint>(blueprintFile(workspace, id))
    if (bp) {
      // 容错：老节点补齐新增字段
      for (const nid of Object.keys(bp.nodes)) {
        const n = bp.nodes[nid]
        if (n.lastAnalyzedCommitSha === undefined) n.lastAnalyzedCommitSha = null
        if (n.statusSource === undefined) n.statusSource = 'manual'
        if (!Array.isArray(n.activities)) n.activities = []
        if (!Array.isArray(n.analyses)) n.analyses = []
      }
    }
    return bp
  }

  async loadBlueprint(workspace: string, id: string): Promise<Blueprint | null> {
    const map = this.getWorkspaceMap(workspace)
    const cached = map.get(id)
    if (cached) return cached
    const bp = await this.readBlueprintFile(workspace, id)
    if (bp) map.set(id, bp)
    return bp
  }

  async createBlueprint(
    workspace: string,
    input: { name: string; description?: string; rootTitle?: string; rootType?: BlueprintNodeType }
  ): Promise<Blueprint> {
    const id = randomUUID()
    const ts = nowIso()
    const root = makeNode({
      title: input.rootTitle ?? input.name,
      type: input.rootType ?? 'epic'
    })
    const bp: Blueprint = {
      id,
      name: input.name,
      description: input.description ?? '',
      rootNodeId: root.id,
      nodeIds: [root.id],
      nodes: { [root.id]: root },
      mountedTo: null,
      canvasLayout: {},
      createdAt: ts,
      updatedAt: ts
    }
    const map = this.getWorkspaceMap(workspace)
    map.set(id, bp)
    const idx = await this.loadIndex(workspace)
    idx.blueprints.push(id)
    await this.saveIndex(workspace)
    await writeJson(blueprintFile(workspace, id), bp)
    return bp
  }

  async updateBlueprint(
    workspace: string,
    id: string,
    patch: Partial<Pick<Blueprint, 'name' | 'description' | 'canvasLayout'>>
  ): Promise<Blueprint | null> {
    const bp = await this.loadBlueprint(workspace, id)
    if (!bp) return null
    if (patch.name !== undefined) bp.name = patch.name
    if (patch.description !== undefined) bp.description = patch.description
    if (patch.canvasLayout !== undefined) bp.canvasLayout = patch.canvasLayout
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(workspace, id), bp)
    return bp
  }

  async deleteBlueprint(workspace: string, id: string): Promise<boolean> {
    const map = this.getWorkspaceMap(workspace)
    const existed = map.has(id)
    map.delete(id)
    const idx = await this.loadIndex(workspace)
    idx.blueprints = idx.blueprints.filter((b) => b !== id)
    if (idx.focusedNodeId) {
      const stillExists = await this.nodeExistsInIndex(workspace, idx.focusedNodeId)
      if (!stillExists) idx.focusedNodeId = null
    }
    await this.saveIndex(workspace)
    try {
      await fs.unlink(blueprintFile(workspace, id))
    } catch {
      /* 文件可能不存在 */
    }
    return existed
  }

  private async nodeExistsInIndex(workspace: string, nodeId: string): Promise<boolean> {
    const idx = await this.loadIndex(workspace)
    for (const bid of idx.blueprints) {
      const bp = await this.loadBlueprint(workspace, bid)
      if (bp && bp.nodes[nodeId]) return true
    }
    return false
  }

  async createNode(
    workspace: string,
    blueprintId: string,
    input: Partial<BlueprintNode> & { title: string; type: BlueprintNodeType },
    parentId: string | null = null
  ): Promise<BlueprintNode | null> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp) return null
    const node = makeNode({ ...input, parentId })
    bp.nodes[node.id] = node
    bp.nodeIds.push(node.id)
    if (parentId && bp.nodes[parentId]) {
      bp.nodes[parentId].children.push(node.id)
      bp.nodes[parentId].updatedAt = nowIso()
    }
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(workspace, blueprintId), bp)
    return node
  }

  async updateNode(
    workspace: string,
    blueprintId: string,
    nodeId: string,
    patch: Partial<BlueprintNode>
  ): Promise<BlueprintNode | null> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[nodeId]) return null
    const node = bp.nodes[nodeId]
    // 不允许通过通用 patch 覆盖只读字段
    const { id: _id, createdAt: _c, ...safe } = patch
    Object.assign(node, safe)
    node.updatedAt = nowIso()
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(workspace, blueprintId), bp)
    return node
  }

  async deleteNode(workspace: string, blueprintId: string, nodeId: string): Promise<boolean> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[nodeId]) return false
    if (nodeId === bp.rootNodeId) return false // 根节点不允许删除
    const node = bp.nodes[nodeId]
    // 重新挂载子节点到父节点
    const parent = node.parentId ? bp.nodes[node.parentId] : null
    for (const childId of node.children) {
      const child = bp.nodes[childId]
      if (child) {
        child.parentId = node.parentId
        if (parent) parent.children.push(childId)
      }
    }
    if (parent) {
      parent.children = parent.children.filter((c) => c !== nodeId)
    }
    delete bp.nodes[nodeId]
    bp.nodeIds = bp.nodeIds.filter((n) => n !== nodeId)
    bp.updatedAt = nowIso()
    const idx = await this.loadIndex(workspace)
    if (idx.focusedNodeId === nodeId) {
      idx.focusedNodeId = null
      await this.saveIndex(workspace)
    }
    await writeJson(blueprintFile(workspace, blueprintId), bp)
    return true
  }

  /** 追加分析记录并按成功与否回写状态字段 */
  async appendAnalysis(
    workspace: string,
    blueprintId: string,
    nodeId: string,
    analysis: BlueprintAnalysis
  ): Promise<BlueprintNode | null> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[nodeId]) return null
    const node = bp.nodes[nodeId]
    node.analyses.push(analysis)
    node.activities.push({
      id: randomUUID(),
      type: 'analysis',
      content: analysis.result?.summary ?? analysis.error ?? '分析完成',
      metadata: { analysisId: analysis.id, applied: analysis.applied },
      createdAt: analysis.createdAt
    })
    if (analysis.applied && analysis.result) {
      const r: AnalysisResult = analysis.result
      node.progress = r.progress
      node.status = r.status
      node.statusSource = 'janus'
    }
    node.updatedAt = nowIso()
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(workspace, blueprintId), bp)
    return node
  }

  /** 更新分析游标 */
  async setCursor(
    workspace: string,
    blueprintId: string,
    nodeId: string,
    sha: string | null
  ): Promise<void> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[nodeId]) return
    bp.nodes[nodeId].lastAnalyzedCommitSha = sha
    bp.nodes[nodeId].updatedAt = nowIso()
    await writeJson(blueprintFile(workspace, blueprintId), bp)
  }

  /** 焦点节点（归属机制 B） */
  async getFocusedNodeId(workspace: string): Promise<string | null> {
    const idx = await this.loadIndex(workspace)
    return idx.focusedNodeId
  }

  async setFocusedNodeId(workspace: string, nodeId: string | null): Promise<void> {
    const idx = await this.loadIndex(workspace)
    idx.focusedNodeId = nodeId
    await this.saveIndex(workspace)
  }

  async bindTerminal(
    workspace: string,
    nodeId: string,
    terminalId: string
  ): Promise<BlueprintNode | null> {
    const found = await this.findNode(workspace, nodeId)
    if (!found) return null
    const { blueprintId } = found
    const node = await this.updateNode(workspace, blueprintId, nodeId, {
      boundTerminalId: terminalId
    })
    if (node) {
      node.terminalHistory = [...node.terminalHistory, terminalId]
      await this.updateNode(workspace, blueprintId, nodeId, { terminalHistory: node.terminalHistory })
    }
    await this.setFocusedNodeId(workspace, nodeId)
    return node
  }

  /** 在某 workspace 的所有蓝图里查找节点 */
  async findNode(
    workspace: string,
    nodeId: string
  ): Promise<{ blueprintId: string; node: BlueprintNode } | null> {
    const idx = await this.loadIndex(workspace)
    for (const bid of idx.blueprints) {
      const bp = await this.loadBlueprint(workspace, bid)
      if (bp && bp.nodes[nodeId]) {
        return { blueprintId: bid, node: bp.nodes[nodeId] }
      }
    }
    return null
  }

  /** 取某 workspace 当前焦点节点（含所属 blueprint） */
  async findFocusedNode(
    workspace: string
  ): Promise<{ blueprintId: string; node: BlueprintNode } | null> {
    const fid = await this.getFocusedNodeId(workspace)
    if (!fid) return null
    return this.findNode(workspace, fid)
  }

  /** 依据 terminalId 反查绑定节点（终端关闭最终分析用） */
  async findNodeByTerminal(
    workspace: string,
    terminalId: string
  ): Promise<{ blueprintId: string; node: BlueprintNode } | null> {
    const idx = await this.loadIndex(workspace)
    for (const bid of idx.blueprints) {
      const bp = await this.loadBlueprint(workspace, bid)
      if (!bp) continue
      for (const n of Object.values(bp.nodes)) {
        if (n.boundTerminalId === terminalId) {
          return { blueprintId: bid, node: n }
        }
      }
    }
    return null
  }
}

export const blueprintStore = new BlueprintStore()
