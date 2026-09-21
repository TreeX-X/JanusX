import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMPTY_PENDING_LIST, EMPTY_STRING_LIST, EMPTY_WORKTREE_LIST } from '../../src/renderer/src/stores/worktree'

/**
 * Regression: inline `?? []` fallbacks in zustand selectors allocate per
 * snapshot, driving infinite re-renders and a black screen through the
 * maximum-update-depth crash (Sidebar WorktreeSubList, 2026-09-21).
 * Selectors over keyed maps must fall back to stable refs.
 */
describe('worktree selector stability', () => {
  const sources = [
    'src/renderer/src/components/Sidebar.tsx',
    'src/renderer/src/components/SessionPanel.tsx',
    'src/renderer/src/stores/worktree.ts',
  ].map((relative) => readFileSync(join(process.cwd(), relative), 'utf8'))

  it('exposes stable empty fallbacks', () => {
    expect(EMPTY_WORKTREE_LIST).toEqual([])
    expect(EMPTY_STRING_LIST).toEqual([])
    expect(EMPTY_PENDING_LIST).toEqual([])
  })

  it('never allocates inline fallbacks inside worktree selectors', () => {
    for (const source of sources) {
      const selectors = source.match(/useWorktreeStore\(\(s\) =>[^)]*\)/g) ?? []
      for (const selector of selectors) {
        expect(
          selector,
          `unstable selector fallback: ${selector}`,
        ).not.toMatch(/\?\? \[\]/)
      }
    }
  })
})
