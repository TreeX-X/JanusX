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
import { SUPPORTED_HARNESS_PROFILE } from '@janus-agent/harness-node'

const { HarnessNoteService } = await vi.importActual<typeof import('../../src/main/harness/service')>('../../src/main/harness/service')

let PROJECT_ID = 'harness:project:8fa19f17'
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
        id: REQ, sourceHash: '0'.repeat(64), title: 'Requirement one', type: 'feature', status: 'in-progress', progress: 0,
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
    sourceHashes: { [REQ]: '0'.repeat(64) },
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
    const input = { taskId: task.id, conversationId: 'shared', providerId: 'p', modelId: 'm', messages: [{ role: 'user', content: 'Preserve the exact selected scope' }], signal: new AbortController().signal, chatSession: new ChatSessionRuntime(), workspaceIds: ['ws-1'], workspaceRoots: { 'ws-1': checkoutDir } }
    await expect(blueprintMaintenanceService.proposeForConversation({ ...input, conversationId: 'foreign' })).rejects.toThrow('another conversation')
    await expect(blueprintMaintenanceService.proposeForConversation({ ...input, workspaceIds: [] })).rejects.toThrow('detached')
    await expect(blueprintMaintenanceService.proposeForConversation({ ...input, workspaceRoots: { 'ws-1': recordsDir } })).rejects.toThrow('root does not match')
    mocks.getLanguageModel.mockResolvedValue({})
    mocks.generateObject.mockResolvedValue({ object: { summary: 'Shared proposal', operations: [updateOp('shared-op', REQ, 'Revised requirement')] } })
    const text = await blueprintMaintenanceService.proposeForConversation(input)
    expect(text).toContain('Shared proposal')
    expect(serviceOf().tasks.get(task.id)?.changeSet?.operations[0]).toMatchObject({ after: { title: 'Revised requirement' } })
    expect(mocks.generateObject.mock.calls.at(-1)?.[0].messages[0].content).toContain('Preserve the exact selected scope')
    expect(serviceOf().tasks.get(task.id)?.messages).toEqual([])
  })
  beforeEach(async () => {
    PROJECT_ID = 'harness:project:8fa19f17'
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
      conversationId: 'shared-start',
    })
    expect(task.blueprintId).toBe(PROJECT_ID)
    expect(task.baseRevision).toBe(currentRev)
    expect(task.conversationId).toBe('shared-start')
    expect(mocks.loadBlueprint).not.toHaveBeenCalled()
    blueprintMaintenanceService.cancel(task.id)
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

  it('marks the harness apply stale when evidence drifts before apply', async () => {
    stageTask(changeSetWith([updateOp('m1', REQ, 'Requirement two')]))
    mocks.collectEvidence.mockImplementationOnce(async (_root: string, workspaceId: string) => ({
      ok: true,
      value: {
        manifest: { workspaceId, workspaceRootFingerprint: 'fp', gitHead: 'moved', files: [] },
        context: '',
      },
    }))
    await expect(
      blueprintMaintenanceService.apply({ taskId: 't-1', changeSetId: 'cs-1', operationIds: ['m1'] }),
    ).rejects.toThrow('工程证据已变化')
    expect(mocks.applyBundleChangeSet).not.toHaveBeenCalled()
    expect(serviceOf().tasks.get('t-1')?.status).toBe('stale')
  })

  it('refuses harness deletes without individual high-risk confirmation', async () => {
    const delOp: BlueprintOperation = {
      operationId: 'm-del',
      type: 'delete-node',
      nodeId: REQ,
      reason: 'Obsolete node',
      evidenceRefs: [],
      dependsOn: [],
      risk: 'high',
      impact: { title: 'Requirement one', parentId: null, childIds: [], incomingRelationIds: [], outgoingRelationIds: [] },
    }
    stageTask(changeSetWith([delOp]))
    await expect(
      blueprintMaintenanceService.apply({ taskId: 't-1', changeSetId: 'cs-1', operationIds: ['m-del'] }),
    ).rejects.toThrow('逐项高风险确认')
    expect(mocks.applyBundleChangeSet).not.toHaveBeenCalled()
  })

  it('refuses a bridged undo when the projection moves before apply', async () => {
    stageTask(changeSetWith([updateOp('m1', REQ, 'Requirement two')]))
    await blueprintMaintenanceService.apply({ taskId: 't-1', changeSetId: 'cs-1', operationIds: ['m1'] })
    serviceOf().complete('t-1')
    const audits = await blueprintMaintenanceService.listAudits({ blueprintId: PROJECT_ID })
    expect(audits).toHaveLength(1)
    const prepared = await blueprintMaintenanceService.prepareUndo({ blueprintId: PROJECT_ID, auditId: audits[0]?.id as string })
    const undoIds = prepared.changeSet.operations.map((op) => op.operationId)
    currentRev += 1
    mocks.applyBundleChangeSet.mockClear()
    await expect(
      blueprintMaintenanceService.applyUndo({
        blueprintId: PROJECT_ID,
        undoChangeSetId: prepared.changeSet.id,
        operationIds: undoIds,
      }),
    ).rejects.toThrow('蓝图版本已变化')
    expect(mocks.applyBundleChangeSet).not.toHaveBeenCalled()
  })

  it('cancels a conversation-linked project task with no writes', async () => {
    const task = await blueprintMaintenanceService.start({
      blueprintId: PROJECT_ID,
      workspaceId: 'ws-1',
      workspaceName: 'W',
      workspacePath: checkoutDir,
      nodeScope: { type: 'blueprint' },
      goal: 'cancel equivalence probe',
      conversationId: 'shared-cancel',
    })
    expect(task.status).toBe('active')
    mocks.applyBundleChangeSet.mockClear()
    const cancelled = blueprintMaintenanceService.cancel(task.id)
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.changeSet).toBeNull()
    expect(mocks.applyBundleChangeSet).not.toHaveBeenCalled()
  })

  it('rejects concurrent starts for the same project graph', async () => {
    let releaseResolve!: () => void
    const gate = new Promise<{ ok: boolean; root: string; diagnostics: never[] }>((resolve) => {
      releaseResolve = () => resolve({ ok: true, root: checkoutDir, diagnostics: [] })
    })
    mocks.resolveRoot.mockImplementationOnce(() => gate)
    const input = {
      blueprintId: PROJECT_ID,
      workspaceId: 'ws-1',
      workspaceName: 'W',
      workspacePath: checkoutDir,
      nodeScope: { type: 'blueprint' } as const,
      goal: 'race the shared start',
      conversationId: 'shared-race',
    }
    const first = blueprintMaintenanceService.start(input)
    await expect(blueprintMaintenanceService.start(input)).rejects.toThrow('已有活动维护任务')
    releaseResolve()
    const started = await first
    expect(started.conversationId).toBe('shared-race')
    blueprintMaintenanceService.cancel(started.id)
  })

  it('authorizes multiple workspaces on a shared project start', async () => {
    await fs.writeFile(join(recordsDir, 'ws-2.json'), JSON.stringify({ id: 'ws-2', path: checkoutDir }))
    const task = await blueprintMaintenanceService.start({
      blueprintId: PROJECT_ID,
      workspaceId: 'ws-1',
      workspaceName: 'W',
      workspacePath: checkoutDir,
      authorizedWorkspaces: [
        { workspaceId: 'ws-1', workspaceName: 'W', workspacePath: checkoutDir },
        { workspaceId: 'ws-2', workspaceName: 'W2', workspacePath: checkoutDir },
      ],
      nodeScope: { type: 'blueprint' },
      goal: 'cross-workspace start',
      conversationId: 'shared-multi',
    })
    expect(task.authorizedWorkspaces).toHaveLength(2)
    expect(task.nodeScope).toEqual({ type: 'blueprint' })
    blueprintMaintenanceService.cancel(task.id)
  })

  it('rejects an unregistered claimed path before reading the project graph', async () => {
    await expect(blueprintMaintenanceService.start({ blueprintId: PROJECT_ID, workspaceId: 'ws-1', workspaceName: 'W', workspacePath: recordsDir,
      authorizedWorkspaces: [{ workspaceId: 'ws-1', workspaceName: 'W', workspacePath: checkoutDir }],
      nodeScope: { type: 'blueprint' }, goal: 'Unbound primary', conversationId: 'unbound' })).rejects.toThrow('primary checkout')
    expect(mocks.projectView).not.toHaveBeenCalled()
  })

  describe('R5 real Note transactions', () => {
    let harness: InstanceType<typeof HarnessNoteService>
    const notePath = () => join(checkoutDir, '.agents', 'notes', 'requirement.md')
    beforeEach(async () => {
      await fs.mkdir(join(checkoutDir, '.agents', 'notes'), { recursive: true })
      await fs.writeFile(join(checkoutDir, '.agents', 'harness.json'), JSON.stringify({ schemaVersion: 1, repoId: REPO, name: 'R5 fixture', profile: SUPPORTED_HARNESS_PROFILE }))
      await fs.writeFile(notePath(), REQUIREMENT_MD)
      await fs.writeFile(join(checkoutDir, '.agents', 'notes', 'other.md'), REQUIREMENT_MD.replaceAll(REQ, OTHER).replace('Requirement one', 'Other requirement'))
      harness = new HarnessNoteService()
      PROJECT_ID = (await harness.projectView(checkoutDir)).blueprint.id
      mocks.resolveRoot.mockImplementation(harness.resolveRoot.bind(harness))
      // Hold projection revision fixed to prove raw hashes protect writes independently.
      mocks.projectView.mockImplementation(async (root: string) => {
        const view = await harness.projectView(root)
        return { ...view, rev: currentRev, blueprint: { ...view.blueprint, contentRevision: currentRev } }
      })
      mocks.readNote.mockImplementation(harness.readNote.bind(harness))
      mocks.applyBundleChangeSet.mockImplementation(harness.applyBundleChangeSet.bind(harness))
      mocks.getLanguageModel.mockResolvedValue({})
    })

    async function propose(operations: BlueprintOperation[]) {
      const task = await blueprintMaintenanceService.start({ blueprintId: PROJECT_ID, workspaceId: 'ws-1', workspaceName: 'W', workspacePath: checkoutDir,
        nodeScope: { type: 'blueprint' }, goal: 'Maintain these Notes', conversationId: 'real-conversation' })
      mocks.generateObject.mockResolvedValue({ object: { summary: 'Real proposal', operations } })
      await blueprintMaintenanceService.proposeForConversation({ taskId: task.id, conversationId: 'real-conversation', providerId: 'p', modelId: 'm',
        messages: [{ role: 'user', content: 'Apply the requested changes' }], signal: new AbortController().signal, chatSession: new ChatSessionRuntime(),
        workspaceIds: ['ws-1'], workspaceRoots: { 'ws-1': checkoutDir } })
      return serviceOf().tasks.get(task.id)!
    }

    it('captures proposal-time hashes and rejects later source bytes despite equal revision', async () => {
      const task = await propose([updateOp('retitle', REQ, 'Approved title')])
      const hash = (await harness.readNote(checkoutDir, REQ)).sha256
      expect(task.changeSet?.sourceHashes).toMatchObject({ [REQ]: hash })
      const changed = REQUIREMENT_MD + '\nExternal edit without a revision notification.\n'
      await fs.writeFile(notePath(), changed)
      await expect(blueprintMaintenanceService.apply({ taskId: task.id, changeSetId: task.changeSet!.id, operationIds: ['retitle'] }))
        .rejects.toThrow('HARNESS_CONFLICT')
      expect(mocks.applyBundleChangeSet).not.toHaveBeenCalled()
      expect(await fs.readFile(notePath(), 'utf8')).toBe(changed)
      expect((await blueprintMaintenanceService.listAudits({ blueprintId: PROJECT_ID })).every(audit => audit.status !== 'applied')).toBe(true)
    })

    it('applies a partial group selection and persists the actual applied and rejected operations through undo', async () => {
      const task = await propose([updateOp('selected', REQ, 'Approved title'), updateOp('unselected', OTHER, 'Unselected title')])
      const changeSet = task.changeSet!
      const group = changeSet.groups!.find(item => item.operationIds.includes('selected'))!
      const result = await blueprintMaintenanceService.apply({ taskId: task.id, changeSetId: changeSet.id, operationIds: [], groupIds: [group.id] })
      expect(result.appliedOperationIds).toEqual(['selected'])
      expect((await harness.readNote(checkoutDir, REQ)).raw).toContain('# Approved title')
      expect((await harness.readNote(checkoutDir, OTHER)).raw).toContain('# Other requirement')
      const [audit] = await blueprintMaintenanceService.listAudits({ blueprintId: PROJECT_ID })
      expect(audit).toMatchObject({ status: 'applied', harnessRoot: checkoutDir, selectedOperationIds: ['selected'], rejectedOperationIds: ['unselected'] })
      expect((audit.afterSnapshot as Blueprint).nodes[REQ].sourceHash).toBe((await harness.readNote(checkoutDir, REQ)).sha256)
      blueprintMaintenanceService.complete(task.id)
      const undo = await blueprintMaintenanceService.prepareUndo({ blueprintId: PROJECT_ID, auditId: audit.id })
      const undone = await blueprintMaintenanceService.applyUndo({ blueprintId: PROJECT_ID, undoChangeSetId: undo.changeSet.id, operationIds: undo.changeSet.operations.map(op => op.operationId) })
      expect((await harness.readNote(checkoutDir, REQ)).raw).toContain('# Requirement one')
      expect((await harness.readNote(checkoutDir, OTHER)).raw).toContain('# Other requirement')
      expect((await blueprintMaintenanceService.listAudits({ blueprintId: PROJECT_ID })).find(item => item.id === undone.auditId))
        .toMatchObject({ status: 'applied', undoOfAuditId: audit.id, harnessRoot: checkoutDir, selectedOperationIds: ['undo-selected'] })
    })

    it.each(['before preparation', 'after preparation'])('refuses undo with a changed source %s even at the same revision', async timing => {
      const task = await propose([updateOp('retitle', REQ, 'Approved title')])
      await blueprintMaintenanceService.apply({ taskId: task.id, changeSetId: task.changeSet!.id, operationIds: ['retitle'] })
      blueprintMaintenanceService.complete(task.id)
      const [audit] = await blueprintMaintenanceService.listAudits({ blueprintId: PROJECT_ID })
      const changed = (await harness.readNote(checkoutDir, REQ)).raw + '\nA newer source change.\n'
      if (timing === 'before preparation') await fs.writeFile(notePath(), changed)
      const undo = await blueprintMaintenanceService.prepareUndo({ blueprintId: PROJECT_ID, auditId: audit.id })
      if (timing === 'after preparation') await fs.writeFile(notePath(), changed)
      mocks.applyBundleChangeSet.mockClear()
      await expect(blueprintMaintenanceService.applyUndo({ blueprintId: PROJECT_ID, undoChangeSetId: undo.changeSet.id, operationIds: undo.changeSet.operations.map(op => op.operationId) }))
        .rejects.toThrow('HARNESS_CONFLICT')
      expect(mocks.applyBundleChangeSet).not.toHaveBeenCalled()
      expect(await fs.readFile(notePath(), 'utf8')).toBe(changed)
    })

    it('refuses evidence drift before apply and reports the changed critical file', async () => {
      const manifest = { workspaceId: 'ws-1', workspaceRootFingerprint: 'fp', gitHead: 'head', files: [{ path: 'src/widget.ts', sha256: 'a', sourceState: 'tracked', role: 'supporting', supportsOperationIds: [] }] }
      mocks.collectEvidence.mockImplementation(async () => ({ ok: true, value: { manifest: structuredClone(manifest), context: 'src/widget.ts' } }))
      const task = await propose([{ ...updateOp('retitle', REQ, 'Approved title'), evidenceRefs: ['src/widget.ts'] }])
      manifest.files[0].sha256 = 'b'
      await expect(blueprintMaintenanceService.apply({ taskId: task.id, changeSetId: task.changeSet!.id, operationIds: ['retitle'] }))
        .rejects.toThrow('src/widget.ts')
      expect(mocks.applyBundleChangeSet).not.toHaveBeenCalled()
      expect((await harness.readNote(checkoutDir, REQ)).raw).toBe(REQUIREMENT_MD)
    })

    it('rechecks undo evidence and workspace authorization without writing', async () => {
      const manifest = { workspaceId: 'ws-1', workspaceRootFingerprint: 'fp', gitHead: 'head', files: [{ path: 'src/widget.ts', sha256: 'a', sourceState: 'tracked', role: 'supporting', supportsOperationIds: [] }] }
      mocks.collectEvidence.mockImplementation(async () => ({ ok: true, value: { manifest: structuredClone(manifest), context: 'src/widget.ts' } }))
      const task = await propose([{ ...updateOp('retitle', REQ, 'Approved title'), evidenceRefs: ['src/widget.ts'] }])
      await blueprintMaintenanceService.apply({ taskId: task.id, changeSetId: task.changeSet!.id, operationIds: ['retitle'] })
      blueprintMaintenanceService.complete(task.id)
      const [audit] = await blueprintMaintenanceService.listAudits({ blueprintId: PROJECT_ID })
      const undo = await blueprintMaintenanceService.prepareUndo({ blueprintId: PROJECT_ID, auditId: audit.id })
      const input = { blueprintId: PROJECT_ID, undoChangeSetId: undo.changeSet.id, operationIds: undo.changeSet.operations.map(op => op.operationId) }
      mocks.applyBundleChangeSet.mockClear()
      manifest.files[0].sha256 = 'b'
      await expect(blueprintMaintenanceService.applyUndo(input)).rejects.toThrow('src/widget.ts')
      manifest.files[0].sha256 = 'a'
      await fs.unlink(join(recordsDir, 'ws-1.json'))
      await expect(blueprintMaintenanceService.applyUndo(input)).rejects.toThrow('授权工作区未注册或已移除')
      expect(mocks.applyBundleChangeSet).not.toHaveBeenCalled()
      expect((await harness.readNote(checkoutDir, REQ)).raw).toContain('# Approved title')
    })

    it('refuses legacy proposals without captured hashes instead of rebasing them', async () => {
      const task = await propose([updateOp('retitle', REQ, 'Approved title')])
      delete task.changeSet!.sourceHashes
      await expect(blueprintMaintenanceService.apply({ taskId: task.id, changeSetId: task.changeSet!.id, operationIds: ['retitle'] })).rejects.toThrow('HARNESS_CONFLICT')
      expect(mocks.applyBundleChangeSet).not.toHaveBeenCalled()
      expect((await harness.readNote(checkoutDir, REQ)).raw).toBe(REQUIREMENT_MD)
    })

    it('does not resolve an authorized workspace to a different registered checkout', async () => {
      const other = join(recordsDir, 'other-checkout')
      await fs.mkdir(join(other, '.agents', 'notes'), { recursive: true })
      await fs.copyFile(join(checkoutDir, '.agents', 'harness.json'), join(other, '.agents', 'harness.json'))
      await fs.writeFile(join(other, '.agents', 'notes', 'requirement.md'), REQUIREMENT_MD)
      await fs.writeFile(join(recordsDir, 'ws-2.json'), JSON.stringify({ id: 'ws-2', path: other }))
      await expect(blueprintMaintenanceService.start({ blueprintId: PROJECT_ID, workspaceId: 'ws-2', workspaceName: 'Other', workspacePath: other,
        nodeScope: { type: 'blueprint' }, goal: 'Wrong checkout', conversationId: 'foreign-checkout' })).rejects.toThrow('checkout')
      expect(mocks.applyBundleChangeSet).not.toHaveBeenCalled()
    })

    it('undoes an individually confirmed delete as an archive reversal', async () => {
      const task = await propose([{ operationId: 'delete', type: 'delete-node', nodeId: REQ, reason: 'Retire', evidenceRefs: [], dependsOn: [], risk: 'high',
        impact: { title: 'Requirement one', parentId: null, childIds: [], incomingRelationIds: [], outgoingRelationIds: [] } }])
      await blueprintMaintenanceService.apply({ taskId: task.id, changeSetId: task.changeSet!.id, operationIds: ['delete'], confirmedDeleteOperationIds: ['delete'] })
      expect((await harness.readNote(checkoutDir, REQ)).raw).toContain('lifecycle: archived')
      blueprintMaintenanceService.complete(task.id)
      const [audit] = await blueprintMaintenanceService.listAudits({ blueprintId: PROJECT_ID })
      const undo = await blueprintMaintenanceService.prepareUndo({ blueprintId: PROJECT_ID, auditId: audit.id })
      await blueprintMaintenanceService.applyUndo({ blueprintId: PROJECT_ID, undoChangeSetId: undo.changeSet.id, operationIds: undo.changeSet.operations.map(op => op.operationId) })
      expect((await harness.readNote(checkoutDir, REQ)).raw).toContain('lifecycle: accepted')
    })

    it('records the actual composition relation identity for an audit-backed undo', async () => {
      const task = await propose([{ operationId: 'relate', type: 'add-relation', tempRelationId: 'new-relation',
        after: { sourceNodeId: REQ, targetNodeId: OTHER, relationType: 'depends-on' }, reason: 'Order', evidenceRefs: [], dependsOn: [], risk: 'medium' }])
      await blueprintMaintenanceService.apply({ taskId: task.id, changeSetId: task.changeSet!.id, operationIds: ['relate'] })
      blueprintMaintenanceService.complete(task.id)
      const [audit] = await blueprintMaintenanceService.listAudits({ blueprintId: PROJECT_ID })
      const view = await harness.projectView(checkoutDir)
      expect(view.blueprint.relations.find(relation => relation.id === audit.createdRelationIds?.['new-relation']))
        .toMatchObject({ sourceNodeId: REQ, targetNodeId: OTHER, type: 'depends-on' })
      const undo = await blueprintMaintenanceService.prepareUndo({ blueprintId: PROJECT_ID, auditId: audit.id })
      await blueprintMaintenanceService.applyUndo({ blueprintId: PROJECT_ID, undoChangeSetId: undo.changeSet.id, operationIds: undo.changeSet.operations.map(op => op.operationId) })
      expect((await harness.projectView(checkoutDir)).blueprint.relations).toEqual([])
    })
  })
})
