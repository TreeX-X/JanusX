import type { AgentEngine } from '../janus-runner/types'
import { configService } from '../config/service'
import {
  JANUSX_SYNTHETIC_HOOK_EVENTS,
  type AgentHookPayload,
  type RegisteredHookTerminal,
} from '../notifications/agent-hook-types'
import {
  matchesEngineEvents,
  normalizeHookEventName,
} from '../notifications/agent-engine-capabilities'
import { knowledgeCaptureInbox, type CaptureEntry } from './capture-inbox'
import { SerialQueue } from '../lib/atomic-file'
import { readKnowledgeTurn } from '../sessions/knowledge-transcript'
import { knowledgeObservationService } from './observation-service'
import { knowledgeProcessingQueue } from './processing-queue'
import { createHash, randomUUID } from 'node:crypto'
import { redactHighConfidenceSecrets } from '@janus-agent/agent-core'

interface ActiveTurn {
  id: string
  terminalId: string
  engine: AgentEngine
  workspaceId?: string
  workspacePath: string
  prompt?: string
  promptHash?: string
  sessionId?: string
  startedAt: string
  startedAtMs: number
}

interface TerminalContext extends RegisteredHookTerminal {
  cwd: string
}

export interface AgentTurnRecorderEvent {
  type: 'captured' | 'skipped' | 'failed'
  reason?: string
  terminalId?: string
  engine?: AgentEngine
  hookEvent: string
  workspaceId?: string
  workspacePath?: string
  observationId?: string
}

function normalizePath(value?: string): string | undefined {
  return value?.replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase() || undefined
}

function isStartEvent(payload: AgentHookPayload): boolean {
  return matchesEngineEvents(payload.source, 'start', payload.event, payload.raw)
}

function isCompletionEvent(payload: AgentHookPayload): boolean {
  return matchesEngineEvents(payload.source, 'complete', payload.event, payload.raw)
}

function isFailureEvent(payload: AgentHookPayload): boolean {
  if (
    payload.event === JANUSX_SYNTHETIC_HOOK_EVENTS.apiError ||
    payload.event === JANUSX_SYNTHETIC_HOOK_EVENTS.orphaned
  ) {
    return true
  }
  if (payload.source === 'opencode') return payload.event === 'session.error'
  return matchesEngineEvents(payload.source, 'fail', payload.event, payload.raw)
}

function isAttentionEvent(payload: AgentHookPayload): boolean {
  if (payload.source === 'opencode') return payload.event === 'permission.asked'
  return matchesEngineEvents(payload.source, 'attention', payload.event, payload.raw)
}

function hasText(value?: string): value is string {
  return Boolean(value?.trim())
}

function timestampToMs(timestamp?: string): number | undefined {
  if (!timestamp) return undefined
  const parsed = Date.parse(timestamp)
  return Number.isFinite(parsed) ? parsed : undefined
}

class AgentTurnRecorder {
  private readonly deliveryIds = new WeakMap<AgentHookPayload, string>()
  private readonly queue = new SerialQueue()
  private retryTimer?: ReturnType<typeof setInterval>
  private readonly terminals = new Map<string, TerminalContext>()
  private readonly activeTurns = new Map<string, ActiveTurn>()
  private eventSink?: (event: AgentTurnRecorderEvent) => void

  registerTerminal(terminal: TerminalContext): void {
    this.terminals.set(terminal.terminalId, terminal)
    if (!this.retryTimer) {
      this.retryTimer = setInterval(() => { void this.recover() }, 10000)
      this.retryTimer.unref()
      void this.recover()
    }
  }

  private async recover(): Promise<void> {
    try { if (await this.isEnabled()) await knowledgeCaptureInbox.drain() }
    catch (error) { console.warn('[knowledge] capture recovery failed:', error instanceof Error ? error.message : String(error)) }
  }

  setEventSink(sink?: (event: AgentTurnRecorderEvent) => void): void {
    this.eventSink = sink
    if (sink && !this.retryTimer) {
      this.retryTimer = setInterval(() => { void this.recover() }, 10000)
      this.retryTimer.unref()
      void this.recover()
    }
  }

  unregisterTerminal(terminalId: string): void {
    this.terminals.delete(terminalId)
    this.activeTurns.delete(terminalId)
  }

  dispose(): void {
    clearInterval(this.retryTimer)
    this.retryTimer = undefined
    this.terminals.clear()
    this.activeTurns.clear()
  }

