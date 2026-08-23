import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { llmService } from '../llm/LlmService'
import { emptySharedState, type AdvanceRoundInput, type CreateRoundtableInput, type RoundtableMessage, type RoundtableProgressEvent, type RoundtableRole, type RoundtableSession, type RoundtableSharedState, type RoundtableWorkspaceDependency, type UpdateRoundtableWorkspacesInput } from '../../shared/ipc/janus-roundtable'
import { roundtableStore } from './roundtable-store'
import { workspaceAgentRuntime } from '../agent/runtime/runtime'
import { createWorkspaceChatTools } from '../llm/workspace-chat-tools'
import { createLoopToolsFromVercel, createVercelModelTools, createVercelStream, runJanusAgentLoop, type JanusAgentMessage } from '../agent/loop'

export type RoundtableTextGenerator = (role: 'agent-1' | 'agent-2' | 'host', prompt: string, input: RoundtableSession) => Promise<string>
export type RoundtableProgressListener = (event: RoundtableProgressEvent) => void
const defaultGenerate: RoundtableTextGenerator = async (_role, prompt, input) => {
  const config = input.providerId
    ? { provider: await llmService.getProviderSettings(input.providerId).then((settings) => settings ? { id: input.providerId! } : null), modelId: input.modelId }
    : await llmService.getDefaultModel()
  if (!config?.provider) return '未配置模型，暂无法生成本轮发言。'
  const model = await llmService.getLanguageModel(config.provider.id, input.modelId || config.modelId || '')
  const dependencies = input.workspaces ?? (input.workspaceId && input.workspacePath ? [{ workspaceId: input.workspaceId, workspacePath: input.workspacePath, workspaceName: input.workspaceId }] : [])
  const runtimeSessions = await Promise.all(dependencies.map((workspace) => workspaceAgentRuntime.createSession({ workspaceId: workspace.workspaceId, workspaceRoot: workspace.workspacePath })))
  try {
    const resources = new Map(dependencies.map((workspace, index) => [workspace.workspaceId, { sessionId: runtimeSessions[index].id, workspaceRoot: workspace.workspacePath, workspaceName: workspace.workspaceName }]))
    const workspaceTools = createWorkspaceChatTools({ runtime: workspaceAgentRuntime, resources, callerId: `roundtable:${input.id}` })
    const readOnlyNames = new Set(['workspace_list', 'workspace_search', 'workspace_read', 'project_detect', 'project_list_processes', 'project_process_output', 'git_status', 'git_log', 'git_diff'])
    const readOnlyTools = Object.fromEntries(Object.entries(workspaceTools).filter(([name]) => readOnlyNames.has(name)))
    const result = await runJanusAgentLoop([{ role: 'user', content: prompt }], {
      tools: createLoopToolsFromVercel(readOnlyTools),
      stream: createVercelStream({ model, tools: createVercelModelTools(readOnlyTools) }),
      maxTurns: 4,
    })
    return [...result].reverse().find((message: JanusAgentMessage) => message.role === 'assistant')?.content || ''
  } finally {
    await Promise.all(runtimeSessions.map(async (runtimeSession) => {
      if (workspaceAgentRuntime.getSession(runtimeSession.id)?.status === 'running') await workspaceAgentRuntime.cancelSession(runtimeSession.id).catch(() => undefined)
    }))
  }
}

