import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Blueprint } from '../../src/shared/janus/types'
import type {
  BlueprintChangeSet,
  BlueprintMaintenanceTask,
  BlueprintOperation,
} from '../../src/shared/janus/maintenance-types'

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  streamText: vi.fn(),
  getDefaultModel: vi.fn(),
  getLanguageModel: vi.fn(),
  loadBlueprint: vi.fn(),
  applyMaintenanceOperations: vi.fn(),
  workspacesDir: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  cancelSession: vi.fn(),
  resolveRoot: vi.fn(),
  projectView: vi.fn(),
  readNote: vi.fn(),
  applyBundleChangeSet: vi.fn(),
  collectEvidence: vi.fn(),
}))

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
vi.mock('../../src/main/llm/ai-runtime', () => ({
  generateObject: mocks.generateObject,
  streamText: mocks.streamText,
}))
vi.mock('../../src/main/agent/runtime/shell-runtime', () => ({
  workspaceAgentRuntime: {
    registry: { list: () => [] },
    createSession: mocks.createSession,
    getSession: mocks.getSession,
    cancelSession: mocks.cancelSession,
    executeFunctionCall: vi.fn(),
  },
}))
vi.mock('../../src/main/llm/LlmService', () => ({
  llmService: {
    getDefaultModel: mocks.getDefaultModel,
    getLanguageModel: mocks.getLanguageModel,
  },
}))
vi.mock('../../src/main/janus/blueprint-store', () => ({
  blueprintStore: {
    loadBlueprint: mocks.loadBlueprint,
    applyMaintenanceOperations: mocks.applyMaintenanceOperations,
  },
  isProjectGraphId: (id: string) => id.startsWith('harness:project:'),
}))
vi.mock('../../src/main/janus/blueprint-paths', () => ({ workspacesDir: mocks.workspacesDir }))
vi.mock('../../src/main/harness/service', () => ({
  harnessNoteService: {
    resolveRoot: mocks.resolveRoot,
    projectView: mocks.projectView,
    readNote: mocks.readNote,
    applyBundleChangeSet: mocks.applyBundleChangeSet,
  },
}))
vi.mock('@janus-agent/agent-core', () => ({
  AgentSteeringPort: class {
    size = 0
    push(): void {}
    remove(): boolean { return false }
  },
  createJanusRuntimeReadOnlyToolsForResources: () => ({}),
  createVercelModelTools: () => ({}),
  createVercelStream: () => ({}),
  runJanusAgentLoop: vi.fn(),
  toAgentStreamEvent: () => undefined,
  createToolManifests: () => [],
  createToolPreview: () => ({}),
  createWorkspaceChatTools: () => ({}),
  janusWorkspaceFs: { collectTextEvidence: mocks.collectEvidence },
}))

import { blueprintMaintenanceService } from '../../src/main/janus/maintenance/service'
import { ChatSessionRuntime } from '@janus-agent/chat-core'

const PROJECT_ID = 'harness:project:8fa19f17'
const REPO = '8fa19f17-c717-43a8-93a7-810a5e0cbc91'
const REQ = '11111111-1111-4111-8111-111111111111'
const OTHER = '99999999-9999-4999-8999-999999999999'
let currentRev = 7

const REQUIREMENT_MD = [
  '---',
  'schema: harness-note/1',
  `id: ${REQ}`,
  'kind: requirement',
  'lifecycle: accepted',
  'created: 2026-09-17',
  '---',
  '',
  '# Requirement one',
  '',
  '## Problem',
  '',
  'The widget fails.',
  '',
  '## Expected behavior',
  '',
  'It works.',
  '',
  '## Scope',
  '',
  'Widget only.',
  '',
  '## Acceptance criteria',
  '',
  '- [ ] AC-1: widget works',
  '',
].join('\n')

