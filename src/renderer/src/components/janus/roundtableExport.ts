import type { RoundtableState } from '../../../../shared/roundtable/events'

export type RoundtableExportOutcome = 'saved' | 'canceled'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Local `yyyyMMdd-HHmm` stamp for filenames. Pure for unit tests. */
export function formatExportTimestamp(date: Date = new Date()): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

/** First 12 chars of the topic with filesystem-illegal characters removed. */
export function sanitizeTopicSegment(topic: string | undefined): string {
  const cleaned = (topic ?? '').trim().replace(/\s+/g, '-').replace(/[\\/:"*?<>|]/g, '-').slice(0, 12)
  return cleaned || 'roundtable'
}

/**
 * `roundtable-{topic}-r{N}-{DRAFT|FINAL}-{yyyyMMdd-HHmm}.md`.
 * Any non-ended phase exports as DRAFT; only `ended` exports as FINAL.
 */
export function buildRoundtableFilename(
  state: Pick<RoundtableState, 'userInput' | 'roundNumber' | 'phase'>,
  now: Date = new Date(),
): string {
  const tag = state.phase === 'ended' ? 'FINAL' : 'DRAFT'
  return `roundtable-${sanitizeTopicSegment(state.userInput)}-r${state.roundNumber}-${tag}-${formatExportTimestamp(now)}.md`
}

/** Prefix a mid-meeting snapshot so a DRAFT can never pass as the final record. */
export function withDraftWatermark(markdown: string, roundNumber: number, now: Date = new Date()): string {
  return `> DRAFT — 第 ${roundNumber} 轮 · ${now.toLocaleString()} · 终稿以结束会议为准\n\n${markdown}`
}

/** Fetch the traceable Markdown record for a session (DRAFT or FINAL by phase). */
export async function fetchRoundtableMarkdown(sessionId: string): Promise<string> {
  if (!window.electron.roundtable) throw new Error('Roundtable export is unavailable')
  return window.electron.roundtable.export(sessionId)
}

/** Save dialog + write, following the quick-note export pattern. Throws on write errors. */
export async function saveMarkdownViaDialog(defaultName: string, markdown: string): Promise<RoundtableExportOutcome> {
  const dialog = await window.electron.dialog.saveFile({ defaultName, extension: 'md' })
  if (dialog.canceled || !dialog.filePath) return 'canceled'
  const result = await window.electron.file.save(dialog.filePath, markdown)
  if (result?.error) throw new Error(result.error)
  return 'saved'
}

/** Clipboard with a legacy execCommand fallback so export always has a way out. */
export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    /* fall through to the legacy path */
  }
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    document.execCommand('copy')
  } finally {
    area.remove()
  }
}
