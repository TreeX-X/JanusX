import { describe, expect, it } from 'vitest'
import { summarizeToolCallGroup } from '../../src/renderer/src/components/janus/ToolCallCard'
import type { ChatToolTraceEntry } from '../../src/shared/ipc/llm'

function entry(status: string): ChatToolTraceEntry {
  return { toolName: 'workspace.read', workspaceId: 'ws', status, summary: 'ok' }
}

describe('summarizeToolCallGroup', () => {
  it('reports completed when every call finished', () => {
    expect(summarizeToolCallGroup([entry('completed'), entry('completed')])).toEqual({
      total: 2, failed: 0, pending: 0, overall: 'completed',
    })
  })

  it('prioritizes failed over pending', () => {
    const summary = summarizeToolCallGroup([entry('completed'), entry('failed'), entry('running')])
    expect(summary).toEqual({ total: 3, failed: 1, pending: 1, overall: 'failed' })
  })

  it('treats cancelled as failed and approval as pending-approval', () => {
    expect(summarizeToolCallGroup([entry('cancelled')]).overall).toBe('failed')
    expect(summarizeToolCallGroup([entry('completed'), entry('approval')])).toEqual({
      total: 2, failed: 0, pending: 1, overall: 'approval',
    })
    expect(summarizeToolCallGroup([entry('requested')]).overall).toBe('running')
  })

  it('handles empty input without crashing', () => {
    expect(summarizeToolCallGroup([])).toEqual({ total: 0, failed: 0, pending: 0, overall: 'completed' })
  })
})