function statePrompt(state: RoundtableSharedState): string { return JSON.stringify(state, null, 2) }
function sessionContext(session: RoundtableSession): string {
  const dependencies = session.workspaces?.length
    ? session.workspaces.map((workspace) => `- ${workspace.workspaceName}: workspaceId=${workspace.workspaceId}, root=${workspace.workspacePath}`).join('\n')
    : session.workspaceId && session.workspacePath
      ? `- workspaceId=${session.workspaceId}, root=${session.workspacePath}`
      : ''
  const workspace = dependencies
    ? `Attached read-only workspace dependencies:\n${dependencies}\nUse these projects as the evidence boundaries for the discussion.`
    : 'No workspace dependency is attached. Do not make project-specific claims without evidence.'
  return `${workspace}\nShared structured state:\n${statePrompt(session.sharedState)}`
}
function message(session: RoundtableSession, role: RoundtableMessage['role'], content: string): RoundtableMessage {
  return { id: randomUUID(), role, round: session.currentRound, content, createdAt: Date.now() }
}
function appendUnique(items: string[], value: string): string[] {
  const normalized = value.trim()
  return normalized && !items.includes(normalized) ? [...items, normalized] : items
}
function mergeState(state: RoundtableSharedState, outputs: string[]): RoundtableSharedState {
  const [proposal, review, summary] = outputs
  return {
    ...state,
    version: state.version + 1,
    proposals: proposal ? appendUnique(state.proposals, proposal) : state.proposals,
    openIssues: review ? appendUnique(state.openIssues, review) : state.openIssues,
    risks: review ? appendUnique(state.risks, review) : state.risks,
    resolvedIssues: summary ? appendUnique(state.resolvedIssues, summary) : state.resolvedIssues,
  }
}
function normalizeWorkspaces(workspaces: RoundtableWorkspaceDependency[]): RoundtableWorkspaceDependency[] {
  const seen = new Set<string>()
  return workspaces.filter((workspace) => {
    if (!workspace?.workspaceId?.trim() || !workspace.workspacePath?.trim() || seen.has(workspace.workspaceId)) return false
    seen.add(workspace.workspaceId)
    return true
  }).slice(0, 12).map((workspace) => ({
    workspaceId: workspace.workspaceId.trim(),
    workspacePath: workspace.workspacePath.trim(),
    workspaceName: workspace.workspaceName?.trim() || workspace.workspaceId.trim(),
  }))
}
export class RoundtableOrchestrator {
  constructor(
    private readonly generate: RoundtableTextGenerator = defaultGenerate,
    private readonly store: Pick<typeof roundtableStore, 'get' | 'save'> = roundtableStore,
  ) {}
  async create(input: CreateRoundtableInput): Promise<RoundtableSession> {
    if (!input.topic?.trim()) throw new Error('Roundtable topic is required')
    const workspaces = normalizeWorkspaces(input.workspaces ?? (input.workspaceId && input.workspacePath ? [{ workspaceId: input.workspaceId, workspacePath: input.workspacePath, workspaceName: input.workspaceId }] : []))
    if (workspaces.length === 0) throw new Error('A workspace is required for roundtable analysis')
    const now = Date.now()
    const session: RoundtableSession = { id: randomUUID(), title: input.title?.trim() || input.topic.trim().slice(0, 80), topic: input.topic.trim(), status: 'active', currentRound: 0, createdAt: now, updatedAt: now, workspaces, workspaceId: workspaces[0].workspaceId, workspacePath: workspaces[0].workspacePath, providerId: input.providerId, modelId: input.modelId, messages: [{ id: randomUUID(), role: 'user', round: 0, content: input.topic.trim(), createdAt: now }], sharedState: { ...emptySharedState(), requirements: [input.topic.trim()] } }
    await this.store.save(session)
    return session
  }
  async updateWorkspaces(input: UpdateRoundtableWorkspacesInput): Promise<RoundtableSession> {
    const session = await this.store.get(input.sessionId)
    if (!session) throw new Error('Roundtable session not found')
    const workspaces = normalizeWorkspaces(input.workspaces)
    if (workspaces.length === 0) throw new Error('A workspace is required for roundtable analysis')
    session.workspaces = workspaces
    session.workspaceId = workspaces[0].workspaceId
    session.workspacePath = workspaces[0].workspacePath
    session.updatedAt = Date.now()
    await this.store.save(session)
    return session
  }
  async advance(input: AdvanceRoundInput, onProgress?: RoundtableProgressListener): Promise<RoundtableSession> {
    const session = await this.store.get(input.sessionId)
    if (!session) throw new Error('Roundtable session not found')
    if (session.status !== 'active') throw new Error('Roundtable session has ended')
    session.currentRound += 1
    const progress = (role: RoundtableProgressEvent['role'], state: RoundtableProgressEvent['state'], completedMessage?: RoundtableMessage) => onProgress?.({ sessionId: session.id, round: session.currentRound, role, state, ...(completedMessage ? { message: completedMessage } : {}) })
    if (input.userInput?.trim()) {
      const userMessage = message(session, 'user', input.userInput.trim())
      session.messages.push(userMessage)
      session.sharedState = { ...session.sharedState, version: session.sharedState.version + 1, requirements: [...session.sharedState.requirements, input.userInput.trim()] }
      progress('user', 'idle', userMessage)
    }
    const context = sessionContext(session)
    const publish = async (role: Exclude<RoundtableRole, 'user'>, content: string) => {
      const completedMessage = message(session, role, content)
      session.messages.push(completedMessage)
      session.updatedAt = Date.now()
      progress(role, 'idle', completedMessage)
      await this.store.save(session)
    }
    progress('agent-1', 'working')
    const proposal = await this.generate('agent-1', `你是 Agent-1 议题解决者。回应已有审查问题，同时继续提出新方案。共享状态：\n${context}`, session)
    await publish('agent-1', proposal)
    progress('agent-2', 'working')
    const review = await this.generate('agent-2', `你是 Agent-2 议题完善者。审查 Agent-1，并指出不足与完善建议。${sessionContext(session)}\nAgent-1：${proposal}`, session)
    await publish('agent-2', review)
    progress('host', 'working')
    const host = await this.generate('host', `你是 JanusX 主持人。仅根据共享状态和本轮两段发言，去重并结构化整理。输出摘要。${sessionContext(session)}\nAgent-1：${proposal}\nAgent-2：${review}`, session)
    await publish('host', host)
    session.sharedState = mergeState(session.sharedState, [proposal, review, host]); session.updatedAt = Date.now()
    await this.store.save(session)
    return session
  }
  async end(sessionId: string): Promise<RoundtableSession> {
    const session = await this.store.get(sessionId)
    if (!session) throw new Error('Roundtable session not found')
    if (session.status === 'ended') return session
    const conclusion = await this.generate('host', `请最终整理圆桌会议，输出结论、分歧、风险和行动项。${sessionContext(session)}`, session)
    session.finalResult = { conclusion, sharedState: session.sharedState, generatedAt: Date.now() }; session.status = 'ended'; session.updatedAt = Date.now()
    await this.store.save(session)
    return session
  }
}
export const roundtableOrchestrator = new RoundtableOrchestrator()

