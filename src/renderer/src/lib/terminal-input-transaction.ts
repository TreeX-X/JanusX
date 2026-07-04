export interface TerminalInputTransactionState {
  text: string
  inEsc: boolean
  inCSI: boolean
  inControlString: boolean
  controlStringEsc: boolean
  inBracketedPaste: boolean
}

export interface TerminalInputChunkResult {
  state: TerminalInputTransactionState
  commitNow: boolean
  softEnterCount: number
}

export interface TerminalInputChunkOptions {
  softEnterCount?: number
}

const BRACKETED_PASTE_START = '\x1b[200~'
const BRACKETED_PASTE_END = '\x1b[201~'
const SOFT_ENTER_SEQUENCE = /^\x1b\[13;\d+u/
const ENTER_SEQUENCE = /^\x1b\[13;\d+u/
const WIN32_CTRL_J_SEQUENCE = /^\x1b\[74;\d+;10;1;\d+;\d+_/
const CSI_RESPONSE_FRAGMENT = /^\[\?[\d;]*[A-Za-z]/
const OSC_RESPONSE_FRAGMENT = /^\]\d+;.*?(?:\x07|\\)/

export function createTerminalInputTransactionState(): TerminalInputTransactionState {
  return {
    text: '',
    inEsc: false,
    inCSI: false,
    inControlString: false,
    controlStringEsc: false,
    inBracketedPaste: false,
  }
}

export function normalizeTerminalInputPreviewText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function applyTerminalInputChunk(
  state: TerminalInputTransactionState,
  data: string,
  options: TerminalInputChunkOptions = {},
): TerminalInputChunkResult {
  const next = { ...state }
  const isBulkInput = data.length > 1
  let commitNow = false
  let softEnterCount = options.softEnterCount ?? 0

  for (let index = 0; index < data.length; index += 1) {
    if (isBulkInput && !next.inEsc && !next.inCSI && !next.inControlString) {
      const terminalResponseFragment = data.slice(index).match(CSI_RESPONSE_FRAGMENT)
        ?? data.slice(index).match(OSC_RESPONSE_FRAGMENT)
      if (terminalResponseFragment) {
        index += terminalResponseFragment[0].length - 1
        continue
      }
    }

    if (data.startsWith(BRACKETED_PASTE_START, index)) {
      next.inBracketedPaste = true
      index += BRACKETED_PASTE_START.length - 1
      continue
    }

    if (data.startsWith(BRACKETED_PASTE_END, index)) {
      next.inBracketedPaste = false
      index += BRACKETED_PASTE_END.length - 1
      continue
    }

    if (softEnterCount > 0) {
      const softEnterMatch = data.slice(index).match(SOFT_ENTER_SEQUENCE)
      if (softEnterMatch) {
        next.text += '\n'
        softEnterCount -= 1
        index += softEnterMatch[0].length - 1
        continue
      }

      const win32CtrlJMatch = data.slice(index).match(WIN32_CTRL_J_SEQUENCE)
      if (win32CtrlJMatch) {
        next.text += '\n'
        softEnterCount -= 1
        index += win32CtrlJMatch[0].length - 1
        continue
      }
    }

    const enterMatch = data.slice(index).match(ENTER_SEQUENCE)
    if (enterMatch) {
      commitNow = true
      index += enterMatch[0].length - 1
      continue
    }

    const ch = data[index]
    const code = ch.charCodeAt(0)

    if (next.inControlString) {
      if (next.controlStringEsc) {
        next.controlStringEsc = false
        if (ch === '\\') {
          next.inControlString = false
        }
        continue
      }
      if (code === 0x1b) {
        next.controlStringEsc = true
        continue
      }
      if (code === 0x07) {
        next.inControlString = false
      }
      continue
    }

    if (code === 0x1b) {
      next.inEsc = true
      next.inCSI = false
      continue
    }

    if (next.inEsc && !next.inCSI) {
      if (code === 0x5b) {
        next.inCSI = true
      } else if (code === 0x5d || code === 0x50 || code === 0x5f || code === 0x5e) {
        next.inEsc = false
        next.inControlString = true
        next.controlStringEsc = false
      } else {
        next.inEsc = false
      }
      continue
    }

    if (next.inCSI) {
      if (code >= 0x40 && code <= 0x7e) {
        next.inEsc = false
        next.inCSI = false
      }
      continue
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && data[index + 1] === '\n') {
        index += 1
      }

      if (softEnterCount > 0 && !next.inBracketedPaste && !isBulkInput) {
        next.text += '\n'
        softEnterCount -= 1
      } else if (next.inBracketedPaste || isBulkInput) {
        next.text += '\n'
        if (softEnterCount > 0 && next.inBracketedPaste) {
          softEnterCount -= 1
        }
      } else {
        commitNow = true
      }
      continue
    }

    if (code === 0x7f || code === 0x08) {
      next.text = next.text.slice(0, -1)
      continue
    }

    if (code >= 0x20) {
      next.text += ch
    }
  }

  return {
    state: next,
    commitNow,
    softEnterCount,
  }
}
