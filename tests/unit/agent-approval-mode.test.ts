import { describe, expect, it } from 'vitest'
import { normalizeAgentApprovalMode } from '../../src/shared/ipc/agent-runtime'

describe('agent approval plan mode', () => {
  it('preserves the plan tier and falls back to per-action for unknown values', () => {
    expect(normalizeAgentApprovalMode('plan')).toBe('plan')
    expect(normalizeAgentApprovalMode('auto-run')).toBe('auto-run')
    expect(normalizeAgentApprovalMode('per-action')).toBe('per-action')
    expect(normalizeAgentApprovalMode(undefined)).toBe('per-action')
    expect(normalizeAgentApprovalMode(null)).toBe('per-action')
    expect(normalizeAgentApprovalMode('yolo')).toBe('per-action')
  })
})
