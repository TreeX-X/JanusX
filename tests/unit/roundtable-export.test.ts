import { describe, expect, it } from 'vitest'
import { buildRoundtableFilename, formatExportTimestamp, sanitizeTopicSegment, withDraftWatermark } from '../../src/renderer/src/components/janus/roundtableExport'

const stamp = new Date(2026, 8, 4, 9, 5)

describe('roundtable export naming', () => {
  it('marks non-ended phases as DRAFT', () => {
    expect(buildRoundtableFilename({ userInput: '优化登录流程', roundNumber: 2, phase: 'awaiting-user' }, stamp))
      .toBe('roundtable-优化登录流程-r2-DRAFT-20260904-0905.md')
  })

  it('marks the ended phase as FINAL', () => {
    expect(buildRoundtableFilename({ userInput: '优化登录流程', roundNumber: 3, phase: 'ended' }, stamp))
      .toBe('roundtable-优化登录流程-r3-FINAL-20260904-0905.md')
  })

  it('strips filesystem-illegal characters and caps the topic segment', () => {
    expect(sanitizeTopicSegment('a/b\\c:d*e?f"g<h>i|j long tail')).toBe('a-b-c-d-e-f-')
    expect(sanitizeTopicSegment('   ')).toBe('roundtable')
    expect(sanitizeTopicSegment(undefined)).toBe('roundtable')
  })

  it('formats the filename timestamp as yyyyMMdd-HHmm', () => {
    expect(formatExportTimestamp(stamp)).toBe('20260904-0905')
  })
})

describe('roundtable draft watermark', () => {
  it('prefixes the round, time and final-record disclaimer', () => {
    const out = withDraftWatermark('# Topic\n\nbody', 2, stamp)
    expect(out).toContain('第 2 轮')
    expect(out).toContain('终稿以结束会议为准')
    expect(out.endsWith('# Topic\n\nbody')).toBe(true)
  })
})
