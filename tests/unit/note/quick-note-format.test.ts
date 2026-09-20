import { describe, expect, it } from 'vitest'
import {
  applyEdit,
  continueListOnEnter,
  countNoteStats,
  FORMAT_SHORTCUTS,
  formatShortcut,
  indentLines,
  insertBlock,
  insertLink,
  noteExcerpt,
  resolveFormatAction,
  shortcutFormatAction,
  toggleInlineMark,
  toggleLineMark,
  type NoteEdit,
} from '../../../src/renderer/src/components/note/quick-note-format'

function run(value: string, edit: NoteEdit): { text: string; selected: string } {
  const text = applyEdit(value, edit)
  return { text, selected: text.slice(edit.selectionStart, edit.selectionEnd) }
}

describe('quick note inline marks', () => {
  it('wraps a selection and keeps it selected inside the markers', () => {
    const value = 'make this bold'
    const edit = toggleInlineMark(value, 5, 9, 'bold')
    expect(run(value, edit)).toEqual({ text: 'make **this** bold', selected: 'this' })
  })

  it('expands a collapsed caret to the surrounding word', () => {
    const value = 'plain word here'
    const edit = toggleInlineMark(value, 8, 8, 'italic')
    expect(run(value, edit)).toEqual({ text: 'plain _word_ here', selected: 'word' })
  })

  it('inserts an empty pair with the caret between the markers when there is no word', () => {
    const edit = toggleInlineMark('', 0, 0, 'code')
    expect(applyEdit('', edit)).toBe('``')
    expect(edit.selectionStart).toBe(1)
    expect(edit.selectionEnd).toBe(1)
  })

  it('removes markers that are inside or around the selection', () => {
    const inside = toggleInlineMark('a **b** c', 2, 7, 'bold')
    expect(run('a **b** c', inside)).toEqual({ text: 'a b c', selected: 'b' })
    const around = toggleInlineMark('a ~~b~~ c', 4, 5, 'strike')
    expect(run('a ~~b~~ c', around)).toEqual({ text: 'a b c', selected: 'b' })
  })
})

describe('quick note line marks', () => {
  it('toggles a heading on the caret line and moves the caret with the prefix', () => {
    const value = 'first\ntitle\nlast'
    const on = toggleLineMark(value, 8, 8, 'h2')
    expect(applyEdit(value, on)).toBe('first\n## title\nlast')
    expect(on.selectionStart).toBe(11)
    const off = toggleLineMark('first\n## title\nlast', 11, 11, 'h2')
    expect(applyEdit('first\n## title\nlast', off)).toBe('first\ntitle\nlast')
  })

  it('swaps heading levels instead of stacking hashes', () => {
    const value = '# title'
    expect(applyEdit(value, toggleLineMark(value, 3, 3, 'h3'))).toBe('### title')
  })

  it('numbers every selected line, skips blank lines, and selects the block afterwards', () => {
    const value = 'one\n\ntwo\nthree'
    const edit = toggleLineMark(value, 0, value.length, 'ordered')
    expect(run(value, edit)).toEqual({ text: '1. one\n\n2. two\n3. three', selected: '1. one\n\n2. two\n3. three' })
  })

  it('does not pull the next line into a selection that ends on a line break', () => {
    const value = 'one\ntwo\nthree'
    const edit = toggleLineMark(value, 0, 8, 'bullet')
    expect(applyEdit(value, edit)).toBe('- one\n- two\nthree')
  })

  it('converts between list kinds and clears a list when every line already carries it', () => {
    expect(applyEdit('- a\n- b', toggleLineMark('- a\n- b', 0, 7, 'task'))).toBe('- [ ] a\n- [ ] b')
    expect(applyEdit('1. a\n2. b', toggleLineMark('1. a\n2. b', 0, 9, 'bullet'))).toBe('- a\n- b')
    expect(applyEdit('- a\n- b', toggleLineMark('- a\n- b', 0, 7, 'bullet'))).toBe('a\nb')
    expect(applyEdit('> a', toggleLineMark('> a', 0, 3, 'quote'))).toBe('a')
  })
})

