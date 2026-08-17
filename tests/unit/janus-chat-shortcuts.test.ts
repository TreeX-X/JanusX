import { describe, expect, it } from 'vitest'
import { resolveChatSelectionShortcut } from '../../src/renderer/src/components/janus/JanusChat'

function shortcut(key: string, overrides: Partial<Parameters<typeof resolveChatSelectionShortcut>[0]> = {}) {
  return resolveChatSelectionShortcut({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    ...overrides,
  })
}

describe('Janus Chat selection shortcuts', () => {
  it('opens providers with plain Tab', () => {
    expect(shortcut('Tab')).toBe('provider')
    expect(shortcut('Tab', { shiftKey: true })).toBeNull()
  })

  it('opens models with Ctrl+P or Cmd+P', () => {
    expect(shortcut('p', { ctrlKey: true })).toBe('model')
    expect(shortcut('P', { metaKey: true })).toBe('model')
  })

  it('does not claim composition or modified navigation keys', () => {
    expect(shortcut('Tab', { isComposing: true })).toBeNull()
    expect(shortcut('Tab', { altKey: true })).toBeNull()
    expect(shortcut('p')).toBeNull()
  })
})
