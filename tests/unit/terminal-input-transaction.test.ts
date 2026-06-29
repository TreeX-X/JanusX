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

  it('treats a soft Enter as multiline content instead of submit', () => {
    let state = applyTerminalInputChunk(createTerminalInputTransactionState(), 'test').state
    const newline = applyTerminalInputChunk(state, '\r', { softEnterCount: 1 })
    state = applyTerminalInputChunk(newline.state, 'test2').state

    expect(newline.commitNow).toBe(false)
    expect(newline.softEnterCount).toBe(0)
    expect(state.text).toBe('test\ntest2')
  })

  it('treats Ctrl+J LF as multiline content when marked as soft Enter', () => {
    let state = applyTerminalInputChunk(createTerminalInputTransactionState(), 'test').state
    const newline = applyTerminalInputChunk(state, '\n', { softEnterCount: 1 })
    state = applyTerminalInputChunk(newline.state, 'test2').state

    expect(newline.commitNow).toBe(false)
    expect(newline.softEnterCount).toBe(0)
    expect(state.text).toBe('test\ntest2')
  })

  it('treats kitty-style soft Enter as multiline content', () => {
    const result = applyTerminalInputChunk(createTerminalInputTransactionState(), '\x1b[13;2u', {
      softEnterCount: 1,
    })

    expect(result.commitNow).toBe(false)
    expect(result.softEnterCount).toBe(0)
    expect(result.state.text).toBe('\n')
  })

  it('ignores OSC color query responses before user text', () => {
    const data = '\x1b]10;rgb:d4d4/d4d4/d4d4\x1b\\\x1b]11;rgb:0505/0505/0505\x1b\\test'
    const result = applyTerminalInputChunk(createTerminalInputTransactionState(), data)

    expect(result.state.text).toBe('test')
    expect(result.commitNow).toBe(false)
  })

  it('ignores long OSC palette responses before user text', () => {
    const data = [
      '\x1b]10;rgb:d4d4/d4d4/d4d4\x1b\\',
      '\x1b]11;rgb:0505/0505/0505\x1b\\',
      '\x1b]4;0;rgb:1f1f/1f1f/2323\x1b\\',
      '\x1b]4;15;rgb:f2f2/f2f2/f3f3\x1b\\',
      'test',
    ].join('')
    const result = applyTerminalInputChunk(createTerminalInputTransactionState(), data)

    expect(result.state.text).toBe('test')
  })

  it('normalizes CRLF and CR for checkpoint previews', () => {
    expect(normalizeTerminalInputPreviewText('a\r\nb\rc')).toBe('a\nb\nc')
  })
})
