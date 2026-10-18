// Note: first-run learning and replay semantics — see .agents/notes/workbench/first-run-learning.md
import { create } from 'zustand'
import { advanceIntro, emptyLearningRecord, parseLearningRecord, type IntroStep, type LearningRecord, type StepOutcome } from '@/features/onboarding/model'

export const LEARNING_STORAGE_KEY = 'janusx:learning:v1'
type LearningView = 'closed' | 'welcome' | 'center' | 'tour' | 'finished'

function readRecord(): LearningRecord {
  try { return parseLearningRecord(localStorage.getItem(LEARNING_STORAGE_KEY)) } catch { return emptyLearningRecord() }
}

interface OnboardingStore {
  record: LearningRecord
  view: LearningView
  initialize: (hasWorkspaces: boolean) => void
  openCenter: () => void
  close: () => void
  start: (restart?: boolean) => void
  goTo: (step: IntroStep) => void
  advance: (outcome: StepOutcome) => void
}

export const useOnboardingStore = create<OnboardingStore>((set, get) => {
  const save = (record: LearningRecord): void => {
    try { localStorage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(record)) } catch { /* learning remains usable without storage */ }
    set({ record })
  }
  return {
    record: readRecord(),
    view: 'closed',
    initialize: (hasWorkspaces) => {
      const { record, view } = get()
      if (record.introduced || view !== 'closed') return
      save({ ...record, introduced: true })
      // Introducing the feature to existing users must not interrupt restored work.
      if (!hasWorkspaces) set({ view: 'welcome' })
    },
    openCenter: () => {
      save({ ...get().record, introduced: true })
      set({ view: 'center' })
    },
    close: () => set({ view: 'closed' }),
    start: (restart = false) => {
      const { record } = get()
      const intro = restart || record.intro.finished
        ? { ...emptyLearningRecord().intro, completedAt: record.intro.completedAt }
        : record.intro
      save({ ...record, introduced: true, intro: { ...intro, started: true } })
      set({ view: 'tour' })
    },
    goTo: (step) => {
      const { record } = get()
      save({ ...record, introduced: true, intro: { ...record.intro, step, started: true, finished: false } })
      set({ view: 'tour' })
    },
    advance: (outcome) => {
      const { record } = get()
      const intro = advanceIntro(record.intro, outcome, new Date().toISOString())
      save({ ...record, intro })
      if (intro.finished) set({ view: 'finished' })
    },
  }
})
