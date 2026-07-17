import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  JANUS_COMMAND_CHANNELS,
  JANUS_EVENT_CHANNELS,
  type IslandAnalysisEvent,
  type IslandDiscoveredEvent,
  type JanusAPI,
} from '../../src/shared/ipc/janus'

const mocks = vi.hoisted(() => ({
  acceptRequirementCandidate: vi.fn(),
  analyzeNode: vi.fn(),
  bindTerminal: vi.fn(),
  capture: vi.fn(),
  createNode: vi.fn(),
  expose: vi.fn(),
  focusNode: vi.fn(),
  handle: vi.fn(),
  invoke: vi.fn(),
  loadBlueprint: vi.fn(),
  on: vi.fn(),
  registerNodeWorkspace: vi.fn(),
  removeListener: vi.fn(),
  scheduleAnalyze: vi.fn(),
  setMainWindow: vi.fn(),
}))

let janusApi: JanusAPI
const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (
      _name: string,
      api: {
        janus: JanusAPI
      }
    ) => {
      janusApi = api.janus
      mocks.expose(api)
    },
  },
  ipcMain: { handle: mocks.handle },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
    send: vi.fn(),
  },
}))

vi.mock('../../src/main/janus/blueprint-store', () => ({
  blueprintStore: {
    acceptRequirementCandidate: mocks.acceptRequirementCandidate,
    bindTerminal: mocks.bindTerminal,
    createNode: mocks.createNode,
    focusNode: mocks.focusNode,
    loadBlueprint: mocks.loadBlueprint,
  },
}))
vi.mock('../../src/main/janus/analyzer', () => ({
  analyzer: {
    analyzeNode: mocks.analyzeNode,
    registerNodeWorkspace: mocks.registerNodeWorkspace,
    scheduleAnalyze: mocks.scheduleAnalyze,
    setMainWindow: mocks.setMainWindow,
  },
}))
vi.mock('../../src/main/knowledge/observation-service', () => ({
  knowledgeObservationService: { capture: mocks.capture },
}))

beforeAll(async () => {
  await import('../../src/preload/index')
  const { registerJanusHandlers } = await import('../../src/main/ipc/janus-handlers')
  registerJanusHandlers({} as Electron.BrowserWindow)
  for (const [channel, handler] of mocks.handle.mock.calls) {
    handlers.set(channel, handler)
  }
})

