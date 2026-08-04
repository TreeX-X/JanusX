import { describe, expect, it } from 'vitest'
import {
  applyTerminalInputChunk,
  createTerminalInputTransactionState,
  normalizeTerminalInputPreviewText,
} from '../../src/renderer/src/lib/terminal-input-transaction'

describe('terminal input transaction parser', () => {
  it('commits typed input only when Enter is received', () => {
    let state = createTerminalInputTransactionState()
    state = applyTerminalInputChunk(state, 'test').state

    const result = applyTerminalInputChunk(state, '\r')

    expect(result.commitNow).toBe(true)
    expect(result.softEnterCount).toBe(0)
    expect(result.state.text).toBe('test')
  })

  it('treats newline inside a bulk payload as content without committing', () => {
    const result = applyTerminalInputChunk(createTerminalInputTransactionState(), 'test\r\ntest2')

    expect(result.commitNow).toBe(false)
    expect(result.softEnterCount).toBe(0)
    expect(result.state.text).toBe('test\ntest2')
  })

  it('keeps bracketed paste multiline content in one transaction', () => {
    const result = applyTerminalInputChunk(
      createTerminalInputTransactionState(),
      '\x1b[200~test\ntest2\x1b[201~',
    )

    expect(result.commitNow).toBe(false)
    expect(result.softEnterCount).toBe(0)
    expect(result.state.text).toBe('test\ntest2')
  })

  it('commits accumulated multiline content on a later standalone Enter', () => {
    const paste = applyTerminalInputChunk(createTerminalInputTransactionState(), 'test\r\ntest2')
    const submit = applyTerminalInputChunk(paste.state, '\r')

    expect(submit.commitNow).toBe(true)
    expect(submit.state.text).toBe('test\ntest2')
  })

  it('does not commit single-line bulk input until a submit key arrives', () => {
    const result = applyTerminalInputChunk(createTerminalInputTransactionState(), 'test')

    expect(result.commitNow).toBe(false)
    expect(result.softEnterCount).toBe(0)
    expect(result.state.text).toBe('test')
  })

  it.each([
    ['CR soft Enter', '\r', 1],
    ['LF soft Enter', '\n', 1],
    ['kitty CSI-u', '\x1b[13;2u', 1],
    ['bracketed-paste CR', '\x1b[200~\r\x1b[201~', 1],
    ['Win32 CSI-u', '\x1b[74;36;10;1;8;1_', 1],
  ] as const)('treats %s as multiline content instead of submit', (_label, input, softEnterCount) => {
    const result = applyTerminalInputChunk(createTerminalInputTransactionState(), input, { softEnterCount })

    expect(result.commitNow).toBe(false)
    expect(result.softEnterCount).toBe(0)
    expect(result.state.text).toContain('\n')
  })

  it('commits accumulated input on CSI-u Enter', () => {
    let state = applyTerminalInputChunk(createTerminalInputTransactionState(), 'test').state
    const result = applyTerminalInputChunk(state, '\x1b[13;1u')

    expect(result.commitNow).toBe(true)
    expect(result.softEnterCount).toBe(0)
    expect(result.state.text).toBe('test')
  })

  it.each([
    [
      'OSC color query responses',
      '\x1b]10;rgb:d4d4/d4d4/d4d4\x1b\\\x1b]11;rgb:0505/0505/0505\x1b\\test',
    ],
    [
      'long OSC palette responses',
      [
        '\x1b]10;rgb:d4d4/d4d4/d4d4\x1b\\',
        '\x1b]11;rgb:0505/0505/0505\x1b\\',
        '\x1b]4;0;rgb:1f1f/1f1f/2323\x1b\\',
        '\x1b]4;15;rgb:f2f2/f2f2/f3f3\x1b\\',
        'test',
      ].join(''),
    ],
    [
      'fragmented query responses without ESC bytes',
      ['[?1;2c', ']10;rgb:d4d4/d4d4/d4d4\\', ']11;rgb:0505/0505/0505\\', 'test'].join(''),
    ],
  ])('ignores %s before user text', (_label, data) => {
    const result = applyTerminalInputChunk(createTerminalInputTransactionState(), data)

    expect(result.state.text).toBe('test')
    expect(result.commitNow).toBe(false)
  })

  it('normalizes CRLF and CR for checkpoint previews', () => {
    expect(normalizeTerminalInputPreviewText('a\r\nb\rc')).toBe('a\nb\nc')
  })
})