describe('quick note links and blocks', () => {
  it('links a plain selection and selects the url placeholder', () => {
    const value = 'see docs'
    const edit = insertLink(value, 4, 8)
    expect(run(value, edit)).toEqual({ text: 'see [docs](url)', selected: 'url' })
  })

  it('turns a selected url into a link and selects the label', () => {
    const value = 'https://example.com'
    const edit = insertLink(value, 0, value.length)
    expect(run(value, edit)).toEqual({ text: '[text](https://example.com)', selected: 'text' })
  })

  it('pads blocks with blank lines so they never merge with neighbours', () => {
    const value = 'above\nbelow'
    const hr = insertBlock(value, 5, 5, 'hr')
    expect(applyEdit(value, hr)).toBe('above\n\n---\n\nbelow')
    const table = insertBlock('above\n\n', 7, 7, 'table')
    expect(applyEdit('above\n\n', table)).toBe('above\n\n| Header | Header |\n| --- | --- |\n| Cell | Cell |\n')
    expect(run('above\n\n', table).selected).toBe('Header')
  })

  it('wraps a selection into a fenced code block and keeps the selection on the code', () => {
    const value = 'const x = 1'
    const edit = insertBlock(value, 0, value.length, 'codeBlock')
    expect(run(value, edit)).toEqual({ text: '```\nconst x = 1\n```\n', selected: 'const x = 1' })
  })

  it('routes every action through resolveFormatAction', () => {
    expect(applyEdit('x', resolveFormatAction('x', 0, 1, 'bold'))).toBe('**x**')
    expect(applyEdit('x', resolveFormatAction('x', 0, 1, 'h1'))).toBe('# x')
    expect(applyEdit('x', resolveFormatAction('x', 0, 1, 'link'))).toBe('[x](url)')
    expect(applyEdit('x', resolveFormatAction('x', 1, 1, 'hr'))).toBe('x\n\n---\n')
  })
})

describe('quick note editing keys', () => {
  it('continues bullet, task, and numbered lists on Enter and leaves an empty item', () => {
    expect(applyEdit('- item', continueListOnEnter('- item', 6, 6)!)).toBe('- item\n- ')
    expect(applyEdit('- [x] done', continueListOnEnter('- [x] done', 10, 10)!)).toBe('- [x] done\n- [ ] ')
    expect(applyEdit('  2. two', continueListOnEnter('  2. two', 8, 8)!)).toBe('  2. two\n  3. ')
    expect(applyEdit('a\n- \nb', continueListOnEnter('a\n- \nb', 4, 4)!)).toBe('a\n\nb')
    expect(continueListOnEnter('plain', 5, 5)).toBeNull()
    expect(continueListOnEnter('- item', 1, 1)).toBeNull()
    expect(continueListOnEnter('- item', 2, 6)).toBeNull()
  })

  it('indents the caret and the selected lines with two spaces and outdents them', () => {
    expect(applyEdit('a', indentLines('a', 0, 0, false))).toBe('  a')
    expect(applyEdit('a\nb', indentLines('a\nb', 0, 3, false))).toBe('  a\n  b')
    expect(applyEdit('  a\n\tb', indentLines('  a\n\tb', 0, 6, true))).toBe('a\nb')
    expect(applyEdit('  a', indentLines('  a', 3, 3, true))).toBe('a')
  })

  it('maps modifier shortcuts to actions and formats them per platform', () => {
    const key = (key: string, extra: Partial<Parameters<typeof shortcutFormatAction>[0]> = {}) =>
      shortcutFormatAction({ key, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, ...extra })
    expect(key('b')).toBe('bold')
    expect(key('I')).toBe('italic')
    expect(key('k')).toBe('link')
    expect(key('e')).toBe('code')
    expect(key('x', { shiftKey: true })).toBe('strike')
    expect(key('x')).toBeNull()
    expect(key('b', { ctrlKey: false })).toBeNull()
    expect(key('b', { altKey: true })).toBeNull()
    expect(formatShortcut(FORMAT_SHORTCUTS.bold!, false)).toBe('Ctrl+B')
    expect(formatShortcut(FORMAT_SHORTCUTS.strike!, true)).toBe('⌘⇧X')
  })
})

describe('quick note metadata', () => {
  it('counts CJK characters as words and latin runs as words', () => {
    expect(countNoteStats('hello world')).toEqual({ words: 2, chars: 11 })
    expect(countNoteStats('你好 world')).toEqual({ words: 3, chars: 8 })
    expect(countNoteStats('')).toEqual({ words: 0, chars: 0 })
  })

  it('takes the first non-empty line without markdown markers as the excerpt', () => {
    expect(noteExcerpt('\n\n# Title **bold**\nbody')).toBe('Title bold')
    expect(noteExcerpt('   ')).toBe('')
  })
})
