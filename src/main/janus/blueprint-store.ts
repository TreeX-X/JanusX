/**
 * @file Blueprint 存储层
 * @description 应用级全局蓝图持久化（design §2.6）。
 *              存储目录：
 *                {userData}/janusx/blueprints/{blueprintId}.json
 *                {userData}/janusx/blueprints/index.json
 *
 *              焦点（归属机制 B）：每个 workspace 同时最多一个焦点节点，
 *              cursor 为 `focusedNodeId`，commit 归焦点节点。
 */

import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import type {
  Blueprint,
  BlueprintFeatureItem,
  BlueprintFeatureStatus,
  BlueprintNode,
  BlueprintNodeType,
  BlueprintAnalysis,
  BlueprintRequirementCandidate,
  BlueprintRequirementCandidateStatus,
  AnalysisResult,
  DiscoveredRequirement,
  WorkspaceSnapshot
} from './types'

const BLUEPRINTS_DIR = ['blueprints'] // 相对 .janusX
const WORKSPACES_DIR = ['workspaces'] // 相对 userData/janusx
const INDEX_FILE = 'index.json'
const GLOBAL_BLUEPRINT_SCOPE = '__global__'

interface WorkspaceIndex {
  blueprints: string[]
  focusedNodeId: string | null
  focusedNodeByWorkspace?: Record<string, string | null>
}

interface WorkspaceRecord {
  id: string
  name: string
  path: string
}

function blueprintsDir(): string {
  return join(app.getPath('userData'), 'janusx', ...BLUEPRINTS_DIR)
}

function indexFile(): string {
  return join(blueprintsDir(), INDEX_FILE)
}

function blueprintFile(id: string): string {
  return join(blueprintsDir(), `${id}.json`)
}

function workspacesDir(): string {
  return join(app.getPath('userData'), 'janusx', ...WORKSPACES_DIR)
}

function legacyIndexFile(workspace: string): string {
  return join(workspace, '.janusX', ...BLUEPRINTS_DIR, INDEX_FILE)
}

