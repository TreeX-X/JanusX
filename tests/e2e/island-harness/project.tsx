import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { JanusChatProvider, useJanusChatController, useOptionalJanusChatController } from '../../../src/renderer/src/components/janus/JanusChatProvider'
import { JanusChat } from '../../../src/renderer/src/components/janus/JanusChat'
import { BlueprintMaintenancePanel } from '../../../src/renderer/src/components/blueprint/BlueprintMaintenancePanel'
import { HarnessRunPanel } from '../../../src/renderer/src/components/janus/HarnessRunPanel'
import { useBlueprintStore } from '../../../src/renderer/src/stores/blueprint'
import { useWorkspaceStore } from '../../../src/renderer/src/stores/workspace'
import { installElectronApiFallback } from '../../../src/renderer/src/lib/electron-api-fallback'
import { changeLanguage, initI18n } from '../../../src/renderer/src/i18n'
import type { ChatAgentEvent, ChatStreamRequest } from '../../../src/shared/ipc/llm'
import type { HarnessTaskDraft } from '../../../src/shared/ipc/harness'
import '../../../src/renderer/src/styles/globals.css'
import '../../../src/renderer/src/components/janus/janus-island.css'
import '../../../src/renderer/src/components/blueprint/blueprint.css'

installElectronApiFallback()
Object.assign(window.electron.system, { getLanguage: async () => 'en', setLanguage: async () => undefined })
const repoId = '8fa19f17-c717-43a8-93a7-810a5e0cbc91'
const id = '44444444-4444-4333-8333-444444444444'
const uri = `note://${repoId}/${id}`
const workspace = { id: 'ws', path: 'C:/fixture', name: 'Project', clis: [], layout: { mode: 'tabs', positions: [] } }
const blueprint = { id: `harness:project:${repoId}`, source: 'harness', name: 'Project', rootNodeId: id, nodeIds: [id], nodes: { [id]: { id, title: 'Task', sourceUri: uri, sourceHash: 'a'.repeat(64), children: [] } } }
useWorkspaceStore.setState({ workspaces: [workspace] as never, activeWorkspaceId: 'ws' })
useBlueprintStore.setState({ currentBlueprint: blueprint as never, activeSession: { workspacePath: workspace.path } as never })
const events = new Set<(event: ChatAgentEvent) => void>()
const runtimeEvents = new Set<(event: any) => void>()
const fixture = {
  streams: [] as ChatStreamRequest[], aborts: 0, steers: 0, answers: 0, approvals: 0, adoptions: 0,
  prepares: 0, starts: 0, executes: 0, runAborts: 0, pauses: 0, resumes: 0, rebaselines: 0, takeovers: 0, threadCloses: 0, reviews: 0, finishes: 0, repairs: 0, undoPreviews: 0, undoApplies: 0,
  gateExecute: false, gateResolve: null as null | (() => void),
  lastExecute: null as null | { runId: string; providerId?: string; modelId?: string; manualEvidence?: Array<{ stepId: string; observer: string; observation: string }> },
  runs: [] as Array<{ runId: string; taskUri: string; mode: string; state: string; attempt: number; executor: string; closeout: string; receipts: number; updatedAt: string; local: boolean }>,
}
;(window as any).projectFixture = fixture
const emit = (event: ChatAgentEvent) => events.forEach((listener) => listener(event))
const emitRuntime = (event: unknown) => runtimeEvents.forEach((listener) => listener(event))
Object.assign(window.electron.workspace, { list: async () => [workspace] })
Object.assign(window.electron.janus, { listMaintenanceTasks: async () => [], listMaintenanceAudits: async () => [] })
Object.assign(window.electron, { janusChat: {
  load: async () => JSON.parse(localStorage.getItem('project-conversations') ?? 'null'),
  save: async (snapshot: unknown) => localStorage.setItem('project-conversations', JSON.stringify(snapshot)),
} })
Object.assign(window.electron.agentRuntime, {
  createSession: async () => ({ id: 'session', status: 'running', workspace: { workspaceId: 'ws', workspaceRoot: workspace.path } }),
  cancelSession: async () => true,
  setApprovalMode: async () => true,
  onEvent: (listener: (event: unknown) => void) => { runtimeEvents.add(listener); return () => runtimeEvents.delete(listener) },
  resolveApproval: async () => {
    fixture.approvals++
    emitRuntime({ type: 'tool-started', sessionId: 'session', workspaceId: 'ws', toolName: 'workspace.edit', correlationId: 'call', input: {}, timestamp: Date.now() })
    return true
  },
})
Object.assign(window.electron.llm, {
  getTerminalProviders: async () => [{ id: 'p', name: 'Fixture' }],
  getTerminalDefault: async () => ({ provider: { id: 'p', name: 'Fixture' }, modelId: 'model-a' }),
  listModels: async () => [{ id: 'model-a', name: 'Model A' }, { id: 'model-b', name: 'Model B' }],
  onAgentEvent: (listener: (event: ChatAgentEvent) => void) => { events.add(listener); return () => events.delete(listener) },
  startChatStream: (request: ChatStreamRequest) => { fixture.streams.push(request); queueMicrotask(() => emit({ type: 'text_delta', requestId: request.requestId, delta: 'Project reply in progress' })) },
  abortChat: async () => { fixture.aborts++ },
  steerChat: async () => { fixture.steers++; return { accepted: true } },
  answerQuestion: async ({ requestId, callId }: { requestId: string; callId: string }) => { fixture.answers++; emit({ type: 'question_resolved', requestId, callId, status: 'answered' }); return { accepted: true } },
})
let draft: HarnessTaskDraft = { uri, hash: 'a'.repeat(64), lifecycle: 'draft', repoId, hasExecution: false, contract: { scope: 'Implement the value.', criteria: [{ id: 'AC-1', text: 'TBD' }], work: { scope: [{ repoId, paths: [] }], acceptanceRefs: [], verification: [] } } }
Object.assign(window.electron.harness, {
  taskRead: async () => draft,
  taskAdopt: async (_cwd: string, _uri: string, _hash: string, contract: HarnessTaskDraft['contract']) => {
    fixture.adoptions++
    contract.work.verification.push({ id: 'V-manual', kind: 'manual', required: true, repoId, cwd: '.', description: 'Eyeball the value.' })
    draft = { ...draft, hash: 'b'.repeat(64), lifecycle: 'accepted', contract }
    return draft
  },
  runList: async () => fixture.runs,
  runPrepare: async (_cwd: string, input: { taskUri: string; mode: string; closeout: string; executor?: string }) => {
    fixture.prepares++
    fixture.runs.push({ runId: 'run-1', taskUri: input.taskUri, mode: input.mode, state: 'queued', attempt: 0, executor: input.executor ?? 'internal', closeout: input.closeout, receipts: 0, updatedAt: '', local: true, repairBudget: { maxAuto: 1, usedAuto: 0 } })
    return { runId: 'run-1', taskUri: input.taskUri, state: 'queued', attempt: 0 }
  },
  runStart: async (_cwd: string, runId: string) => {
    fixture.starts++
    const run = fixture.runs.find((item) => item.runId === runId)!
    run.state = 'verifying'
    run.attempt += 1
    return { attempt: run.attempt }
  },
  runStatus: async (_cwd: string, runId: string) => fixture.runs.find((item) => item.runId === runId),
  runCancel: async (_cwd: string, runId: string) => {
    fixture.runs.find((item) => item.runId === runId)!.state = 'cancelled'
    return { state: 'cancelled' }
  },
  runCloseout: async () => ({ satisfied: true, detail: 'run-1 committed' }),
  runHandoff: async () => ({ path: 'C:/fixture/handoff.md' }),
  runExecute: async (_cwd: string, input: NonNullable<typeof fixture.lastExecute>) => {
    fixture.executes++
    fixture.lastExecute = input
    if (fixture.gateExecute) await new Promise<void>((resolve) => { fixture.gateResolve = resolve })
    const run = fixture.runs.find((item) => item.runId === input.runId)!
    run.state = 'done'
    run.receipts = 1
    return { receiptId: 'receipt-1', completed: true, checks: [{ id: 'V-1', kind: 'command', status: 'passed', summary: 'exit 0' }] }
  },
  runPause: async (_cwd: string, runId: string) => {
    fixture.pauses++
    fixture.runs.find((item) => item.runId === runId)!.state = 'paused'
    return { state: 'paused' }
  },
  runResume: async (_cwd: string, runId: string) => {
    fixture.resumes++
    fixture.runs.find((item) => item.runId === runId)!.state = 'running'
    return { state: 'running' }
  },
  runRebaseline: async (_cwd: string, runId: string) => {
    fixture.rebaselines++
    fixture.runs.find((item) => item.runId === runId)!.state = 'queued'
    return { state: 'queued' }
  },
  runAbort: async () => {
    fixture.runAborts++
    return { state: 'running' }
  },
  runHandoffRead: async (_cwd: string, runId: string) => {
    const run = fixture.runs.find((item) => item.runId === runId)!
    return { path: 'C:/fixture/handoff.md', markdown: `# Harness run handoff\n\ntask: ${run.taskUri}\nmode: ${run.mode}\ncontract: fixed-baseline\n` }
  },
  runTakeover: async (_cwd: string, runId: string, newOwner: string) => {
    fixture.takeovers++
    const run = fixture.runs.find((item) => item.runId === runId)!
    run.state = 'running'
    return { state: run.state, owner: newOwner }
  },
  runReview: async (_cwd: string, input: { runId: string; reviewer: string }) => {
    fixture.reviews++
    const run = fixture.runs.find((item) => item.runId === input.runId)!
    run.receipts = 1
    return { receiptId: 'r-ind', verdict: 'needs-fix' }
  },
  runFinish: async (_cwd: string, runId: string) => {
    fixture.finishes++
    const run = fixture.runs.find((item) => item.runId === runId)!
    run.state = 'done'
    return { receiptId: 'r-ind', completed: true }
  },
  runRepair: async (_cwd: string, input: { runId: string }) => {
    fixture.repairs++
    const run = fixture.runs.find((item) => item.runId === input.runId)!
    run.state = 'running'
    run.attempt += 1
    run.repairBudget.usedAuto += 1
    return { attempt: run.attempt, state: run.state }
  },
  undoPreview: async () => {
    fixture.undoPreviews++
    return { txId: 'tx-1', changeSetId: 'cs-1', revision: 1, files: [{ operationId: 'op-1', relPath: '.agents/notes/a.md', status: 'reversible', beforeHash: 'b', afterHash: 'a' }], reversible: true }
  },
  undoApply: async () => {
    fixture.undoApplies++
    return { txId: 'tx-2', reverted: ['.agents/notes/a.md'] }
  },
  runThreads: async () => fixture.runs.map((run) => {
    const detail = (fixture as { threadDetails?: Record<string, { model: { providerId: string; modelId: string }; history: Array<{ attempt: number; manifestHash: string; checks: never[]; reviewVerdict: string; receiptId: string; at: string }> }> }).threadDetails?.[run.runId]
    return { runId: run.runId, taskUri: run.taskUri, mode: run.mode, state: run.state, attempt: run.attempt, receipts: run.receipts, updatedAt: '', hasThread: Boolean(detail), attempts: detail ? 1 : 0, lastVerdict: detail?.history[0]?.reviewVerdict, hasModel: Boolean(detail?.model) }
  }),
  runThread: async (_cwd: string, runId: string) => {
    const holder = fixture as unknown as { threadDetails: Record<string, { model: { providerId: string; modelId: string }; history: Array<{ attempt: number; manifestHash: string; checks: never[]; reviewVerdict: string; receiptId: string; at: string }> }> }
    holder.threadDetails ??= {}
    holder.threadDetails[runId] ??= { model: { providerId: 'p', modelId: 'm' }, history: [{ attempt: 1, manifestHash: 'h', checks: [], reviewVerdict: 'approved', receiptId: 'receipt-1', at: '' }] }
    const run = fixture.runs.find((item) => item.runId === runId)!
    const detail = holder.threadDetails[runId]!
    return { runId, taskUri: run.taskUri, mode: run.mode, state: run.state, attempt: run.attempt, receipts: run.receipts, updatedAt: '', hasThread: true, attempts: 1, lastVerdict: 'approved', hasModel: true, model: detail.model, history: detail.history }
  },
  runThreadClose: async (_cwd: string, runId: string) => {
    fixture.threadCloses++
    const holder = fixture as unknown as { threadDetails?: Record<string, unknown> }
    if (holder.threadDetails) delete holder.threadDetails[runId]
    return { closed: true }
  },
})