  handleHookPayload(payload: AgentHookPayload): Promise<void> {
    const raw = payload.raw && typeof payload.raw === 'object' ? payload.raw as Record<string, unknown> : {}
    if (!payload.timestamp && !raw.event_id && !raw.eventId && !raw.message_id && !raw.tool_use_id && !raw.call_id) {
      let deliveryId = this.deliveryIds.get(payload)
      if (!deliveryId) { deliveryId = randomUUID(); this.deliveryIds.set(payload, deliveryId) }
      payload = { ...payload, raw: { ...raw, captureDeliveryId: deliveryId } }
    }
    return this.queue.run(() => this.recordHookPayload(payload)).catch((error) => {
      this.emit({
        type: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        terminalId: payload.terminalId,
        engine: payload.source,
        hookEvent: payload.event,
        workspaceId: payload.workspaceId,
        workspacePath: payload.cwd,
      })
      console.warn(
        '[knowledge] failed to record agent hook observation:',
        error instanceof Error ? error.message : String(error),
      )
    })
  }

  private async isEnabled(): Promise<boolean> {
    const [settings, flags] = await Promise.all([configService.getKnowledgeSettings(), configService.getExperimentalFeatures()])
    return settings.enabled && flags.knowledge
  }

  private eventId(payload: AgentHookPayload): string {
    const raw = payload.raw && typeof payload.raw === 'object' ? payload.raw as Record<string, unknown> : {}
    const identity = raw.event_id ?? raw.eventId ?? raw.message_id ?? raw.tool_use_id ?? raw.call_id ?? payload.timestamp ?? raw.captureDeliveryId
    return createHash('sha256').update(JSON.stringify([payload.source, payload.sessionId ?? payload.terminalId,
      payload.event, identity ?? payload.message ?? 'status'])).digest('hex')
  }

  private resolveTerminal(payload: AgentHookPayload): TerminalContext | null {
    if (payload.terminalId) {
      const terminal = this.terminals.get(payload.terminalId)
      if (terminal) return terminal.engine === payload.source ? terminal : null
    }

    const sameEngine = Array.from(this.terminals.values()).filter(
      (terminal) => terminal.engine === payload.source,
    )
    if (sameEngine.length === 0) return null

    const workspaceMatches = payload.workspaceId
      ? sameEngine.filter((terminal) => terminal.workspaceId === payload.workspaceId)
      : []
    if (workspaceMatches.length === 1) return workspaceMatches[0]

    const payloadCwd = normalizePath(payload.cwd)
    const cwdSource = workspaceMatches.length > 0 ? workspaceMatches : sameEngine
    const cwdMatches = payloadCwd
      ? cwdSource.filter((terminal) => normalizePath(terminal.cwd) === payloadCwd)
      : []
    if (cwdMatches.length === 1) return cwdMatches[0]

    return sameEngine.length === 1 ? sameEngine[0] : null
  }

  private async recordHookPayload(rawPayload: AgentHookPayload): Promise<void> {
    if (!(await this.isEnabled())) {
      this.emit({
        type: 'skipped',
        reason: 'knowledge-disabled',
        terminalId: rawPayload.terminalId,
        engine: rawPayload.source,
        hookEvent: rawPayload.event,
        workspaceId: rawPayload.workspaceId,
        workspacePath: rawPayload.cwd,
      })
      return
    }

    const payload = {
      ...rawPayload,
      event: normalizeHookEventName(rawPayload.source, rawPayload.event),
    }
    const terminal = this.resolveTerminal(payload)
    if (!terminal?.cwd) {
      this.emit({
        type: 'skipped',
        reason: 'terminal-not-found',
        terminalId: payload.terminalId,
        engine: payload.source,
        hookEvent: payload.event,
        workspaceId: payload.workspaceId,
        workspacePath: payload.cwd,
      })
      return
    }

    if (isStartEvent(payload)) {
      await this.recordStart(payload, terminal)
      return
    }

    if (isAttentionEvent(payload)) {
      await this.recordAttention(payload, terminal)
      return
    }

    if (isFailureEvent(payload)) {
      await this.recordEnd(payload, terminal, true)
      return
    }

    if (isCompletionEvent(payload)) {
      await this.recordEnd(payload, terminal, false)
      return
    }

    this.emit({
      type: 'skipped',
      reason: 'unsupported-hook-event',
      terminalId: terminal.terminalId,
      engine: terminal.engine,
      hookEvent: payload.event,
      workspaceId: terminal.workspaceId,
      workspacePath: terminal.cwd,
    })
  }

