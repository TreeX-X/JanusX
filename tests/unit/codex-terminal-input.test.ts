import { describe, expect, it, vi } from 'vitest'
import { Terminal } from '@xterm/xterm'
import {
  getCodexMultilineInput,
  handleCodexMultilineInput,
} from '../../src/renderer/src/lib/codex-terminal-input'
import {
  applyTerminalInputChunk,
  createTerminalInputTransactionState,
} from '../../src/renderer/src/lib/terminal-input-transaction'

function key(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    type: 'keydown',
    key: '',
    ctrlKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent
}

function exerciseHandler(event: KeyboardEvent, preset = 'codex') {
  const write = vi.fn()
  const track = vi.fn()
  const result = handleCodexMultilineInput(preset, event, write, track)

  // xterm emits onData only when the custom handler allows normal processing.
  if (result !== false) {
    write('\r')
    track('\r')
  }

  return { result, write, track }
}

function writeTerminal(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve))
}

describe('Codex terminal multiline input', () => {
  it('uses one CSI-u soft newline for Shift+Enter', () => {
    expect(getCodexMultilineInput('codex', key({ key: 'Enter', shiftKey: true }))).toBe(
      '\x1b[13;2u',
    )
  })

  it('uses the same soft newline for Ctrl+J', () => {
    expect(getCodexMultilineInput('codex', key({ key: 'j', ctrlKey: true }))).toBe(
      '\x1b[13;2u',
    )
  })

  it.each([
    ['Shift+Enter', key({ key: 'Enter', shiftKey: true })],
    ['Ctrl+J', key({ key: 'j', ctrlKey: true })],
  ])('writes and tracks %s exactly once while consuming the event', (_name, event) => {
    const { result, write, track } = exerciseHandler(event)

    expect(result).toBe(false)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledWith('\x1b[13;2u')
    expect(track).toHaveBeenCalledOnce()
    expect(track).toHaveBeenCalledWith('\x1b[13;2u')

    const transaction = applyTerminalInputChunk(
      createTerminalInputTransactionState(),
      track.mock.calls[0][0],
      { softEnterCount: 1 },
    )

    expect(transaction).toMatchObject({
      commitNow: false,
      softEnterCount: 0,
      state: { text: '\n' },
    })
  })

  it('keeps both shortcuts independent across parsed ?9001h and ?9001l transitions', async () => {
    const term = new Terminal()
    const assertShortcuts = () => {
      for (const event of [
        key({ key: 'Enter', shiftKey: true }),
        key({ key: 'j', ctrlKey: true }),
      ]) {
        const { result, write, track } = exerciseHandler(event)
        expect(result).toBe(false)
        expect(write).toHaveBeenCalledExactlyOnceWith('\x1b[13;2u')
        expect(track).toHaveBeenCalledExactlyOnceWith('\x1b[13;2u')
      }
    }

    try {
      assertShortcuts()
      await writeTerminal(term, '\x1b[?9001h')
      assertShortcuts()
      await writeTerminal(term, '\x1b[?9001l')
      assertShortcuts()
    } finally {
      term.dispose()
    }
  })

  it('passes ordinary Enter through the handler path', () => {
    const event = key({ key: 'Enter' })
    const { result, write, track } = exerciseHandler(event)

    expect(result).toBeNull()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(write).toHaveBeenCalledExactlyOnceWith('\r')
    expect(track).toHaveBeenCalledExactlyOnceWith('\r')
  })

  it('does not claim keyup or non-Codex input', () => {
    const keyup = key({ type: 'keyup', key: 'j', ctrlKey: true })
    const nonCodex = key({ key: 'Enter', shiftKey: true })

    expect(handleCodexMultilineInput('codex', keyup, vi.fn(), vi.fn())).toBeNull()
    expect(handleCodexMultilineInput('shell', nonCodex, vi.fn(), vi.fn())).toBeNull()
  })
})
