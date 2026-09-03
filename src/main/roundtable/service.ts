import type { RoundtableEventEnvelope, RoundtableState, RoundtableWorkspaceResource } from '../../shared/roundtable/events'
import { exportRoundtableMarkdown } from '../../shared/roundtable/export'
import { markInterrupted, migrateRoundtableState } from '../../shared/roundtable/state'
import { defaultRoundtableWorkflow } from '../../shared/roundtable/workflow-template'
import { RoundtableRuntime } from './runtime'
import { llmService } from '../llm/LlmService'
import { generateText } from '../llm/ai-runtime'
import { roundtableStore } from './store'
import { app } from 'electron'
import { join } from 'node:path'
import { resolveRegisteredWorkspace } from '../companion/workspace-registry'
import { z } from 'zod'

export class RoundtableService {
  private readonly sessions = new Map<string, RoundtableRuntime>()
  private readonly listeners = new Set<(event: RoundtableEventEnvelope) => void>()

  onEvent(listener: (event: RoundtableEventEnvelope) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  async start(input: string | { prompt: string; workspaceResources?: RoundtableWorkspaceResource[]; toolTimeoutMs?: number }): Promise<RoundtableState> {
    const runtime = this.createRuntime(typeof input === 'object' && input.toolTimeoutMs !== undefined ? { toolTimeoutMs: input.toolTimeoutMs } : undefined)
    const value = typeof input === 'string' ? { prompt: input } : input
    const resources = []
    for (const resource of value.workspaceResources ?? []) {
      const registered = await resolveRegisteredWorkspace(join(app.getPath('userData'), 'janusx', 'workspaces'), resource.workspaceId)
      resources.push({ workspaceId: registered.id, workspaceName: registered.name, workspacePath: registered.path })
    }
    const state = await runtime.start({ prompt: value.prompt, workspaceResources: resources })
    this.sessions.set(state.sessionId!, runtime)
    return state
  }

  private createRuntime(options?: { toolTimeoutMs?: number }): RoundtableRuntime {    const agents = Object.fromEntries(defaultRoundtableWorkflow.participants.flatMap((spec) => spec.instances).map((participant) => [participant.id, {
      run: async ({ userInput, priorCards, priorFacts, workspaceResources, workspaceContext, workspaceTools }: { userInput?: string; priorCards: any[]; priorFacts?: any[]; workspaceResources?: RoundtableWorkspaceResource[]; workspaceContext?: string; workspaceTools?: { execute(name: 'workspace.list' | 'workspace.read' | 'workspace.readRange', input: Record<string, unknown>): Promise<unknown> } }) => {
        const fallback = `${participant.role} reviewed "${userInput ?? 'the shared state'}" with ${priorCards.length} prior results.`
        try {
          const target = await llmService.getDefaultModel()
          if (!target) return fallback
          const model = await llmService.getLanguageModel(target.provider.id, target.modelId)
          const roleInstruction = participant.role === 'refiner'
            ? 'Propose a concrete improvement and implementation path.'
            : participant.role === 'challenger'
              ? 'Identify gaps, risks, and assumptions that need validation.'
              : 'Synthesize the discussion into a concise host summary. Start with a one-sentence conclusion, then list open points.'
          const workspaceId = z.string().min(1).refine((id) => (workspaceResources ?? []).some((resource) => resource.workspaceId === id), 'Workspace is not attached to this roundtable')
          const tools = workspaceTools ? {
            workspace_list: { description: 'List a bounded non-sensitive tree in an attached workspace.', parameters: z.object({ workspaceId, path: z.string().default(''), depth: z.number().int().min(0).max(4).default(2), maxEntries: z.number().int().min(1).max(1000).default(200) }), execute: (input: Record<string, unknown>) => workspaceTools.execute('workspace.list', input) },
            workspace_read: { description: 'Read a bounded UTF-8 file from an attached workspace and return its content and SHA-256.', parameters: z.object({ workspaceId, path: z.string().min(1), maxBytes: z.number().int().min(1).max(256 * 1024).default(128 * 1024) }), execute: (input: Record<string, unknown>) => workspaceTools.execute('workspace.read', input) },
            workspace_read_range: { description: 'Read a bounded byte range from a UTF-8 file in an attached workspace and return its content and SHA-256.', parameters: z.object({ workspaceId, path: z.string().min(1), offset: z.number().int().min(0), maxBytes: z.number().int().min(1).max(256 * 1024).default(64 * 1024) }), execute: (input: Record<string, unknown>) => workspaceTools.execute('workspace.readRange', input) },
          } : undefined
          const result = await generateText({ model: model as any, maxSteps: 6, tools, messages: [
            { role: 'system', content: `You are the ${participant.role} in a structured roundtable. ${roleInstruction} Use workspace tools when a claim requires file evidence. Treat unread paths and unsupported claims as pending validation. Return concise markdown.` },
            { role: 'user', content: `Topic: ${userInput ?? 'Continue from shared state'}\nWorkspace resources (read-only context):\n${(workspaceResources ?? []).map((resource) => `${resource.workspaceName}: ${resource.workspacePath}`).join('\n') || 'None attached'}\nWorkspace evidence:\n${workspaceContext || 'No readable workspace evidence attached.'}\nShared facts:\n${(priorFacts ?? []).map((fact) => `[${fact.status}] ${fact.title}: ${fact.content}`).join('\n')}\nPrior results:\n${priorCards.map((card) => card.summary ?? '').join('\n')}` },
          ] })
          return result.text?.trim() || fallback
        } catch {
          return fallback
        }
      },
    }]))
    const runtime = new RoundtableRuntime(agents, defaultRoundtableWorkflow, {
      ...(options?.toolTimeoutMs !== undefined ? { toolTimeoutMs: options.toolTimeoutMs } : {}),
      resolveWorkspace: async (workspaceId: string) => {
        const registered = await resolveRegisteredWorkspace(join(app.getPath('userData'), 'janusx', 'workspaces'), workspaceId)
        return { path: registered.path, name: registered.name }
      },
    })
    runtime.onEvent((event) => {
      void roundtableStore.append(event.sessionId, event, runtime.getState()); this.listeners.forEach((listener) => listener(event))
    })
    return runtime
  }

  advance(sessionId: string, input = '', requestId?: string): Promise<RoundtableState> { return this.require(sessionId).advance(input, requestId) }
  end(sessionId: string): RoundtableState { return this.require(sessionId).end() }
  getState(sessionId: string): RoundtableState | null { return this.sessions.get(sessionId)?.getState() ?? null }
  exportMarkdown(sessionId: string): string {
    return exportRoundtableMarkdown(this.require(sessionId).getState())
  }
  async restore(sessionId: string): Promise<RoundtableState | null> {
    const saved = await roundtableStore.load(sessionId)
    if (!saved) return null
    const runtime = this.createRuntime()
    // Old journal lines predate newer fields; a snapshot persisted mid-round
    // (crash/restart) is demoted to awaiting-user so the user can review and
    // advance instead of getting stuck in a running state nobody owns.
    runtime.hydrate(markInterrupted(migrateRoundtableState(saved.state)))
    this.sessions.set(sessionId, runtime)
    return runtime.getState()
  }
  private require(sessionId: string): RoundtableRuntime {
    const runtime = this.sessions.get(sessionId)
    if (!runtime) throw new Error(`Unknown roundtable session: ${sessionId}`)
    return runtime
  }
}

export const roundtableService = new RoundtableService()
