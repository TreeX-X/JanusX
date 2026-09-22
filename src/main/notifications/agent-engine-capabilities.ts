// Note: engine differences live here as data, never in branches (orca
// TUI_AGENT_CONFIG pattern) — see
// .agents/notes/implemented/feature/2026-09-22-session-engine-capabilities.md
import type { AgentHookSource } from './agent-hook-types'

export type TranscriptKind = 'claude-jsonl' | 'codex-rollout' | 'janus-history' | null

export type EngineEventPhase = 'start' | 'complete' | 'fail' | 'approval' | 'attention'

export interface EngineEventRule {
  event: string
  /** When set, the hook raw payload must carry one of these statuses. */
  rawStatus?: readonly string[]
}

export interface AgentEngineCapability {
  start: readonly EngineEventRule[]
  complete: readonly EngineEventRule[]
  fail: readonly EngineEventRule[]
  /**
   * Approval/attention names before matcher nuance. The coordinator layers
   * the shared Notification matcher contract on top; the recorder matches
   * bare Notification exactly as before.
   */
  approval: readonly string[]
  attention: readonly string[]
  /** Transcript source for answer excerpts; null means status-only turns. */
  transcript: TranscriptKind
  /** Transcript sentinel watches this engine for mid-turn aborts. */
  sentinel: boolean
}

const NATIVE_TURNS = {
  start: [{ event: 'UserPromptSubmit' }],
  complete: [{ event: 'Stop' }],
  fail: [{ event: 'StopFailure' }, { event: 'PostToolUseFailure' }],
} as const

const NATIVE_ATTENTION = {
  approval: ['PermissionRequest'],
  attention: ['PermissionRequest', 'Notification'],
} as const

export const AGENT_ENGINE_CAPABILITIES: Record<AgentHookSource, AgentEngineCapability> = {
  claude: {
    ...NATIVE_TURNS,
    ...NATIVE_ATTENTION,
    transcript: 'claude-jsonl',
    sentinel: true,
  },
  codex: {
    ...NATIVE_TURNS,
    ...NATIVE_ATTENTION,
    transcript: 'codex-rollout',
    sentinel: false,
  },
  janus: {
    ...NATIVE_TURNS,
    ...NATIVE_ATTENTION,
    transcript: 'janus-history',
    sentinel: false,
  },
  pi: {
    ...NATIVE_TURNS,
    ...NATIVE_ATTENTION,
    // No transcript store and no provider session id reach the bridge.
    transcript: null,
    sentinel: false,
  },
  opencode: {
    start: [{ event: 'session.status', rawStatus: ['busy', 'running'] }],
    complete: [{ event: 'session.idle' }],
    fail: [{ event: 'session.error' }],
    approval: ['permission.asked'],
    attention: ['permission.asked'],
    // Sessions persist in sqlite without a driver in this repo.
    transcript: null,
    sentinel: false,
  },
}

/** Raw status candidates for status-shaped events (opencode plugin contract). */
export function extractHookRawStatus(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  const properties = record.properties
  const candidates = [
    record.status,
    record.state,
    properties && typeof properties === 'object'
      ? (properties as Record<string, unknown>).status
      : undefined,
  ]
  return candidates.find((value): value is string => typeof value === 'string')
}

/** opencode posts canonical names; every other source trims. */
export function normalizeHookEventName(source: AgentHookSource, event: string): string {
  if (source === 'opencode') return event
  return event.trim()
}

export function matchesEngineEvents(
  source: AgentHookSource,
  phase: EngineEventPhase,
  event: string,
  raw?: unknown,
): boolean {
  const rules =
    phase === 'start'
      ? AGENT_ENGINE_CAPABILITIES[source].start
      : phase === 'complete'
        ? AGENT_ENGINE_CAPABILITIES[source].complete
        : phase === 'fail'
          ? AGENT_ENGINE_CAPABILITIES[source].fail
          : null
  if (rules) {
    const status = extractHookRawStatus(raw)
    return rules.some(
      (rule) =>
        rule.event === event && (!rule.rawStatus || (status !== undefined && rule.rawStatus.includes(status))),
    )
  }
  const names =
    phase === 'approval'
      ? AGENT_ENGINE_CAPABILITIES[source].approval
      : AGENT_ENGINE_CAPABILITIES[source].attention
  return names.includes(event)
}
