import type { OpenFile, Terminal } from '@/types'
import { getLeafPanes, type WorkspacePaneNode } from '@/lib/workspace-pane'

export const INTRO_STEPS = ['workspace', 'terminal', 'split', 'files'] as const
export type IntroStep = typeof INTRO_STEPS[number]
export type StepOutcome = 'done' | 'skipped'

export interface IntroProgress {
  started: boolean
  step: IntroStep
  outcomes: Partial<Record<IntroStep, StepOutcome>>
  finished: boolean
  /** Kept when replaying: a new attempt never erases a prior completion. */
  completedAt: string | null
}

export interface LearningRecord {
  version: 1
  introduced: boolean
  intro: IntroProgress
}

export function emptyLearningRecord(): LearningRecord {
  return {
    version: 1,
    introduced: false,
    intro: { started: false, step: 'workspace', outcomes: {}, finished: false, completedAt: null },
  }
}

/** Stored data is untrusted; unknown versions/steps never make the guide unusable. */
export function parseLearningRecord(raw: string | null): LearningRecord {
  const fallback = emptyLearningRecord()
  try {
    const value = JSON.parse(raw ?? 'null')
    if (value?.version !== 1) return fallback
    const progress = value.intro
    const outcomes: IntroProgress['outcomes'] = {}
    for (const step of INTRO_STEPS) {
      const outcome = progress?.outcomes?.[step]
      if (outcome === 'done' || outcome === 'skipped') outcomes[step] = outcome
    }
    return {
      version: 1,
      introduced: value.introduced === true,
      intro: {
        started: progress?.started === true,
        step: INTRO_STEPS.includes(progress?.step) ? progress.step : 'workspace',
        outcomes,
        finished: progress?.finished === true && INTRO_STEPS.every(step => outcomes[step]),
        completedAt: typeof progress?.completedAt === 'string' && Number.isFinite(Date.parse(progress.completedAt))
          ? progress.completedAt : null,
      },
    }
  } catch {
    return fallback
  }
}

export function advanceIntro(progress: IntroProgress, outcome: StepOutcome, now: string): IntroProgress {
  const outcomes = { ...progress.outcomes, [progress.step]: outcome }
  const index = INTRO_STEPS.indexOf(progress.step)
  const finished = index === INTRO_STEPS.length - 1
  const complete = finished && INTRO_STEPS.every(step => outcomes[step] === 'done')
  return {
    ...progress,
    outcomes,
    step: INTRO_STEPS[Math.min(index + 1, INTRO_STEPS.length - 1)],
    finished,
    completedAt: progress.completedAt ?? (complete ? now : null),
  }
}

export interface IntroFacts {
  workspaceId: string | null
  scopePath: string | null
  terminals: Terminal[]
  paneTree: WorkspacePaneNode | null
  editorVisible: boolean
  file: OpenFile | undefined
  viewedFile?: { filePath: string; workspacePath: string } | null
}

export function liveIntroTerminals(facts: IntroFacts): Terminal[] {
  return facts.terminals.filter(terminal => terminal.workspaceId === facts.workspaceId
    && typeof terminal.pid === 'number' && terminal.pid > 0 && terminal.status !== 'error')
}

function normalizedPath(path: string): string {
  const value = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-z]:\//i.test(value) || value.startsWith('//') ? value.toLowerCase() : value
}

export function isIntroStepSatisfied(step: IntroStep, facts: IntroFacts): boolean {
  if (!facts.workspaceId || !facts.scopePath) return false
  if (step === 'workspace') return true
  if (step === 'terminal') return liveIntroTerminals(facts).length > 0
  if (step === 'split') {
    const liveIds = new Set(liveIntroTerminals(facts).map(terminal => terminal.id))
    return getLeafPanes(facts.paneTree).filter(leaf => leaf.tabs.some(tab =>
      tab.type === 'terminal' && tab.workspaceId === facts.workspaceId && liveIds.has(tab.terminalId),
    )).length >= 2
  }
  const viewed = facts.viewedFile
  if (viewed && normalizedPath(viewed.workspacePath) === normalizedPath(facts.scopePath)
    && normalizedPath(viewed.filePath).startsWith(`${normalizedPath(facts.scopePath)}/`)) return true
  const file = facts.file
  if (!facts.editorVisible || !file || file.isLoading || file.error || file.viewType === 'binary') return false
  return normalizedPath(file.absolutePath).startsWith(`${normalizedPath(facts.scopePath)}/`)
}
