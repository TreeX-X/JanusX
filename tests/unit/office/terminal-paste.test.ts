import { describe, expect, it } from 'vitest'
import { encodeTerminalPaste } from '../../../src/shared/terminalPaste'
import {
  applyTerminalInputChunk,
  createTerminalInputTransactionState,
} from '../../../src/renderer/src/lib/terminal-input-transaction'

describe('encodeTerminalPaste', () => {
  it('encodes multiline text as one bracketed transaction without submitting it', () => {
    const encoded = encodeTerminalPaste('first line\nsecond line')
    const parsed = applyTerminalInputChunk(createTerminalInputTransactionState(), encoded)

    expect(encoded).toBe('\x1b[200~first line\nsecond line\x1b[201~')
    expect(encoded.endsWith('\r')).toBe(false)
    expect(encoded.endsWith('\n')).toBe(false)
    expect(parsed.commitNow).toBe(false)
    expect(parsed.state.text).toBe('first line\nsecond line')
  })

  it('normalizes CRLF and CR without appending a submit byte', () => {
    const encoded = encodeTerminalPaste('one\r\ntwo\rthree')

    expect(encoded).toBe('\x1b[200~one\ntwo\nthree\x1b[201~')
    expect(encoded).not.toContain('\r')
  })

  it('keeps a single-line payload controlled and unsubmitted', () => {
    const encoded = encodeTerminalPaste('inspect this prompt')
    const parsed = applyTerminalInputChunk(createTerminalInputTransactionState(), encoded)

    expect(parsed.commitNow).toBe(false)
    expect(parsed.state.text).toBe('inspect this prompt')
  })

  it('preserves intentional boundary newlines inside the transaction, never after it', () => {
    const encoded = encodeTerminalPaste('\nreview\n')

    expect(encoded).toBe('\x1b[200~\nreview\n\x1b[201~')
    expect(encoded.at(-1)).toBe('~')
    expect(encoded.endsWith('\r')).toBe(false)
    expect(encoded.endsWith('\n')).toBe(false)
  })
})