function App() {
  const chat = useJanusChatController()
  const projectChat = useOptionalJanusChatController({ ownerRepoId: repoId, viewId: blueprint.id })
  const [open, setOpen] = useState(true)
  return <main>
    <button onClick={() => setOpen((value) => !value)}>Toggle blueprint</button>
    <button onClick={() => chat.selectModel('p', 'model-b')}>Choose model B</button>
    <button onClick={() => chat.createConversation()}>New personal chat</button>
    <button onClick={() => projectChat && chat.selectConversation(projectChat.conversationId)}>Return to project</button>
    <button onClick={() => {
      const request = fixture.streams.at(-1)!
      emit({ type: 'question_requested', requestId: request.requestId, callId: 'q1', allowCustom: true, questions: [{ id: 'choice', header: 'Scope', question: 'Which scope?', options: [{ label: 'Selected', description: 'Current task' }, { label: 'All', description: 'Whole project' }] }] })
    }}>Ask question</button>
    <button onClick={() => emitRuntime({ type: 'approval-requested', request: {
      id: 'approval', sessionId: 'session', workspaceId: 'ws', toolName: 'workspace.edit',
      input: {}, correlationId: 'call', evidenceConfidence: 'medium', actionRisk: 'write',
      approvalPolicy: 'per-action', reasonCode: 'ACTION_REQUIRES_APPROVAL', createdAt: new Date().toISOString(),
    } })}>Ask approval</button>
    <output data-testid="controller" data-id={chat.conversationId} data-model={chat.activeModel?.modelId} data-streaming={chat.isStreaming} data-questions={chat.pendingQuestions.length} />
    <output data-testid="project-controller" data-id={projectChat?.conversationId} data-streaming={projectChat?.isStreaming} />
    <div className="fixture-layout">
      <section data-testid="main-chat"><JanusChat visible docked compactNavigation focused={!open} modeColor="#318b78" messages={chat.messages} pendingContent={chat.pendingContent} isStreaming={chat.isStreaming} error={chat.error} modelOptions={chat.modelOptions} activeModel={chat.activeModel} resourceController={chat.resourceController} conversationController={chat} onSelectModel={chat.selectModel} onSend={chat.send} onRewrite={chat.rewrite} onStop={chat.stop} onRetry={chat.retry} onClear={chat.clear} /></section>
      {open ? <section data-testid="blueprint-chat"><BlueprintMaintenancePanel onClose={() => setOpen(false)} /></section> : null}
      <section data-testid="task"><HarnessRunPanel cwd={workspace.path} taskUri={uri} /></section>
    </div>
  </main>
}
async function boot() {
  await initI18n(); await changeLanguage('en')
  ReactDOM.createRoot(document.getElementById('root')!).render(<JanusChatProvider><App /></JanusChatProvider>)
}
void boot()
