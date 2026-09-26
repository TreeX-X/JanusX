import { describe, expect, it } from 'vitest'
import { MAX_REASONING_CHARS, appendReasoningDelta, emptyReasoning, extractThinkingGist, extractThinkingLiveTail, formatThinkingDuration } from '../../src/renderer/src/components/janus/janusReasoning'

describe('janusReasoning', () => {
  it('accumulates deltas without truncation within budget', () => {
    let snapshot = emptyReasoning()
    snapshot = appendReasoningDelta(snapshot, '分析')
    snapshot = appendReasoningDelta(snapshot, '翻转效果')
    expect(snapshot).toEqual({ text: '分析翻转效果', chars: 6, truncated: false })
  })

  it('ignores empty deltas', () => {
    const snapshot = appendReasoningDelta(emptyReasoning(), '')
    expect(snapshot).toEqual({ text: '', chars: 0, truncated: false })
  })

  it('truncates the head and keeps the tail beyond budget', () => {
    const head = 'h'.repeat(MAX_REASONING_CHARS)
    let snapshot = appendReasoningDelta(emptyReasoning(), head)
    expect(snapshot.truncated).toBe(false)
    snapshot = appendReasoningDelta(snapshot, 'tail')
    expect(snapshot.text).toBe(`${'h'.repeat(MAX_REASONING_CHARS - 4)}tail`)
    expect(snapshot.text).toHaveLength(MAX_REASONING_CHARS)
    expect(snapshot.chars).toBe(MAX_REASONING_CHARS + 4)
    expect(snapshot.truncated).toBe(true)
  })

  it('formats thinking duration like agentX Activity', () => {
    expect(formatThinkingDuration(0)).toBe('0.0s')
    expect(formatThinkingDuration(2500)).toBe('2.5s')
    expect(formatThinkingDuration(59999)).toBe('60.0s')
    expect(formatThinkingDuration(61000)).toBe('1m 1s')
    expect(formatThinkingDuration(125000)).toBe('2m 5s')
  })

  it('extracts a gist from the first line and a live tail from the last line', () => {
    expect(extractThinkingGist('')).toBe('')
    expect(extractThinkingGist('\n\n## 分析翻转\n正文')).toBe('分析翻转')
    expect(extractThinkingLiveTail('第一行\n\n第二行  ')).toBe('第二行')
    expect(extractThinkingLiveTail('')).toBe('')
  })
})
