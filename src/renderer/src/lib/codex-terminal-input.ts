const CODEX_WIN32_CTRL_J_SEQUENCE = '\x1b[74;36;10;1;8;1_'

export function isCodexMultilineShortcut(
  preset: string | undefined,
  event: KeyboardEvent,
): boolean {
  if (preset !== 'codex' || event.type !== 'keydown') return false

  return (event.key === 'Enter' && event.shiftKey)
    || (event.ctrlKey && event.key.toLowerCase() === 'j')
}

export function getCodexMultilineInput(
  preset: string | undefined,
  event: KeyboardEvent,
  win32InputMode = false,
): string | null {
  if (!isCodexMultilineShortcut(preset, event)) return null

  return win32InputMode && event.ctrlKey && event.key.toLowerCase() === 'j'
    ? CODEX_WIN32_CTRL_J_SEQUENCE
    : null
}

export function handleCodexMultilineInput(
  preset: string | undefined,
  event: KeyboardEvent,
  write: (data: string) => void,
  track: (data: string) => void,
  win32InputMode = false,
): false | null {
  const data = getCodexMultilineInput(preset, event, win32InputMode)
  if (!data) return null

  write(data)
  track(data)
  event.preventDefault()
  return false
}