export function serializeRoundtableMarkdown(session: RoundtableSession): string {
  const result = session.finalResult
  return `# ${session.title}\n\n- 主题：${session.topic}\n- 状态：${session.status}\n- 轮次：${session.currentRound}\n- 生成时间：${new Date((result?.generatedAt ?? session.updatedAt)).toISOString()}\n\n## 最终结论\n\n${result?.conclusion ?? '会议尚未结束。'}\n\n## 共享结构化数据\n\n${JSON.stringify(result?.sharedState ?? session.sharedState, null, 2)}\n\n## 讨论记录\n\n${session.messages.map(item => `### ${item.role} · 第 ${item.round} 轮\n\n${item.content}`).join('\n\n')}\n`
}
export async function exportRoundtableMarkdown(sessionId: string, directory: string, fileName?: string) {
  const session = await roundtableStore.get(sessionId)
  if (!session) throw new Error('Roundtable session not found')
  const safeName = (fileName?.trim() || `${session.title}-${new Date().toISOString().slice(0, 10)}.md`).replace(/[<>:"/\\|?*]/g, '-')
  await mkdir(directory, { recursive: true }); const filePath = join(directory, safeName)
  const content = serializeRoundtableMarkdown(session); await writeFile(filePath, content, 'utf8'); return { filePath, content }
}
