import { describe, expect, it } from 'vitest'
import {
  AGENT_ENGINE_CAPABILITIES,
  extractHookRawStatus,
  matchesEngineEvents,
  normalizeHookEventName,
} from '../../src/main/notifications/agent-engine-capabilities'
import type { AgentHookSource } from '../../src/main/notifications/agent-hook-types'

const NATIVE: AgentHookSource[] = ['claude', 'codex', 'janus', 'pi']

describe('agent engine capabilities', () => {
  it('covers every hook source with a transcript and sentinel contract', () => {
    const sources: AgentHookSource[] = ['claude', 'codex', 'opencode', 'janus', 'pi']
    for (const source of sources) {
      const capability = AGENT_ENGINE_CAPABILITIES[source]
      expect(capability, source).toBeTruthy()
      expect(capability.start.length).toBeGreaterThan(0)
      expect(capability.complete.length).toBeGreaterThan(0)
    }
    expect(AGENT_ENGINE_CAPABILITIES.claude.transcript).toBe('claude-jsonl')
    expect(AGENT_ENGINE_CAPABILITIES.codex.transcript).toBe('codex-rollout')
    expect(AGENT_ENGINE_CAPABILITIES.janus.transcript).toBe('janus-history')
    expect(AGENT_ENGINE_CAPABILITIES.opencode.transcript).toBeNull()
    expect(AGENT_ENGINE_CAPABILITIES.pi.transcript).toBeNull()
    expect(AGENT_ENGINE_CAPABILITIES.claude.sentinel).toBe(true)
    for (const source of ['codex', 'opencode', 'janus', 'pi'] as const) {
      expect(AGENT_ENGINE_CAPABILITIES[source].sentinel).toBe(false)
    }
  })

  it('classifies native turn events identically across hook-native engines', () => {
    for (const source of NATIVE) {
      expect(matchesEngineEvents(source, 'start', 'UserPromptSubmit')).toBe(true)
      expect(matchesEngineEvents(source, 'complete', 'Stop')).toBe(true)
      expect(matchesEngineEvents(source, 'fail', 'StopFailure')).toBe(true)
      expect(matchesEngineEvents(source, 'fail', 'PostToolUseFailure')).toBe(true)
      expect(matchesEngineEvents(source, 'approval', 'PermissionRequest')).toBe(true)
      expect(matchesEngineEvents(source, 'attention', 'PermissionRequest')).toBe(true)
      expect(matchesEngineEvents(source, 'attention', 'Notification')).toBe(true)
      expect(matchesEngineEvents(source, 'start', 'Stop')).toBe(false)
      expect(matchesEngineEvents(source, 'complete', 'session.idle')).toBe(false)
    }
  })

  it('gates opencode status events on the raw status payload', () => {
    const busy = { status: 'busy' }
    const running = { properties: { status: 'running' } }
    const idle = { status: 'idle' }
    expect(matchesEngineEvents('opencode', 'start', 'session.status', busy)).toBe(true)
    expect(matchesEngineEvents('opencode', 'start', 'session.status', running)).toBe(true)
    expect(matchesEngineEvents('opencode', 'start', 'session.status', idle)).toBe(false)
    expect(matchesEngineEvents('opencode', 'start', 'session.status')).toBe(false)
    expect(matchesEngineEvents('opencode', 'complete', 'session.idle')).toBe(true)
    expect(matchesEngineEvents('opencode', 'fail', 'session.error')).toBe(true)
    expect(matchesEngineEvents('opencode', 'approval', 'permission.asked')).toBe(true)
    expect(matchesEngineEvents('opencode', 'attention', 'permission.asked')).toBe(true)
    expect(matchesEngineEvents('opencode', 'attention', 'Notification')).toBe(false)
  })

  it('normalizes event names and extracts raw statuses like the old locals', () => {
    expect(normalizeHookEventName('opencode', '  session.status  ')).toBe('  session.status  ')
    expect(normalizeHookEventName('claude', '  Stop  ')).toBe('Stop')
    expect(extractHookRawStatus({ status: 'busy' })).toBe('busy')
    expect(extractHookRawStatus({ state: 'running' })).toBe('running')
    expect(extractHookRawStatus({ properties: { status: 'idle' } })).toBe('idle')
    expect(extractHookRawStatus({})).toBeUndefined()
    expect(extractHookRawStatus(null)).toBeUndefined()
  })
})
