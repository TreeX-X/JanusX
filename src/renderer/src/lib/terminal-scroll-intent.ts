import { syncTerminalScrollbar } from './terminal-scrollbar-sync'

export type TerminalScrollIntentKind = 'followOutput' | 'pinnedViewport'

interface TerminalBufferState {
  type: 'normal' | 'alternate'
  viewportY: number
  baseY: number
}

export interface TerminalScrollIntentTarget {
  buffer: { active: TerminalBufferState; normal: TerminalBufferState }
  scrollLines: (amount: number) => void
  scrollToBottom: () => void
  scrollToLine: (line: number) => void
}

export interface TerminalScrollIntentSnapshot {
  kind: TerminalScrollIntentKind
  bufferType: 'normal' | 'alternate'
  viewportY: number
  baseY: number
  revision: number
}

export interface TerminalScrollIntentController {
  capture: () => TerminalScrollIntentSnapshot
  enforce: (snapshot: TerminalScrollIntentSnapshot) => void
  enforceCurrent: () => void
  beginUserScroll: () => void
  commitUserScroll: () => void
  recordUserScroll: () => void
  handleBufferChange: (type: 'normal' | 'alternate') => void
}

export function createTerminalScrollIntentController(
  target: TerminalScrollIntentTarget,
  defer: (callback: () => void) => void = queueMicrotask,
): TerminalScrollIntentController {
  let revision = 0
  let userScrollActive = false
  let normalIntent = intentFromBuffer(target.buffer.normal, revision)

  const capture = (): TerminalScrollIntentSnapshot => {
    if (target.buffer.active.type === 'alternate') {
      return { kind: 'followOutput', bufferType: 'alternate', viewportY: 0, baseY: 0, revision }
    }
    if (userScrollActive) return intentFromBuffer(target.buffer.active, revision)
    return { ...normalIntent, revision }
  }

  const enforce = (snapshot: TerminalScrollIntentSnapshot) => {
    if (snapshot.revision !== revision || snapshot.bufferType !== 'normal') return
    if (userScrollActive || target.buffer.active.type !== 'normal') return

    if (snapshot.kind === 'followOutput') {
      target.scrollToBottom()
    } else {
      target.scrollToLine(clampLine(snapshot.viewportY, target.buffer.active.baseY))
    }
    normalIntent = intentFromBuffer(target.buffer.active, revision, snapshot.kind)
    syncTerminalScrollbar(target)
  }

  const enforceCurrent = () => enforce({ ...normalIntent, revision })

  const beginUserScroll = () => {
    userScrollActive = true
    revision += 1
  }

  const commitUserScroll = () => {
    userScrollActive = false
    if (target.buffer.active.type !== 'normal') return
    normalIntent = intentFromBuffer(target.buffer.active, revision)
    syncTerminalScrollbar(target)
  }

  const recordUserScroll = () => {
    beginUserScroll()
    const interactionRevision = revision
    defer(() => {
      if (interactionRevision !== revision) return
      commitUserScroll()
    })
  }

  const handleBufferChange = (type: 'normal' | 'alternate') => {
    revision += 1
    normalIntent = intentFromBuffer(target.buffer.normal, revision, normalIntent.kind)
    if (type === 'normal') enforceCurrent()
  }

  return {
    capture,
    enforce,
    enforceCurrent,
    beginUserScroll,
    commitUserScroll,
    recordUserScroll,
    handleBufferChange,
  }
}

function intentFromBuffer(
  buffer: TerminalBufferState,
  revision: number,
  preferredKind?: TerminalScrollIntentKind,
): TerminalScrollIntentSnapshot {
  const atBottom = buffer.viewportY >= buffer.baseY
  return {
    kind: preferredKind === 'pinnedViewport' && !atBottom
      ? 'pinnedViewport'
      : atBottom
        ? 'followOutput'
        : 'pinnedViewport',
    bufferType: 'normal',
    viewportY: buffer.viewportY,
    baseY: buffer.baseY,
    revision,
  }
}

function clampLine(line: number, baseY: number): number {
  return Math.max(0, Math.min(line, baseY))
}
