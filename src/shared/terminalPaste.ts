const BRACKETED_PASTE_START = '\x1b[200~'
const BRACKETED_PASTE_END = '\x1b[201~'

export function encodeTerminalPaste(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return `${BRACKETED_PASTE_START}${normalized}${BRACKETED_PASTE_END}`
}
