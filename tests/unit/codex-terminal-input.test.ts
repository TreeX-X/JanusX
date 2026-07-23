import { describe, expect, it, vi } from 'vitest'
import {
  getCodexMultilineInput,
  handleCodexMultilineInput,
  isCodexMultilineShortcut,
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

function exerciseHandler(event: KeyboardEvent, preset = 'codex', win32InputMode = false) {
  const write = vi.fn()
  const track = vi.fn()
  const result = handleCodexMultilineInput(preset, event, write, track, win32InputMode)

  // xterm emits onData only when the custom handler allows normal processing.
  if (result !== false) {
    write('\r')
    track('\r')
  }

  return { result, write, track }
}

describe('Codex terminal multiline input', () => {
  it.each([
    ['Shift+Enter', key({ key: 'Enter', shiftKey: true })],
    ['Ctrl+J', key({ key: 'j', ctrlKey: true })],
  ])('recognizes %s as a Codex multiline shortcut', (_name, event) => {
    expect(isCodexMultilineShortcut('codex', event)).toBe(true)
  })

  it.each([
    ['Shift+Enter', key({ key: 'Enter', shiftKey: true })],
    ['Ctrl+J', key({ key: 'j', ctrlKey: true })],
  ])('lets xterm encode %s outside Win32 input mode', (_name, event) => {
    expect(getCodexMultilineInput('codex', event)).toBeNull()
  })

  it('uses the Win32 input sequence for Ctrl+J when Codex enables mode 9001', () => {
    const event = key({ key: 'j', ctrlKey: true })
    const { result, write, track } = exerciseHandler(event, 'codex', true)

    expect(result).toBe(false)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledExactlyOnceWith('\x1b[74;36;10;1;8;1_')
    expect(track).toHaveBeenCalledExactlyOnceWith('\x1b[74;36;10;1;8;1_')

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

  it('does not replace Shift+Enter with a literal CSI-u sequence in Win32 input mode', () => {
    const event = key({ key: 'Enter', shiftKey: true })
    const write = vi.fn()
    const track = vi.fn()
    const result = handleCodexMultilineInput('codex', event, write, track, true)

    expect(result).toBeNull()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalled()
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