function legacyBlueprintFile(workspace: string, id: string): string {
  return join(workspace, '.janusX', ...BLUEPRINTS_DIR, `${id}.json`)
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizePathKey(path: string): string {
  try {
    const out = resolve(path)
    return process.platform === 'win32' ? out.toLowerCase() : out
  } catch {
    return process.platform === 'win32' ? path.toLowerCase() : path
  }
}

function toWorkspaceSnapshot(workspace: WorkspaceRecord): WorkspaceSnapshot {
  return {
    name: workspace.name,
    path: workspace.path
  }
}

function makeFeatureItem(input: Partial<BlueprintFeatureItem> & { title: string }): BlueprintFeatureItem {
  const ts = nowIso()
  return {
    id: input.id ?? randomUUID(),
    title: input.title,
    description: input.description ?? '',
    progress: input.progress ?? 0,
    status: input.status ?? 'planned',
    requirementNotes: input.requirementNotes ?? [],
    createdAt: input.createdAt ?? ts,
    updatedAt: input.updatedAt ?? ts
  }
}

function normalizeFeatureStatus(status?: BlueprintFeatureStatus): BlueprintFeatureStatus {
  return status ?? 'planned'
}

function normalizeCandidatePart(value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function candidateKey(sourceNodeId: string, title: string, description: string, suggestedParentTitle?: string): string {
  return [
    sourceNodeId,
    normalizeCandidatePart(title),
    normalizeCandidatePart(description),
    normalizeCandidatePart(suggestedParentTitle)
  ].join('|')
}

function resolveSuggestedParentId(bp: Blueprint, suggestedParentTitle?: string): string | undefined {
  const normalized = normalizeCandidatePart(suggestedParentTitle)
  if (!normalized) return undefined
  const parent = Object.values(bp.nodes).find((node) => normalizeCandidatePart(node.title) === normalized)
  return parent?.id
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
    features: Array.isArray(input.features) ? input.features.map((feature) => makeFeatureItem(feature)) : [],
    completedItems: input.completedItems ?? [],
    techSolution: input.techSolution ?? '',
    notes: input.notes ?? '',
    todos: input.todos ?? [],
    issues: input.issues ?? [],
    activities: input.activities ?? [],
    analyses: input.analyses ?? [],
    workspaceId: input.workspaceId ?? null,
    workspaceSnapshot: input.workspaceSnapshot ?? null,
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
  private cache = new Map<string, Blueprint>()
  private indexCache: WorkspaceIndex | null = null
  private migratedWorkspaces = new Set<string>()

  async loadIndex(_workspace?: string): Promise<WorkspaceIndex> {
    if (this.indexCache) return this.indexCache
    const idx = (await readJson<WorkspaceIndex>(indexFile())) ?? {
      blueprints: [],
      focusedNodeId: null,
      focusedNodeByWorkspace: {}
    }
    if (!idx.focusedNodeByWorkspace) idx.focusedNodeByWorkspace = {}
    this.indexCache = idx
    return idx
  }

  private async saveIndex(_workspace?: string): Promise<void> {
    const idx = await this.loadIndex()
    await writeJson(indexFile(), idx)
  }

  private async listWorkspaceRecords(): Promise<WorkspaceRecord[]> {
    try {
      const files = await fs.readdir(workspacesDir())
      const records: WorkspaceRecord[] = []
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const record = await readJson<WorkspaceRecord>(join(workspacesDir(), file))
        if (record?.id && record.name && record.path) records.push(record)
      }
      return records
    } catch {
      return []
    }
  }

  private async findWorkspaceRecord(workspaceIdOrPath: string | null | undefined): Promise<WorkspaceRecord | null> {
    if (!workspaceIdOrPath || workspaceIdOrPath === GLOBAL_BLUEPRINT_SCOPE) return null
    const records = await this.listWorkspaceRecords()
    const byId = records.find((record) => record.id === workspaceIdOrPath)
    if (byId) return byId

    const targetPath = normalizePathKey(workspaceIdOrPath)
    return records.find((record) => normalizePathKey(record.path) === targetPath) ?? null
  }

  private async resolveWorkspaceKey(workspaceIdOrPath: string): Promise<string> {
    const record = await this.findWorkspaceRecord(workspaceIdOrPath)
    return record?.id ?? workspaceIdOrPath
  }

  private async hydrateWorkspaceSnapshot(node: BlueprintNode): Promise<boolean> {
    let changed = false
    if (node.workspaceSnapshot === undefined) {
      node.workspaceSnapshot = null
      changed = true
    }
    if (!node.workspaceId) return changed

    const record = await this.findWorkspaceRecord(node.workspaceId)
    if (!record) return changed

    const nextSnapshot = toWorkspaceSnapshot(record)
    if (node.workspaceSnapshot?.name !== nextSnapshot.name || node.workspaceSnapshot?.path !== nextSnapshot.path) {
      node.workspaceSnapshot = nextSnapshot
      changed = true
    }
    return changed
  }

  private async migrateLegacyWorkspace(workspace: string): Promise<void> {
    if (!workspace || workspace === GLOBAL_BLUEPRINT_SCOPE || this.migratedWorkspaces.has(workspace)) return
    this.migratedWorkspaces.add(workspace)
    const legacy = await readJson<WorkspaceIndex>(legacyIndexFile(workspace))
    if (!legacy?.blueprints?.length) return

    const idx = await this.loadIndex()
    let changed = false
    for (const id of legacy.blueprints) {
      if (idx.blueprints.includes(id)) continue
      const bp = await readJson<Blueprint>(legacyBlueprintFile(workspace, id))
      if (!bp) continue
      if (!Array.isArray(bp.requirementCandidates)) bp.requirementCandidates = []
      for (const nid of Object.keys(bp.nodes)) {
        const n = bp.nodes[nid]
        if (n.lastAnalyzedCommitSha === undefined) n.lastAnalyzedCommitSha = null
        if (n.statusSource === undefined) n.statusSource = 'manual'
        if (n.workspaceId === undefined) n.workspaceId = null
        if (n.workspaceSnapshot === undefined) n.workspaceSnapshot = null
        if (!Array.isArray(n.activities)) n.activities = []
        if (!Array.isArray(n.analyses)) n.analyses = []
        if (!Array.isArray(n.features)) n.features = []
        n.features = n.features.map((feature) => makeFeatureItem(feature))
        await this.hydrateWorkspaceSnapshot(n)
      }
      idx.blueprints.push(id)
      this.cache.set(id, bp)
      await writeJson(blueprintFile(id), bp)
      changed = true
    }
    if (changed) await this.saveIndex()
  }

  async listBlueprints(workspace: string): Promise<Blueprint[]> {
    await this.migrateLegacyWorkspace(workspace)
    const idx = await this.loadIndex(workspace)
    const out: Blueprint[] = []
    for (const id of idx.blueprints) {
      const bp = this.cache.get(id) ?? (await this.readBlueprintFile(workspace, id))
      if (bp) {
        this.cache.set(id, bp)
        out.push(bp)
      }
    }
    return out
  }

  private async readBlueprintFile(workspace: string, id: string): Promise<Blueprint | null> {
    const bp = await readJson<Blueprint>(blueprintFile(id))
    if (bp) {
      let changed = false
      if (!Array.isArray(bp.requirementCandidates)) {
        bp.requirementCandidates = []
        changed = true
      }
      // 容错：老节点补齐新增字段
      for (const nid of Object.keys(bp.nodes)) {
        const n = bp.nodes[nid]
        if (n.lastAnalyzedCommitSha === undefined) {
          n.lastAnalyzedCommitSha = null
          changed = true
        }
        if (n.statusSource === undefined) {
          n.statusSource = 'manual'
          changed = true
        }
        if (n.workspaceId === undefined) {
          n.workspaceId = null
          changed = true
        }
        if (n.workspaceSnapshot === undefined) {
          n.workspaceSnapshot = null
          changed = true
        }
        if (!Array.isArray(n.activities)) {
          n.activities = []
          changed = true
        }
        if (!Array.isArray(n.analyses)) {
          n.analyses = []
          changed = true
        }
        if (!Array.isArray(n.features)) {
          n.features = []
          changed = true
        }
        n.features = n.features.map((feature) => makeFeatureItem(feature))
        changed = (await this.hydrateWorkspaceSnapshot(n)) || changed
      }
      if (changed) await writeJson(blueprintFile(id), bp)
    }
    return bp
  }

  async loadBlueprint(workspace: string, id: string): Promise<Blueprint | null> {
    const cached = this.cache.get(id)
    if (cached) return cached
    const bp = await this.readBlueprintFile(workspace, id)
    if (bp) this.cache.set(id, bp)
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
      requirementCandidates: [],
      mountedTo: null,
      canvasLayout: {},
      createdAt: ts,
      updatedAt: ts
    }
    this.cache.set(id, bp)
    const idx = await this.loadIndex(workspace)
    idx.blueprints.push(id)
    await this.saveIndex(workspace)
    await writeJson(blueprintFile(id), bp)
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
    await writeJson(blueprintFile(id), bp)
    return bp
  }

  async deleteBlueprint(workspace: string, id: string): Promise<boolean> {
    const existed = this.cache.has(id) || (await readJson<Blueprint>(blueprintFile(id))) !== null
    this.cache.delete(id)
    const idx = await this.loadIndex(workspace)
    idx.blueprints = idx.blueprints.filter((b) => b !== id)
    if (idx.focusedNodeId) {
      const stillExists = await this.nodeExistsInIndex(workspace, idx.focusedNodeId)
      if (!stillExists) idx.focusedNodeId = null
    }
    for (const [ws, nodeId] of Object.entries(idx.focusedNodeByWorkspace ?? {})) {
      if (!nodeId) continue
      const stillExists = await this.nodeExistsInIndex(workspace, nodeId)
      if (!stillExists) idx.focusedNodeByWorkspace![ws] = null
    }
    await this.saveIndex(workspace)
    try {
      await fs.unlink(blueprintFile(id))
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
    await this.hydrateWorkspaceSnapshot(node)
    bp.nodes[node.id] = node
    bp.nodeIds.push(node.id)
    if (parentId && bp.nodes[parentId]) {
      bp.nodes[parentId].children.push(node.id)
      bp.nodes[parentId].updatedAt = nowIso()
    }
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(blueprintId), bp)
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
    if (safe.workspaceId !== undefined) {
      if (!safe.workspaceId) {
        safe.workspaceId = null
        safe.workspaceSnapshot = null
      } else if (safe.workspaceSnapshot === undefined) {
        const record = await this.findWorkspaceRecord(safe.workspaceId)
        safe.workspaceSnapshot = record ? toWorkspaceSnapshot(record) : node.workspaceSnapshot ?? null
      }
    }
    if (safe.parentId !== undefined && safe.parentId !== node.parentId) {
      const nextParentId = safe.parentId
      if (nodeId === bp.rootNodeId && nextParentId) return null
      if (nextParentId === nodeId) return null
      if (nextParentId && !bp.nodes[nextParentId]) return null
      const isDescendant = (candidateId: string, ancestorId: string): boolean => {
        let cursor = bp.nodes[candidateId]?.parentId ?? null
        while (cursor) {
          if (cursor === ancestorId) return true
          cursor = bp.nodes[cursor]?.parentId ?? null
        }
        return false
      }
      if (nextParentId && isDescendant(nextParentId, nodeId)) return null
      const oldParent = node.parentId ? bp.nodes[node.parentId] : null
      if (oldParent) {
        oldParent.children = oldParent.children.filter((id) => id !== nodeId)
        oldParent.updatedAt = nowIso()
      }
      const nextParent = nextParentId ? bp.nodes[nextParentId] : null
      if (nextParent && !nextParent.children.includes(nodeId)) {
        nextParent.children.push(nodeId)
        nextParent.updatedAt = nowIso()
      }
    }
    Object.assign(node, safe)
    node.updatedAt = nowIso()
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(blueprintId), bp)
    return node
  }

  async patchNodeFeatures(
    workspace: string,
    blueprintId: string,
    nodeId: string,
    features: Array<Partial<BlueprintFeatureItem> & { title: string }>
  ): Promise<BlueprintNode | null> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[nodeId]) return null
    const node = bp.nodes[nodeId]
    node.features = features.map((feature) => makeFeatureItem(feature))
    node.updatedAt = nowIso()
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(blueprintId), bp)
    return node
  }

  async appendNodeFeature(
    workspace: string,
    blueprintId: string,
    nodeId: string,
    feature: Partial<BlueprintFeatureItem> & { title: string }
  ): Promise<BlueprintNode | null> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[nodeId]) return null
    const node = bp.nodes[nodeId]
    node.features = [...(node.features ?? []), makeFeatureItem(feature)]
    node.updatedAt = nowIso()
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(blueprintId), bp)
    return node
  }

  async updateNodeFeature(
    workspace: string,
    blueprintId: string,
    nodeId: string,
    featureId: string,
    patch: Partial<BlueprintFeatureItem>
  ): Promise<BlueprintNode | null> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[nodeId]) return null
    const node = bp.nodes[nodeId]
    const feature = (node.features ?? []).find((item) => item.id === featureId)
    if (!feature) return null
    if (patch.title !== undefined) feature.title = patch.title
    if (patch.description !== undefined) feature.description = patch.description
    if (patch.progress !== undefined) feature.progress = Math.max(0, Math.min(100, patch.progress))
    if (patch.status !== undefined) feature.status = normalizeFeatureStatus(patch.status)
    if (patch.requirementNotes !== undefined) feature.requirementNotes = [...patch.requirementNotes]
    feature.updatedAt = nowIso()
    node.updatedAt = nowIso()
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(blueprintId), bp)
    return node
  }

  async deleteNodeFeature(
    workspace: string,
    blueprintId: string,
    nodeId: string,
    featureId: string
  ): Promise<BlueprintNode | null> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[nodeId]) return null
    const node = bp.nodes[nodeId]
    node.features = (node.features ?? []).filter((item) => item.id !== featureId)
    node.updatedAt = nowIso()
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(blueprintId), bp)
    return node
  }

  async deleteNode(workspace: string, blueprintId: string, nodeId: string): Promise<boolean> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[nodeId]) return false
    if (bp.nodeIds.length <= 1) return false
    const node = bp.nodes[nodeId]
    // 重新挂载子节点到父节点
    const parent = node.parentId ? bp.nodes[node.parentId] : null
    for (const childId of node.children) {
      const child = bp.nodes[childId]
      if (child) {
        child.parentId = node.parentId
        if (parent && !parent.children.includes(childId)) parent.children.push(childId)
      }
    }
    if (parent) {
      parent.children = parent.children.filter((c) => c !== nodeId)
    }
    delete bp.nodes[nodeId]
    bp.nodeIds = bp.nodeIds.filter((n) => n !== nodeId)
    delete bp.canvasLayout[nodeId]
    if (bp.rootNodeId === nodeId) {
      const promoted =
        node.children.find((childId) => bp.nodes[childId]) ??
        bp.nodeIds.find((id) => bp.nodes[id]?.parentId === null) ??
        bp.nodeIds[0]
      if (!promoted) return false
      bp.rootNodeId = promoted
      bp.nodes[promoted].parentId = null
    }
    bp.updatedAt = nowIso()
    const idx = await this.loadIndex(workspace)
    if (idx.focusedNodeId === nodeId) {
      idx.focusedNodeId = null
    }
    for (const [ws, focused] of Object.entries(idx.focusedNodeByWorkspace ?? {})) {
      if (focused === nodeId) idx.focusedNodeByWorkspace![ws] = null
    }
    await this.saveIndex(workspace)
    await writeJson(blueprintFile(blueprintId), bp)
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
      for (const update of r.featureUpdates ?? []) {
        const feature = (node.features ?? []).find((item) => item.id === update.featureId)
        if (!feature) continue
        if (update.progress !== undefined) feature.progress = Math.max(0, Math.min(100, update.progress))
        if (update.status !== undefined) feature.status = normalizeFeatureStatus(update.status)
        if (update.description !== undefined) feature.description = update.description
        if (update.requirementNotes !== undefined) feature.requirementNotes = [...update.requirementNotes]
        feature.updatedAt = nowIso()
      }
    }
    node.updatedAt = nowIso()
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(blueprintId), bp)
    return node
  }

  async applyAnalysisPatch(
    workspace: string,
    blueprintId: string,
    nodeId: string,
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
    }
  ): Promise<BlueprintNode | null> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[nodeId]) return null
    const node = bp.nodes[nodeId]
    if (patch.progress !== undefined) {
      node.progress = Math.max(0, Math.min(100, patch.progress))
      node.statusSource = 'janus'
    }
    if (patch.status !== undefined) {
      node.status = patch.status
      node.statusSource = 'janus'
    }
    for (const update of patch.featureUpdates ?? []) {
      const feature = (node.features ?? []).find((item) => item.id === update.featureId)
      if (!feature) continue
      if (update.progress !== undefined) feature.progress = Math.max(0, Math.min(100, update.progress))
      if (update.status !== undefined) feature.status = normalizeFeatureStatus(update.status)
      if (update.description !== undefined) feature.description = update.description
      if (update.requirementNotes !== undefined) feature.requirementNotes = [...update.requirementNotes]
      feature.updatedAt = nowIso()
    }
    node.updatedAt = nowIso()
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(blueprintId), bp)
    return node
  }

  async upsertRequirementCandidates(
    workspace: string,
    blueprintId: string,
    sourceNodeId: string,
    sourceAnalysisId: string,
    requirements: DiscoveredRequirement[],
    evidence: string[] = []
  ): Promise<BlueprintRequirementCandidate[]> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[sourceNodeId]) return []

    bp.requirementCandidates ??= []
    const touched: BlueprintRequirementCandidate[] = []
    let changed = false
    const now = nowIso()

    for (const requirement of requirements) {
      const title = requirement.title.trim()
      if (!title) continue

      const description = requirement.description?.trim() ?? ''
      const suggestedParentTitle = requirement.suggestedParent?.trim() || undefined
      const key = candidateKey(sourceNodeId, title, description, suggestedParentTitle)
      const existing = bp.requirementCandidates.find((candidate) =>
        candidateKey(candidate.sourceNodeId, candidate.title, candidate.description, candidate.suggestedParentTitle) === key
      )

      if (existing) {
        if (existing.status !== 'pending') continue
        existing.sourceAnalysisId = sourceAnalysisId
        existing.confidence = Math.max(existing.confidence, requirement.confidence)
        existing.suggestedParentId = existing.suggestedParentId ?? resolveSuggestedParentId(bp, suggestedParentTitle)
        existing.suggestedParentTitle = existing.suggestedParentTitle ?? suggestedParentTitle
        existing.evidence = Array.from(new Set([...(existing.evidence ?? []), ...evidence]))
        touched.push(existing)
        changed = true
        continue
      }

      const candidate: BlueprintRequirementCandidate = {
        id: randomUUID(),
        blueprintId,
        sourceNodeId,
        sourceAnalysisId,
        title,
        description,
        suggestedParentId: resolveSuggestedParentId(bp, suggestedParentTitle),
        suggestedParentTitle,
        confidence: requirement.confidence,
        status: 'pending',
        evidence: [...evidence],
        createdAt: now
      }
      bp.requirementCandidates.push(candidate)
      touched.push(candidate)
      changed = true
    }

    if (changed) {
      bp.updatedAt = nowIso()
      await writeJson(blueprintFile(blueprintId), bp)
    }

    return touched
  }

  async listRequirementCandidates(
    workspace: string,
    blueprintId: string,
    status?: BlueprintRequirementCandidateStatus
  ): Promise<BlueprintRequirementCandidate[]> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp) return []
    const candidates = bp.requirementCandidates ?? []
    return candidates
      .filter((candidate) => !status || candidate.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async acceptRequirementCandidate(
    workspace: string,
    blueprintId: string,
    candidateId: string,
    patch: {
      title?: string
      description?: string
      parentId?: string
      decisionNote?: string
    } = {}
  ): Promise<BlueprintNode | null> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp) return null
    bp.requirementCandidates ??= []

    const candidate = bp.requirementCandidates.find((item) => item.id === candidateId)
    if (!candidate) return null
    if (candidate.status === 'accepted' && candidate.acceptedNodeId) {
      return bp.nodes[candidate.acceptedNodeId] ?? null
    }

    const title = patch.title?.trim() || candidate.title
    const description = patch.description !== undefined ? patch.description : candidate.description
    let parentId = patch.parentId ?? candidate.suggestedParentId ?? null
    if (!parentId || !bp.nodes[parentId]) parentId = candidate.sourceNodeId
    if (!bp.nodes[parentId]) parentId = bp.rootNodeId

    const sourceNode = bp.nodes[candidate.sourceNodeId]
    const node = makeNode({
      title,
      type: 'task',
      description,
      status: 'not-started',
      progress: 0,
      tags: ['discovered-by-janus'],
      parentId,
      workspaceId: sourceNode?.workspaceId ?? null,
      workspaceSnapshot: sourceNode?.workspaceSnapshot ?? null
    })
    await this.hydrateWorkspaceSnapshot(node)

    bp.nodes[node.id] = node
    bp.nodeIds.push(node.id)
    bp.nodes[parentId].children.push(node.id)
    bp.nodes[parentId].updatedAt = nowIso()

    candidate.title = title
    candidate.description = description
    candidate.suggestedParentId = parentId
    candidate.suggestedParentTitle = bp.nodes[parentId].title
    candidate.status = 'accepted'
    candidate.acceptedNodeId = node.id
    candidate.decisionNote = patch.decisionNote
    candidate.decidedAt = nowIso()

    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(blueprintId), bp)
    return node
  }

  async rejectRequirementCandidate(
    workspace: string,
    blueprintId: string,
    candidateId: string,
    decisionNote?: string
  ): Promise<BlueprintRequirementCandidate | null> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp) return null
    bp.requirementCandidates ??= []

    const candidate = bp.requirementCandidates.find((item) => item.id === candidateId)
    if (!candidate) return null

    candidate.status = 'rejected'
    candidate.decisionNote = decisionNote
    candidate.decidedAt = nowIso()
    bp.updatedAt = nowIso()
    await writeJson(blueprintFile(blueprintId), bp)
    return candidate
  }

  async listAnalyses(
    workspace: string,
    blueprintId: string,
    nodeId: string
  ): Promise<BlueprintAnalysis[]> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[nodeId]) return []
    return [...(bp.nodes[nodeId].analyses ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async applyAnalysis(
    workspace: string,
    blueprintId: string,
    nodeId: string,
    analysisId: string
  ): Promise<BlueprintNode | null> {
    const bp = await this.loadBlueprint(workspace, blueprintId)
    if (!bp || !bp.nodes[nodeId]) return null
    const node = bp.nodes[nodeId]
    const analysis = (node.analyses ?? []).find((item) => item.id === analysisId)
    if (!analysis?.applied || !analysis.result) return null

    const updated = await this.applyAnalysisPatch(workspace, blueprintId, nodeId, {
      progress: analysis.result.progress,
      status: analysis.result.status,
      featureUpdates: analysis.result.featureUpdates
    })
    if (!updated) return null

    const latest = await this.loadBlueprint(workspace, blueprintId)
    const latestNode = latest?.nodes[nodeId]
    if (!latest || !latestNode) return updated
    latestNode.activities.push({
      id: randomUUID(),
      type: 'analysis',
      content: `重新应用分析：${analysis.result.summary || analysis.id}`,
      metadata: { analysisId: analysis.id, reapplied: true },
      createdAt: nowIso()
    })
    latestNode.updatedAt = nowIso()
    latest.updatedAt = nowIso()
    await writeJson(blueprintFile(blueprintId), latest)
    return latestNode
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
    await writeJson(blueprintFile(blueprintId), bp)
  }

  /** 焦点节点（归属机制 B） */
  async getFocusedNodeId(workspace: string): Promise<string | null> {
    const idx = await this.loadIndex(workspace)
    const key = await this.resolveWorkspaceKey(workspace)
    const focused = idx.focusedNodeByWorkspace?.[key] ?? idx.focusedNodeByWorkspace?.[workspace] ?? idx.focusedNodeId
    if (focused && key !== workspace && idx.focusedNodeByWorkspace?.[workspace] === focused && idx.focusedNodeByWorkspace[key] !== focused) {
      idx.focusedNodeByWorkspace[key] = focused
      delete idx.focusedNodeByWorkspace[workspace]
      await this.saveIndex(workspace)
    }
    return focused ?? null
  }

  async setFocusedNodeId(workspace: string, nodeId: string | null): Promise<void> {
    const idx = await this.loadIndex(workspace)
    idx.focusedNodeByWorkspace ??= {}
    const key = await this.resolveWorkspaceKey(workspace)
    idx.focusedNodeByWorkspace[key] = nodeId
    if (key !== workspace) delete idx.focusedNodeByWorkspace[workspace]
    await this.saveIndex(workspace)
  }

  async focusNode(workspace: string, nodeId: string): Promise<BlueprintNode | null> {
    const found = await this.findNode(workspace, nodeId)
    if (!found) return null
    await this.setFocusedNodeId(found.node.workspaceId ?? workspace, nodeId)
    return found.node
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
    await this.setFocusedNodeId(node?.workspaceId ?? workspace, nodeId)
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