  private async recordStart(
    payload: AgentHookPayload,
    terminal: TerminalContext,
  ): Promise<void> {
    const activeTurn = this.activeTurns.get(terminal.terminalId)
    const promptHash = hasText(payload.message) ? createHash('sha256').update(payload.message).digest('hex') : undefined
    const eventId = this.eventId(payload)
    if (
      activeTurn &&
      (!hasText(payload.message) ||
        (payload.sessionId === activeTurn.sessionId && promptHash === activeTurn.promptHash && eventId === activeTurn.id))
    ) {
      return
    }

    const now = timestampToMs(payload.timestamp) ?? Date.now()
    const startedAt = new Date(now).toISOString()
    const turn: ActiveTurn = {
      id: eventId,
      terminalId: terminal.terminalId,
      engine: terminal.engine,
      workspaceId: terminal.workspaceId,
      workspacePath: terminal.cwd,
      prompt: payload.event === 'UserPromptSubmit' && payload.message ? redactHighConfidenceSecrets(payload.message).text : undefined,
      promptHash,
      sessionId: payload.sessionId,
      startedAt,
      startedAtMs: now,
    }
    this.activeTurns.set(terminal.terminalId, turn)

    // Only an actual prompt-submission hook carries the user's words. Status messages do not.
    const userPrompt = payload.event === 'UserPromptSubmit' && hasText(payload.message)
    const sourceEventId = eventId

    const [observation] = await knowledgeCaptureInbox.submit([{ input: {
      workspaceId: terminal.workspaceId,
      workspacePath: terminal.cwd,
      source: 'agent-stream',
      type: hasText(payload.message) ? 'conversation-turn' : 'system-event',
      content: hasText(payload.message)
        ? redactHighConfidenceSecrets(payload.message).text
        : `${terminal.engine} terminal task started`,
      summary: `${terminal.engine} terminal task started`,
      tags: ['terminal-hook', 'turn-started', terminal.engine],
      actor: userPrompt ? 'user' : terminal.engine,
      correlationId: turn.id,
      sessionId: payload.sessionId,
      agentId: terminal.engine,
      metadata: {
        terminalId: terminal.terminalId,
        engine: terminal.engine,
        hookEvent: payload.event,
        sessionId: payload.sessionId,
        startedAt,
      },
    }, context: { speaker: userPrompt ? 'user' : 'unknown', sourceEventId, createdAt: startedAt } }])
    this.emitCaptured(payload, terminal, observation.id)
  }

  private async recordAttention(
    payload: AgentHookPayload,
    terminal: TerminalContext,
  ): Promise<void> {
    const activeTurn = this.activeTurns.get(terminal.terminalId)
    const [observation] = await knowledgeCaptureInbox.submit([{ input: {
      workspaceId: terminal.workspaceId,
      workspacePath: terminal.cwd,
      source: 'agent-stream',
      type: 'system-event',
      content: payload.message?.trim() || `${terminal.engine} terminal needs attention`,
      summary: `${terminal.engine} terminal attention`,
      tags: ['terminal-hook', 'turn-attention', terminal.engine],
      actor: terminal.engine,
      correlationId: activeTurn?.id ?? `terminal:${terminal.terminalId}`,
      sessionId: payload.sessionId ?? activeTurn?.sessionId,
      agentId: terminal.engine,
      metadata: {
        terminalId: terminal.terminalId,
        engine: terminal.engine,
        hookEvent: payload.event,
        sessionId: payload.sessionId,
      },
    }, context: { speaker: 'system', sourceEventId: this.eventId(payload) } }])
    this.emitCaptured(payload, terminal, observation.id)
  }