describe('Janus IPC contract', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.invoke.mockResolvedValue(null)
    mocks.on.mockClear()
    mocks.removeListener.mockClear()
    mocks.acceptRequirementCandidate.mockReset()
    mocks.analyzeNode.mockReset()
    mocks.bindTerminal.mockReset()
    mocks.capture.mockReset()
    mocks.capture.mockResolvedValue(undefined)
    mocks.createNode.mockReset()
    mocks.focusNode.mockReset()
    mocks.loadBlueprint.mockReset()
    mocks.registerNodeWorkspace.mockReset()
    mocks.scheduleAnalyze.mockReset()
  })

  function handler(channel: string): (...args: unknown[]) => Promise<unknown> {
    const registered = handlers.get(channel)
    if (!registered) throw new Error(`Missing handler for ${channel}`)
    return registered
  }

  it('defines unique channels and registers all 22 main commands', () => {
    const commands = Object.values(JANUS_COMMAND_CHANNELS)
    const events = Object.values(JANUS_EVENT_CHANNELS)

    expect(commands).toHaveLength(22)
    expect(events).toHaveLength(2)
    expect(new Set([...commands, ...events]).size).toBe(24)
    expect(mocks.handle.mock.calls.map(([channel]) => channel)).toEqual(
      expect.arrayContaining(commands)
    )
  })

  it('routes every command through the fixed API with exact argument order', async () => {
    const createInput = { name: 'demo', rootType: 'epic' as const }
    const updatePatch = { name: 'renamed' }
    const nodeInput = { title: 'Root', type: 'task' as const }
    const featureInput = { title: 'Typed IPC' }
    const featurePatch = { description: 'done' }
    const focusPayload = { workspacePath: 'C:\\repo', nodeId: 'node-1' }
    const analyzePayload = { nodeId: 'node-1', workspacePath: 'C:\\repo' }
    const patchPayload = {
      workspacePath: 'C:\\repo',
      blueprintId: 'bp-1',
      nodeId: 'node-1',
      patch: { progress: 50 },
    }
    const historyPayload = { workspacePath: 'C:\\repo', blueprintId: 'bp-1', nodeId: 'node-1' }
    const applyPayload = { ...historyPayload, analysisId: 'analysis-1' }
    const listPayload = { workspacePath: 'C:\\repo', blueprintId: 'bp-1' }
    const acceptPayload = { ...listPayload, candidateId: 'candidate-1' }
    const rejectPayload = { ...acceptPayload, decisionNote: 'duplicate' }
    const discoveredPayload = {
      ...listPayload,
      discovered: { title: 'New', description: 'New task', suggestedParent: '', confidence: 0.8 },
    }

    await janusApi.listBlueprints('C:\\repo')
    await janusApi.loadBlueprint('C:\\repo', 'bp-1')
    await janusApi.createBlueprint('C:\\repo', createInput)
    await janusApi.updateBlueprint('C:\\repo', 'bp-1', updatePatch)
    await janusApi.deleteBlueprint('C:\\repo', 'bp-1')
    await janusApi.createNode('C:\\repo', 'bp-1', nodeInput, null)
    await janusApi.updateNode('C:\\repo', 'bp-1', 'node-1', { status: 'done' })
    await janusApi.deleteNode('C:\\repo', 'bp-1', 'node-1')
    await janusApi.replaceNodeFeatures('C:\\repo', 'bp-1', 'node-1', [featureInput])
    await janusApi.addNodeFeature('C:\\repo', 'bp-1', 'node-1', featureInput)
    await janusApi.updateNodeFeature('C:\\repo', 'bp-1', 'node-1', 'feature-1', featurePatch)
    await janusApi.deleteNodeFeature('C:\\repo', 'bp-1', 'node-1', 'feature-1')
    await janusApi.focusNode(focusPayload)
    await janusApi.bindTerminal('C:\\repo', 'node-1', 'terminal-1')
    await janusApi.analyze(analyzePayload)
    await janusApi.applyAnalysisPatch(patchPayload)
    await janusApi.listAnalyses(historyPayload)
    await janusApi.applyAnalysis(applyPayload)
    await janusApi.listRequirementCandidates(listPayload)
    await janusApi.acceptRequirementCandidate(acceptPayload)
    await janusApi.rejectRequirementCandidate(rejectPayload)
    await janusApi.acceptDiscovered(discoveredPayload)

    expect(mocks.invoke.mock.calls).toEqual([
      [JANUS_COMMAND_CHANNELS.listBlueprints, 'C:\\repo'],
      [JANUS_COMMAND_CHANNELS.loadBlueprint, 'C:\\repo', 'bp-1'],
      [JANUS_COMMAND_CHANNELS.createBlueprint, 'C:\\repo', createInput],
      [JANUS_COMMAND_CHANNELS.updateBlueprint, 'C:\\repo', 'bp-1', updatePatch],
      [JANUS_COMMAND_CHANNELS.deleteBlueprint, 'C:\\repo', 'bp-1'],
      [JANUS_COMMAND_CHANNELS.createNode, 'C:\\repo', 'bp-1', nodeInput, null],
      [JANUS_COMMAND_CHANNELS.updateNode, 'C:\\repo', 'bp-1', 'node-1', { status: 'done' }],
      [JANUS_COMMAND_CHANNELS.deleteNode, 'C:\\repo', 'bp-1', 'node-1'],
      [JANUS_COMMAND_CHANNELS.replaceNodeFeatures, 'C:\\repo', 'bp-1', 'node-1', [featureInput]],
      [JANUS_COMMAND_CHANNELS.addNodeFeature, 'C:\\repo', 'bp-1', 'node-1', featureInput],
      [JANUS_COMMAND_CHANNELS.updateNodeFeature, 'C:\\repo', 'bp-1', 'node-1', 'feature-1', featurePatch],
      [JANUS_COMMAND_CHANNELS.deleteNodeFeature, 'C:\\repo', 'bp-1', 'node-1', 'feature-1'],
      [JANUS_COMMAND_CHANNELS.focusNode, 'C:\\repo', 'node-1'],
      [JANUS_COMMAND_CHANNELS.bindTerminal, 'C:\\repo', 'node-1', 'terminal-1'],
      [JANUS_COMMAND_CHANNELS.analyze, analyzePayload],
      [JANUS_COMMAND_CHANNELS.applyAnalysisPatch, patchPayload],
      [JANUS_COMMAND_CHANNELS.listAnalyses, historyPayload],
      [JANUS_COMMAND_CHANNELS.applyAnalysis, applyPayload],
      [JANUS_COMMAND_CHANNELS.listRequirementCandidates, listPayload],
      [JANUS_COMMAND_CHANNELS.acceptRequirementCandidate, acceptPayload],
      [JANUS_COMMAND_CHANNELS.rejectRequirementCandidate, rejectPayload],
      [JANUS_COMMAND_CHANNELS.acceptDiscovered, discoveredPayload],
    ])
  })

  it('preserves focus and bind forwarding, results, and analyzer side effects', async () => {
    const focused = { id: 'focused-node' }
    const bound = { id: 'bound-node' }
    mocks.focusNode.mockResolvedValueOnce(focused).mockResolvedValueOnce(null)
    mocks.bindTerminal.mockResolvedValueOnce(bound).mockResolvedValueOnce(null)

    await expect(
      handler(JANUS_COMMAND_CHANNELS.focusNode)(undefined, 'C:\\repo', 'node-1')
    ).resolves.toBe(focused)
    expect(mocks.focusNode).toHaveBeenNthCalledWith(1, 'C:\\repo', 'node-1')
    expect(mocks.registerNodeWorkspace).toHaveBeenCalledWith('focused-node', 'C:\\repo')
    expect(mocks.scheduleAnalyze).toHaveBeenCalledWith('focused-node', {
      workspacePath: 'C:\\repo',
      trigger: 'reconcile',
    })

    mocks.registerNodeWorkspace.mockClear()
    mocks.scheduleAnalyze.mockClear()
    await expect(
      handler(JANUS_COMMAND_CHANNELS.focusNode)(undefined, 'C:\\repo', 'missing')
    ).resolves.toBeNull()
    expect(mocks.registerNodeWorkspace).not.toHaveBeenCalled()
    expect(mocks.scheduleAnalyze).not.toHaveBeenCalled()

    await expect(
      handler(JANUS_COMMAND_CHANNELS.bindTerminal)(
        undefined,
        'C:\\repo',
        'node-1',
        'terminal-1'
      )
    ).resolves.toBe(bound)
    expect(mocks.bindTerminal).toHaveBeenNthCalledWith(
      1,
      'C:\\repo',
      'node-1',
      'terminal-1'
    )
    expect(mocks.registerNodeWorkspace).toHaveBeenCalledWith('bound-node', 'C:\\repo')

    mocks.registerNodeWorkspace.mockClear()
    await expect(
      handler(JANUS_COMMAND_CHANNELS.bindTerminal)(
        undefined,
        'C:\\repo',
        'missing',
        'terminal-1'
      )
    ).resolves.toBeNull()
    expect(mocks.registerNodeWorkspace).not.toHaveBeenCalled()
  })

  it('registers nodes created directly, from candidates, and from discoveries', async () => {
    const created = { id: 'created-node' }
    const accepted = { id: 'accepted-node' }
    const discovered = { id: 'discovered-node' }
    mocks.createNode.mockResolvedValueOnce(created).mockResolvedValueOnce(discovered)
    mocks.acceptRequirementCandidate.mockResolvedValue(accepted)
    mocks.loadBlueprint.mockResolvedValue({ rootNodeId: 'root-node', nodes: {} })

    const nodeInput = { title: 'Created', type: 'task' }
    await expect(
      handler(JANUS_COMMAND_CHANNELS.createNode)(
        undefined,
        'C:\\repo',
        'bp-1',
        nodeInput,
        'root-node'
      )
    ).resolves.toBe(created)
    expect(mocks.createNode).toHaveBeenNthCalledWith(
      1,
      'C:\\repo',
      'bp-1',
      nodeInput,
      'root-node'
    )

    const candidatePayload = {
      workspacePath: 'C:\\repo',
      blueprintId: 'bp-1',
      candidateId: 'candidate-1',
      title: 'Accepted',
      decisionNote: 'approved',
    }
    await expect(
      handler(JANUS_COMMAND_CHANNELS.acceptRequirementCandidate)(
        undefined,
        candidatePayload
      )
    ).resolves.toBe(accepted)
    expect(mocks.acceptRequirementCandidate).toHaveBeenCalledWith(
      'C:\\repo',
      'bp-1',
      'candidate-1',
      {
        title: 'Accepted',
        description: undefined,
        parentId: undefined,
        decisionNote: 'approved',
      }
    )

    const discoveredPayload = {
      workspacePath: 'C:\\repo',
      blueprintId: 'bp-1',
      discovered: {
        title: 'Discovered',
        description: 'New work',
        suggestedParent: '',
        confidence: 0.8,
      },
    }
    await expect(
      handler(JANUS_COMMAND_CHANNELS.acceptDiscovered)(undefined, discoveredPayload)
    ).resolves.toBe(discovered)
    expect(mocks.createNode).toHaveBeenNthCalledWith(
      2,
      'C:\\repo',
      'bp-1',
      {
        title: 'Discovered',
        type: 'task',
        description: 'New work',
        status: 'not-started',
        progress: 0,
        tags: ['discovered-by-janus'],
      },
      'root-node'
    )
    expect(mocks.registerNodeWorkspace.mock.calls).toEqual([
      ['created-node', 'C:\\repo'],
      ['accepted-node', 'C:\\repo'],
      ['discovered-node', 'C:\\repo'],
    ])

    mocks.registerNodeWorkspace.mockClear()
    mocks.createNode.mockResolvedValue(null)
    mocks.acceptRequirementCandidate.mockResolvedValue(null)
    await expect(
      handler(JANUS_COMMAND_CHANNELS.createNode)(
        undefined,
        'C:\\repo',
        'bp-1',
        nodeInput,
        'root-node'
      )
    ).resolves.toBeNull()
    await expect(
      handler(JANUS_COMMAND_CHANNELS.acceptRequirementCandidate)(
        undefined,
        candidatePayload
      )
    ).resolves.toBeNull()
    await expect(
      handler(JANUS_COMMAND_CHANNELS.acceptDiscovered)(undefined, discoveredPayload)
    ).resolves.toBeNull()
    expect(mocks.registerNodeWorkspace).not.toHaveBeenCalled()
  })

  it('captures successful manual analysis and suppresses capture for null results', async () => {
    const result = {
      id: 'analysis-1',
      applied: true,
      error: undefined,
      result: {
        summary: 'Completed work',
        confidence: 0.9,
        progress: 80,
        status: 'testing',
      },
    }
    mocks.analyzeNode.mockResolvedValueOnce(result).mockResolvedValueOnce(null)
    const payload = { nodeId: 'node-1', workspacePath: 'C:\\repo', commitLimit: 3 }

    await expect(
      handler(JANUS_COMMAND_CHANNELS.analyze)(undefined, payload)
    ).resolves.toBe(result)
    expect(mocks.analyzeNode).toHaveBeenNthCalledWith(1, 'node-1', {
      workspacePath: 'C:\\repo',
      trigger: 'manual',
      commitLimit: 3,
    })
    expect(mocks.capture).toHaveBeenCalledWith({
      workspacePath: 'C:\\repo',
      source: 'git-analyzer',
      type: 'analysis-result',
      content: 'Completed work',
      summary: 'Janus analyzer: manual',
      tags: ['janus-analysis', 'manual'],
      actor: 'janus-analyzer',
      correlationId: 'analysis-1',
      metadata: {
        nodeId: 'node-1',
        trigger: 'manual',
        applied: true,
        error: undefined,
        confidence: 0.9,
        progress: 80,
        status: 'testing',
      },
    })

    mocks.capture.mockClear()
    await expect(
      handler(JANUS_COMMAND_CHANNELS.analyze)(undefined, payload)
    ).resolves.toBeNull()
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('hides Electron events and removes each exact registered listener', () => {
    const analysisCallback = vi.fn()
    const analysisPayload = {
      blueprintId: 'bp-1',
      workspacePath: 'C:\\repo',
      nodeId: 'node-1',
      nodeTitle: 'Node',
      applied: true,
      result: {
        schemaVersion: 1,
        progress: 100,
        status: 'done',
        summary: 'done',
        confidence: 1,
        evidence: [],
        unresolved: [],
        discoveredRequirements: [],
        featureUpdates: [],
        newFeatureRequirements: [],
      },
      createdAt: '2026-07-17T00:00:00.000Z',
    } satisfies IslandAnalysisEvent
    const discoveredCallback = vi.fn()
    const discoveredPayload = {
      blueprintId: 'bp-1',
      workspacePath: 'C:\\repo',
      nodeId: 'node-1',
      nodeTitle: 'Node',
      discovered: [],
      createdAt: '2026-07-17T00:00:00.000Z',
    } satisfies IslandDiscoveredEvent

    const unsubscribeAnalysis = janusApi.onAnalysisResult(analysisCallback)
    const [, analysisListener] = mocks.on.mock.calls[0]
    analysisListener({ sender: 'electron' }, analysisPayload)
    unsubscribeAnalysis()

    const unsubscribeDiscovered = janusApi.onDiscovered(discoveredCallback)
    const [, discoveredListener] = mocks.on.mock.calls[1]
    discoveredListener({ sender: 'electron' }, discoveredPayload)
    unsubscribeDiscovered()

    expect(analysisCallback).toHaveBeenCalledWith(analysisPayload)
    expect(discoveredCallback).toHaveBeenCalledWith(discoveredPayload)
    expect(mocks.removeListener.mock.calls).toEqual([
      [JANUS_EVENT_CHANNELS.analysis, analysisListener],
      [JANUS_EVENT_CHANNELS.discovered, discoveredListener],
    ])
  })

  it('does not expose generic bridges', () => {
    const exposed = mocks.expose.mock.calls[0]?.[0]
    expect(exposed).not.toHaveProperty('invoke')
    expect(exposed).not.toHaveProperty('send')
    expect(exposed).not.toHaveProperty('on')
  })
})
