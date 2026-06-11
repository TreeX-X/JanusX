import { describe, it, expect } from 'vitest'

describe('generateUnifiedDiff', () => {
  it('returns empty string for identical content', async () => {
    const { generateUnifiedDiff } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const content = 'line1\nline2\nline3'
    const result = generateUnifiedDiff('test.ts', content, content)
    expect(result).toBe('')
  })

  it('shows + lines for added lines', async () => {
    const { generateUnifiedDiff } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const old = 'line1'
    const newContent = 'line1\nline2'
    const result = generateUnifiedDiff('test.ts', old, newContent)
    expect(result).toContain('+line2')
    // Verify no diff removal lines (single '-' prefix, not '---' header)
    const removalLines = result.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'))
    expect(removalLines).toEqual([])
  })

  it('shows - lines for removed lines', async () => {
    const { generateUnifiedDiff } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const old = 'line1\nline2'
    const newContent = 'line1'
    const result = generateUnifiedDiff('test.ts', old, newContent)
    expect(result).toContain('-line2')
  })

  it('shows both - and + for changed lines', async () => {
    const { generateUnifiedDiff } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const old = 'old line'
    const newContent = 'new line'
    const result = generateUnifiedDiff('test.ts', old, newContent)
    expect(result).toContain('-old line')
    expect(result).toContain('+new line')
  })

  it('includes file path in header', async () => {
    const { generateUnifiedDiff } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const result = generateUnifiedDiff('src/foo.ts', 'a', 'b')
    expect(result).toContain('--- a/src/foo.ts')
    expect(result).toContain('+++ b/src/foo.ts')
  })

  it('includes hunk header', async () => {
    const { generateUnifiedDiff } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const result = generateUnifiedDiff('test.ts', 'a', 'b')
    expect(result).toMatch(/^--- a\/test\.ts\n\+\+\+ b\/test\.ts\n@@ .+ @@/)
  })
})

describe('threeWayMerge', () => {
  it('returns ours when all three are the same', async () => {
    const { threeWayMerge } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const text = 'same content'
    const result = threeWayMerge(text, text, text)
    expect(result.merged).toBe(text)
    expect(result.conflicts).toBe(false)
    expect(result.conflictRegions).toEqual([])
  })

  it('returns ours when theirs matches base (ours changed)', async () => {
    const { threeWayMerge } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const base = 'original'
    const ours = 'modified by us'
    const result = threeWayMerge(base, ours, base)
    expect(result.merged).toBe(ours)
    expect(result.conflicts).toBe(false)
  })

  it('returns theirs when ours matches base (theirs changed)', async () => {
    const { threeWayMerge } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const base = 'original'
    const theirs = 'modified by them'
    const result = threeWayMerge(base, base, theirs)
    expect(result.merged).toBe(theirs)
    expect(result.conflicts).toBe(false)
  })

  it('returns ours when both changed the same way', async () => {
    const { threeWayMerge } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const base = 'original'
    const same = 'both changed to this'
    const result = threeWayMerge(base, same, same)
    expect(result.merged).toBe(same)
    expect(result.conflicts).toBe(false)
  })

  it('produces conflict markers when both changed differently', async () => {
    const { threeWayMerge } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const base = 'original'
    const ours = 'our version'
    const theirs = 'their version'
    const result = threeWayMerge(base, ours, theirs)
    expect(result.conflicts).toBe(true)
    expect(result.merged).toContain('<<<<<<< ours')
    expect(result.merged).toContain('=======')
    expect(result.merged).toContain('>>>>>>> theirs')
    expect(result.merged).toContain(ours)
    expect(result.merged).toContain(theirs)
    expect(result.conflictRegions.length).toBeGreaterThan(0)
  })
})

describe('parseConflictMarkers', () => {
  it('returns no conflicts for content without markers', async () => {
    const { parseConflictMarkers } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const result = parseConflictMarkers('just plain text\nno conflicts here')
    expect(result.hasConflicts).toBe(false)
    expect(result.regions).toEqual([])
  })

  it('extracts a single conflict region', async () => {
    const { parseConflictMarkers } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const content = [
      'before',
      '<<<<<<< ours',
      'our version',
      '=======',
      'their version',
      '>>>>>>> theirs',
      'after',
    ].join('\n')
    const result = parseConflictMarkers(content)
    expect(result.hasConflicts).toBe(true)
    expect(result.regions).toHaveLength(1)
    expect(result.regions[0].ours).toBe('our version')
    expect(result.regions[0].theirs).toBe('their version')
  })

  it('extracts multiple conflict regions', async () => {
    const { parseConflictMarkers } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const content = [
      '<<<<<<< ours',
      'first ours',
      '=======',
      'first theirs',
      '>>>>>>> theirs',
      'middle',
      '<<<<<<< ours',
      'second ours',
      '=======',
      'second theirs',
      '>>>>>>> theirs',
    ].join('\n')
    const result = parseConflictMarkers(content)
    expect(result.hasConflicts).toBe(true)
    expect(result.regions).toHaveLength(2)
    expect(result.regions[0].ours).toBe('first ours')
    expect(result.regions[0].theirs).toBe('first theirs')
    expect(result.regions[1].ours).toBe('second ours')
    expect(result.regions[1].theirs).toBe('second theirs')
  })

  it('handles multi-line conflict content', async () => {
    const { parseConflictMarkers } = await import('../../../src/main/agent/checkpoint/diff-engine')
    const content = [
      '<<<<<<< ours',
      'our line 1',
      'our line 2',
      '=======',
      'their line 1',
      'their line 2',
      'their line 3',
      '>>>>>>> theirs',
    ].join('\n')
    const result = parseConflictMarkers(content)
    expect(result.hasConflicts).toBe(true)
    expect(result.regions[0].ours).toBe('our line 1\nour line 2')
    expect(result.regions[0].theirs).toBe('their line 1\ntheir line 2\ntheir line 3')
  })

  it('returns empty regions for partial/malformed markers', async () => {
    const { parseConflictMarkers } = await import('../../../src/main/agent/checkpoint/diff-engine')
    // Only has start marker, no end marker
    const content = '<<<<<<< ours\norphan conflict'
    const result = parseConflictMarkers(content)
    expect(result.hasConflicts).toBe(false)
    expect(result.regions).toEqual([])
  })
})