  private async recordEnd(
    payload: AgentHookPayload,
    terminal: TerminalContext,
    failed: boolean,
  ): Promise<void> {
    let activeTurn = this.activeTurns.get(terminal.terminalId)
    if (payload.sessionId && activeTurn?.sessionId !== payload.sessionId) activeTurn = undefined
    if (!activeTurn && payload.sessionId) {
      const sessionRows = (await knowledgeObservationService.listAll(true)).filter(row => row.workspaceId === terminal.workspaceId
        && row.sessionId === payload.sessionId && row.agentId === terminal.engine)
      const closed = new Set(sessionRows.filter(row => (row.tags.includes('turn-completed') || row.tags.includes('turn-failed'))
        && row.sourceEvidence?.sourceEventId !== this.eventId(payload)).map(row => row.correlationId))
      const starts = sessionRows.filter(row => row.tags.includes('turn-started') && !closed.has(row.correlationId)
        && Date.parse(row.createdAt) <= (timestampToMs(payload.timestamp) ?? Date.now()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const start = starts[0]
      if (start?.correlationId) activeTurn = { id: start.correlationId, terminalId: terminal.terminalId, engine: terminal.engine,
        workspaceId: terminal.workspaceId, workspacePath: terminal.cwd, prompt: start.sourceEvidence?.speaker === 'user' ? await knowledgeObservationService.resolveContent(start) : undefined,
        sessionId: payload.sessionId, startedAt: start.createdAt, startedAtMs: Date.parse(start.createdAt) }
    }
    const endedAtMs = timestampToMs(payload.timestamp) ?? Date.now()
    const durationMs = activeTurn ? endedAtMs - activeTurn.startedAtMs : undefined
    const raw = payload.raw && typeof payload.raw === 'object' ? payload.raw as Record<string, unknown> : {}
    const transcriptPath = raw.transcript_path ?? raw.transcriptPath
    const supplemental = !failed && typeof transcriptPath === 'string'
      ? await readKnowledgeTurn(transcriptPath, terminal.engine, payload.sessionId ?? activeTurn?.sessionId, activeTurn?.prompt)
      : { messages: [], reason: failed ? 'turn-failed' : 'transcript-path-unavailable' }
    const correlationId = activeTurn?.id ?? this.eventId(payload)
    const entries: CaptureEntry[] = supplemental.messages
      .filter(message => !(message.speaker === 'user' && activeTurn?.prompt && redactHighConfidenceSecrets(message.content).text === activeTurn.prompt))
      .map((message, index) => ({ input: {
        workspaceId: terminal.workspaceId, workspacePath: terminal.cwd, source: 'agent-stream', type: 'conversation-turn',
        content: message.content, actor: message.speaker, sessionId: payload.sessionId ?? activeTurn?.sessionId,
        agentId: terminal.engine, correlationId, tags: ['terminal-transcript', 'turn-evidence', terminal.engine],
        metadata: { terminalId: terminal.terminalId, transcriptPath: typeof transcriptPath === 'string' ? transcriptPath : undefined,
          recordId: message.id, sourceOrder: index, sourceTimestamp: message.timestamp, completed: true },
      }, context: { speaker: message.speaker, sourceEventId: createHash('sha256').update(JSON.stringify([
        terminal.engine, payload.sessionId ?? activeTurn?.sessionId ?? transcriptPath, message.id])).digest('hex'),
        createdAt: new Date(endedAtMs).toISOString() } }))
    entries.push({ input: {
      workspaceId: terminal.workspaceId,
      workspacePath: terminal.cwd,
      source: 'agent-stream',
      type: hasText(payload.message) && !failed ? 'conversation-turn' : 'system-event',
      content: hasText(payload.message)
        ? payload.message
        : failed
          ? `${terminal.engine} terminal task failed`
          : `${terminal.engine} terminal task completed`,
      summary: failed
        ? `${terminal.engine} terminal task failed`
        : `${terminal.engine} terminal task completed`,
      tags: ['terminal-hook', failed ? 'turn-failed' : 'turn-completed', terminal.engine],
      actor: terminal.engine,
      correlationId,
      sessionId: payload.sessionId ?? activeTurn?.sessionId,
      agentId: terminal.engine,
      metadata: {
        terminalId: terminal.terminalId,
        engine: terminal.engine,
        hookEvent: payload.event,
        sessionId: payload.sessionId ?? activeTurn?.sessionId,
        startedAt: activeTurn?.startedAt,
        endedAt: new Date(endedAtMs).toISOString(),
        durationMs,
        failed,
        prompt: activeTurn?.prompt,
        evidenceStatus: supplemental.reason ?? 'complete',
      },
    }, context: { speaker: 'unknown', sourceEventId: this.eventId(payload), createdAt: new Date(endedAtMs).toISOString() } })
    if (!(await this.isEnabled())) return
    const observations = await knowledgeCaptureInbox.submit(entries)
    const observation = observations[observations.length - 1]!
    this.activeTurns.delete(terminal.terminalId)
    // Phase 5 (§6 gap close): the turn ended — bypass the capture debounce so
    // deterministic sedimentation runs promptly for this workspace.
    knowledgeProcessingQueue.scheduleImmediate(
      observation?.workspaceId ?? terminal.workspaceId ?? '',
    )
    this.emitCaptured(payload, terminal, observation.id)
  }

  private emitCaptured(
    payload: AgentHookPayload,
    terminal: TerminalContext,
    observationId: string,
  ): void {
    this.emit({
      type: 'captured',
      terminalId: terminal.terminalId,
      engine: terminal.engine,
      hookEvent: payload.event,
      workspaceId: terminal.workspaceId,
      workspacePath: terminal.cwd,
      observationId,
    })
  }

  private emit(event: AgentTurnRecorderEvent): void {
    this.eventSink?.(event)
  }
}

export const agentTurnRecorder = new AgentTurnRecorder()
