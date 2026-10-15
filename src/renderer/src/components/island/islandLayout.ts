export interface IslandBox { left: number; top: number; width: number; height: number }
export type CompanionMode = 'parallel' | 'compact' | 'stacked' | 'focus'
export interface CompanionLayout {
  mode: CompanionMode; main: IslandBox; companion: IslandBox; compact: boolean; switcher?: IslandBox
}

/** Both left memo and right roundtable surfaces share the same viewport constraints. */
export function layoutCompanionIslands({ viewportWidth, viewportHeight, companionWidth = 460, compactWidth = 320, side = 'left', previousMode, topInset = 12 }: {
  viewportWidth: number; viewportHeight: number; companionWidth?: number; compactWidth?: number
  side?: 'left' | 'right'; previousMode?: CompanionMode; topInset?: number
}): CompanionLayout {
  const gap = 12
  const width = Math.max(1, viewportWidth - 24)
  const top = Math.max(12, topInset)
  const height = Math.max(1, viewportHeight - top - 12)
  const fullRecovery = previousMode && previousMode !== 'parallel' ? 32 : 0
  const compactRecovery = previousMode === 'stacked' || previousMode === 'focus' ? 32 : 0
  const full = width >= 560 + companionWidth + gap + fullRecovery
  if (full || width >= 560 + compactWidth + gap + compactRecovery) {
    const panelWidth = full ? companionWidth : compactWidth
    const mainWidth = Math.min(880, width - panelWidth - gap)
    const left = (viewportWidth - mainWidth - panelWidth - gap) / 2
    const sharedHeight = Math.min(560, height)
    return {
      mode: full ? 'parallel' : 'compact', compact: !full,
      main: { left: side === 'left' ? left + panelWidth + gap : left, top, width: mainWidth, height: sharedHeight },
      companion: { left: side === 'left' ? left : left + mainWidth + gap, top, width: panelWidth, height: sharedHeight },
    }
  }
  if (height >= 360 + 280 + gap + (previousMode === 'focus' ? 32 : 0)) {
    const mainWidth = Math.min(880, width)
    const panelWidth = Math.min(companionWidth, width)
    const mainHeight = Math.min(560, height - 280 - gap)
    return {
      mode: 'stacked', compact: panelWidth < companionWidth,
      main: { left: (viewportWidth - mainWidth) / 2, top, width: mainWidth, height: mainHeight },
      companion: { left: (viewportWidth - panelWidth) / 2, top: top + mainHeight + gap, width: panelWidth, height: Math.min(560, height - mainHeight - gap) },
    }
  }
  const paneWidth = Math.min(880, width)
  const switchHeight = Math.min(32, Math.max(1, height - 1))
  const main = { left: (viewportWidth - paneWidth) / 2, top: top + switchHeight + gap, width: paneWidth, height: Math.max(1, height - switchHeight - gap) }
  return { mode: 'focus', main, companion: { ...main }, compact: paneWidth < companionWidth,
    switcher: { left: main.left, top, width: paneWidth, height: switchHeight } }
}
