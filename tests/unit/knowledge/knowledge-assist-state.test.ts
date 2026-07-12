import { describe, expect, it } from 'vitest'
import {
  ASSIST_MAX_CHARS,
  ASSIST_MAX_ITEMS,
  AssistRequestGate,
  createAssistRequest,
} from '../../../src/renderer/src/components/knowledge/KnowledgeAssistState'

describe('Knowledge Assist state helpers', () => {
  it('builds only explicit, workspace-scoped bounded requests', () => {
    expect(createAssistRequest('   ', 'workspace-a', 'C:/workspace-a')).toBeNull()
    expect(createAssistRequest('context', null, null)).toBeNull()
    expect(createAssistRequest('  accepted context  ', 'workspace-a', 'C:/workspace-a')).toEqual({
      query: 'accepted context',
      workspaceId: 'workspace-a',
      workspacePath: 'C:/workspace-a',
      maxItems: ASSIST_MAX_ITEMS,
      maxChars: ASSIST_MAX_CHARS,
    })
  })

  it('invalidates stale responses on later requests or workspace reset', () => {
    const gate = new AssistRequestGate()
    const first = gate.begin()
    const second = gate.begin()
    expect(gate.isCurrent(first)).toBe(false)
    expect(gate.isCurrent(second)).toBe(true)

    gate.invalidate()
    expect(gate.isCurrent(second)).toBe(false)
  })
})
