const CODEX_SOFT_ENTER_SEQUENCE = '\x1b[13;2u'

export function getCodexMultilineInput(
  preset: string | undefined,
  event: KeyboardEvent,
): string | null {
  if (preset !== 'codex' || event.type !== 'keydown') return null

  if (event.key === 'Enter' && event.shiftKey) {
    return CODEX_SOFT_ENTER_SEQUENCE
  }

  if (event.ctrlKey && event.key.toLowerCase() === 'j') {
    return CODEX_SOFT_ENTER_SEQUENCE
  }

  return null
}

export function handleCodexMultilineInput(
  preset: string | undefined,
  event: KeyboardEvent,
  write: (data: string) => void,
  track: (data: string) => void,
): false | null {
  const data = getCodexMultilineInput(preset, event)
  if (!data) return null

  write(data)
  track(data)
  event.preventDefault()
  return false
}