function projectBlueprint(): Blueprint {
  return {
    schemaVersion: 2,
    contentRevision: currentRev,
    id: PROJECT_ID,
    name: 'Project',
    source: 'harness',
    description: '',
    rootNodeId: REQ,
    nodeIds: [REQ],
    nodes: {
      [REQ]: {
        id: REQ, title: 'Requirement one', type: 'feature', status: 'in-progress', progress: 0,
        statusSource: 'manual', positioning: '', description: 'The widget fails.', features: [], completedItems: [],
        techSolution: '', notes: '', todos: [], issues: [], activities: [], analyses: [], workspaceId: null,
        workspaceSnapshot: null, boundTerminalId: null, terminalHistory: [], lastAnalyzedCommitSha: null,
        children: [], parentId: null, tags: [], createdAt: '', updatedAt: '',
      },
    },
    relations: [],
    requirementCandidates: [],
    mountedTo: null,
    canvasLayout: {},
    createdAt: '',
    updatedAt: '',
  } as Blueprint
}

function updateOp(operationId: string, nodeId: string, title: string, extraAfter: Record<string, unknown> = {}): BlueprintOperation {
  return {
    operationId,
    type: 'update-node',
    nodeId,
    before: { title: 'Requirement one' },
    after: { title, ...extraAfter },
    reason: 'retitle',
    evidenceRefs: [],
    dependsOn: [],
    risk: 'low',
  }
}

let recordsDir = ''
let checkoutDir = ''

function serviceOf() {
  return blueprintMaintenanceService as unknown as {
    tasks: Map<string, BlueprintMaintenanceTask>
    cancelAll(): void
    complete(taskId: string): unknown
  }
}

function stageTask(changeSet: BlueprintChangeSet, nodeScope: BlueprintMaintenanceTask['nodeScope'] = { type: 'blueprint' }): void {
  serviceOf().tasks.set('t-1', {
    id: 't-1',
    blueprintId: PROJECT_ID,
    blueprintName: 'Project',
    baseRevision: currentRev,
    workspaceId: 'ws-1',
    workspaceName: 'W',
    workspacePath: checkoutDir,
    authorizedWorkspaces: [{ workspaceId: 'ws-1', workspaceName: 'W', workspacePath: checkoutDir }],
    nodeScope,
    goal: 'improve the widget',
    status: 'proposal-ready',
    progress: 0,
    phase: '',
    messages: [],
    changeSet,
    changeSetHistory: [],
    createdAt: '',
    updatedAt: '',
  })
}

function changeSetWith(operations: BlueprintOperation[]): BlueprintChangeSet {
  return {
    id: 'cs-1',
    taskId: 't-1',
    blueprintId: PROJECT_ID,
    baseRevision: currentRev,
    version: 1,
    status: 'ready',
    reason: 'test',
    evidence: [
      {
        workspaceId: 'ws-1',
        workspaceRootFingerprint: 'fp',
        gitHead: 'head',
        files: [],
      },
    ],
    operations,
    createdAt: '',
  }
}

async function removeAudits(): Promise<void> {
  const records = await blueprintMaintenanceService.listAudits({ blueprintId: PROJECT_ID }).catch(() => [])
  const dir = join(tmpdir(), 'janusx', 'blueprint-maintenance-audit')
  for (const record of records) {
    await fs.unlink(join(dir, `${record.id}.json`)).catch(() => undefined)
  }
}

