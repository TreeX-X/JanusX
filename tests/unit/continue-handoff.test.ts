import { describe, expect, it } from 'vitest'
import {
  buildContinueHandoff,
  inlineCode,
  truncateHandoffText,
} from '../../src/main/sessions/continue-handoff'

describe('buildContinueHandoff', () => {
  it('summarizes an internal row from its own turns', () => {
    const handoff = buildContinueHandoff({
      firstPrompt: 'fix the login retry',
      lastPrompt: 'added the retry guard',
      transcriptPath: '/tmp/inner.jsonl',
      checkpointIds: ['cp-abcdef12', 'cp-12345678'],
    })
    expect(handoff).toContain('继续任务「fix the login retry」')
    expect(handoff).toContain('最近进展：added the retry guard')
    expect(handoff).toContain('历史 transcript 仅作只读参考（/tmp/inner.jsonl）')
    expect(handoff).toContain('还原点：cp-1234')
  })

  it('falls back to placeholders when an internal row recorded nothing', () => {
    const handoff = buildContinueHandoff({
      firstPrompt: '',
      lastPrompt: '',
      checkpointIds: [],
    })
    expect(handoff).toContain('未命名任务')
    expect(handoff).toContain('（暂无进展记录）')
    expect(handoff).not.toContain('还原点：')
    expect(handoff).not.toContain('transcript')
  })

  it('hands an external row its transcript path instead of a summary', () => {
    const handoff = buildContinueHandoff({
      external: true,
      firstPrompt: 'wire the gateway',
      lastPrompt: 'wire the gateway',
      transcriptPath: 'C:/Users/ada/.claude/projects/x/abc.jsonl',
      checkpointIds: [],
    })
    expect(handoff).toContain('继续任务「wire the gateway」')
    expect(handoff).toContain('C:/Users/ada/.claude/projects/x/abc.jsonl')
    expect(handoff).toContain('按需读取该文件')
    expect(handoff).toContain('勿修改它')
    // External rows own no checkpoints to hand over.
    expect(handoff).not.toContain('还原点：')
  })

  it('keeps an external row without a transcript path honest', () => {
    const handoff = buildContinueHandoff({
      external: true,
      firstPrompt: 'a',
      lastPrompt: 'b',
      checkpointIds: [],
    })
    expect(handoff).toContain('无原始转录路径')
    expect(handoff).not.toContain('完整原始转录在')
  })

  it('fences a path containing backticks so the handoff cannot break out', () => {
    const handoff = buildContinueHandoff({
      external: true,
      firstPrompt: 'a',
      lastPrompt: 'b',
      transcriptPath: 'C:/tmp/`weird`.jsonl',
      checkpointIds: [],
    })
    // Two separate one-backtick runs need a two-backtick span around the path.
    expect(handoff).toContain('``C:/tmp/`weird`.jsonl``')
    expect(handoff).not.toContain('完整原始转录在 C:/tmp/`weird`.jsonl，')
  })
})

describe('inlineCode', () => {
  it('uses a plain span for ordinary values', () => {
    expect(inlineCode('/tmp/a.jsonl')).toBe('`/tmp/a.jsonl`')
  })

  it('widens the span past the longest backtick run inside the value', () => {
    expect(inlineCode('a`b')).toBe('``a`b``')
    expect(inlineCode('a``b')).toBe('```a``b```')
  })
})

describe('truncateHandoffText', () => {
  it('collapses whitespace and caps by length', () => {
    expect(truncateHandoffText('  a\n\nb  ', 10)).toBe('a b')
    expect(truncateHandoffText('abcdefghij', 4)).toBe('abcd…')
  })
})
