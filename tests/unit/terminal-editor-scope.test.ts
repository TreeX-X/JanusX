import { describe, expect, it } from 'vitest'
import { resolveTerminalEditorScope } from '../../src/renderer/src/lib/terminal-editor-scope'

describe('terminal editor window scope', () => {
  it('groups a terminal in a subdirectory with the file tree root', () => {
    expect(resolveTerminalEditorScope('C:/project/src', ['C:\\Project\\'])).toBe('C:\\Project\\')
  })

  it('selects the most specific owning worktree regardless of the active tree', () => {
    expect(resolveTerminalEditorScope('C:/project/.trees/feature/src', [
      'C:/project', 'C:/project/.trees/other', 'C:/project/.trees/feature',
    ])).toBe('C:/project/.trees/feature')
  })

  it('matches sibling worktrees outside the repository root', () => {
    expect(resolveTerminalEditorScope('/work/feature/src', [
      '/work/main', '/work/other', '/work/feature',
    ])).toBe('/work/feature')
  })

  it('keeps an unrelated terminal directory as its own scope', () => {
    expect(resolveTerminalEditorScope('C:/project-copy/src', [undefined, 'C:/project']))
      .toBe('C:/project-copy/src')
  })

  it('does not fold case in POSIX paths', () => {
    expect(resolveTerminalEditorScope('/work/Project/src', ['/work/project']))
      .toBe('/work/Project/src')
  })

  it('matches UNC paths across case and separator spellings', () => {
    expect(resolveTerminalEditorScope('//SERVER/Share/project/src', ['\\\\server\\share\\project']))
      .toBe('\\\\server\\share\\project')
  })

  it('handles a drive root and a POSIX root', () => {
    expect(resolveTerminalEditorScope('C:/src', ['C:\\'])).toBe('C:\\')
    expect(resolveTerminalEditorScope('/src', ['/'])).toBe('/')
  })
})