describe('maintenance harness routing (S6-c slice 2b)', () => {
  it('binds proposal-only maintenance to shared conversation history and rejects foreign callers', async () => {
    const task = await blueprintMaintenanceService.start({ blueprintId: PROJECT_ID, workspaceId: 'ws-1', workspaceName: 'W', workspacePath: checkoutDir, nodeScope: { type: 'blueprint' }, goal: 'Maintain', conversationId: 'shared' })
    expect(task).toMatchObject({ status: 'active', conversationId: 'shared', messages: [] })
    await expect(blueprintMaintenanceService.message({ taskId: task.id, content: 'other loop' })).rejects.toThrow('linked project conversation')
    await expect(blueprintMaintenanceService.propose({ taskId: task.id })).rejects.toThrow('linked project conversation')
    const input = { taskId: task.id, conversationId: 'shared', providerId: 'p', modelId: 'm', messages: [{ role: 'user', content: 'Preserve the exact selected scope' }], signal: new AbortController().signal, chatSession: new ChatSessionRuntime(), workspaceIds: ['ws-1'] }
    await expect(blueprintMaintenanceService.proposeForConversation({ ...input, conversationId: 'foreign' })).rejects.toThrow('another conversation')
    await expect(blueprintMaintenanceService.proposeForConversation({ ...input, workspaceIds: [] })).rejects.toThrow('detached')
    mocks.getLanguageModel.mockResolvedValue({})
    mocks.generateObject.mockResolvedValue({ object: { summary: 'Shared proposal', operations: [updateOp('shared-op', REQ, 'Revised requirement')] } })
    const text = await blueprintMaintenanceService.proposeForConversation(input)
    expect(text).toContain('Shared proposal')
    expect(serviceOf().tasks.get(task.id)?.changeSet?.operations[0]).toMatchObject({ after: { title: 'Revised requirement' } })
    expect(mocks.generateObject.mock.calls.at(-1)?.[0].messages[0].content).toContain('Preserve the exact selected scope')
    expect(serviceOf().tasks.get(task.id)?.messages).toEqual([])
  })
  beforeEach(async () => {
    currentRev = 7
    recordsDir = await fs.mkdtemp(join(tmpdir(), 'maint-routing-records-'))
    checkoutDir = await fs.mkdtemp(join(tmpdir(), 'maint-routing-checkout-'))
    await fs.writeFile(join(recordsDir, 'ws-1.json'), JSON.stringify({ id: 'ws-1', path: checkoutDir }))
    mocks.workspacesDir.mockReturnValue(recordsDir)
    mocks.loadBlueprint.mockReset().mockResolvedValue(null)
    mocks.applyMaintenanceOperations.mockReset()
    mocks.getDefaultModel.mockReset().mockResolvedValue(null)
    mocks.resolveRoot.mockReset().mockImplementation(async (cwd: string) => ({ ok: true, root: cwd, diagnostics: [] }))
    mocks.projectView.mockReset().mockImplementation(async () => ({
      blueprint: projectBlueprint(),
      rev: currentRev,
      repoId: REPO,
      repoName: 'Project',
      invalid: [],
    }))
    mocks.readNote.mockReset().mockImplementation(async (_root: string, id: string) => {
      if (id !== REQ) throw { code: 'NOT_FOUND', message: `unknown note: ${id}` }
      return { note: {}, raw: REQUIREMENT_MD, relPath: '2026-09-17-req--11111111.md', sha256: '0'.repeat(64) }
    })
    mocks.applyBundleChangeSet.mockReset().mockImplementation(async (_root: string, cs: { operations: Array<{ operationId: string }> }) => ({
      txId: 'tx-1',
      applied: cs.operations.map((o) => ({ operationId: o.operationId })),
    }))
    mocks.collectEvidence.mockReset().mockImplementation(async (_root: string, workspaceId: string) => ({
      ok: true,
      value: {
        manifest: { workspaceId, workspaceRootFingerprint: 'fp', gitHead: 'head', files: [] },
        context: '',
      },
    }))
    serviceOf().cancelAll()
    await removeAudits()
  })

  afterEach(async () => {
    serviceOf().cancelAll()
    await removeAudits()
    await fs.rm(recordsDir, { recursive: true, force: true }).catch(() => undefined)
    await fs.rm(checkoutDir, { recursive: true, force: true }).catch(() => undefined)
  })

  it('starts a maintenance task on a project graph instead of refusing', async () => {
    const task = await blueprintMaintenanceService.start({
      blueprintId: PROJECT_ID,
      workspaceId: 'ws-1',
      workspaceName: 'W',
      workspacePath: checkoutDir,
      nodeScope: { type: 'blueprint' },
      goal: 'improve the widget',
    })
    expect(task.blueprintId).toBe(PROJECT_ID)
    expect(task.baseRevision).toBe(currentRev)
    expect(mocks.loadBlueprint).not.toHaveBeenCalled()
  })

  it('applies a selection through the harness transaction and records an audit with the checkout root', async () => {
    stageTask(changeSetWith([updateOp('m1', REQ, 'Requirement two')]))
    const result = await blueprintMaintenanceService.apply({ taskId: 't-1', changeSetId: 'cs-1', operationIds: ['m1'] })
    expect(result.appliedOperationIds).toEqual(['m1'])
    expect(mocks.applyMaintenanceOperations).not.toHaveBeenCalled()
    expect(mocks.applyBundleChangeSet).toHaveBeenCalledTimes(1)
    const [, cs, reason] = mocks.applyBundleChangeSet.mock.calls[0] as unknown as [
      string,
      { source: { type: string; id: string }; operations: Array<{ afterMarkdown: string }> },
      string,
    ]
    expect(cs.source.type).toBe('harness')
    expect(cs.operations[0]?.afterMarkdown).toContain('# Requirement two')
    expect(reason).toBe('test')
    const audits = await blueprintMaintenanceService.listAudits({ blueprintId: PROJECT_ID })
    expect(audits).toHaveLength(1)
    expect(audits[0]?.status).toBe('applied')
    expect(audits[0]?.harnessRoot).toBe(checkoutDir)
  })

  it('fails loudly with zero writes when the bridge refuses', async () => {
    stageTask(
      changeSetWith([
        updateOp('m-bad', REQ, 'Requirement two', {
          features: [{ id: 'f1', title: 'F', description: '', progress: 0, status: 'planned', requirementNotes: [], createdAt: '', updatedAt: '' }],
        }),
      ]),
    )
    await expect(
      blueprintMaintenanceService.apply({ taskId: 't-1', changeSetId: 'cs-1', operationIds: ['m-bad'] }),
    ).rejects.toThrow('未写入任何内容')
    expect(mocks.applyBundleChangeSet).not.toHaveBeenCalled()
    expect(mocks.applyMaintenanceOperations).not.toHaveBeenCalled()
  })

  it('rejects out-of-scope maintenance operations before translating', async () => {
    stageTask(changeSetWith([updateOp('m-oos', OTHER, 'Elsewhere')]), { type: 'node', nodeId: REQ })
    await expect(
      blueprintMaintenanceService.apply({ taskId: 't-1', changeSetId: 'cs-1', operationIds: ['m-oos'] }),
    ).rejects.toThrow('维护节点范围外禁止写入')
    expect(mocks.applyBundleChangeSet).not.toHaveBeenCalled()
  })

  it('prepares and applies a bridged undo roundtrip', async () => {
    stageTask(changeSetWith([updateOp('m1', REQ, 'Requirement two')]))
    await blueprintMaintenanceService.apply({ taskId: 't-1', changeSetId: 'cs-1', operationIds: ['m1'] })
    serviceOf().complete('t-1')
    const audits = await blueprintMaintenanceService.listAudits({ blueprintId: PROJECT_ID })
    expect(audits).toHaveLength(1)
    const prepared = await blueprintMaintenanceService.prepareUndo({ blueprintId: PROJECT_ID, auditId: audits[0]?.id as string })
    expect(prepared.changeSet.operations.length).toBeGreaterThan(0)
    const undoIds = prepared.changeSet.operations.map((op) => op.operationId)
    mocks.applyBundleChangeSet.mockClear()
    const undone = await blueprintMaintenanceService.applyUndo({
      blueprintId: PROJECT_ID,
      undoChangeSetId: prepared.changeSet.id,
      operationIds: undoIds,
    })
    expect(mocks.applyBundleChangeSet).toHaveBeenCalledTimes(1)
    const [, cs] = mocks.applyBundleChangeSet.mock.calls[0] as unknown as [
      string,
      { operations: Array<{ afterMarkdown: string }> },
    ]
    expect(cs.operations[0]?.afterMarkdown).toContain('# Requirement one')
    const after = await blueprintMaintenanceService.listAudits({ blueprintId: PROJECT_ID })
    const undoAudit = after.find((record) => record.undoOfAuditId === (audits[0]?.id as string))
    expect(undoAudit?.status).toBe('applied')
    expect(undoAudit?.harnessRoot).toBe(checkoutDir)
    expect(undone.auditId).toBe(undoAudit?.id)
  })
})
