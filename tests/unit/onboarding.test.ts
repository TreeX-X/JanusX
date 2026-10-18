import { beforeEach, describe, expect, it, vi } from 'vitest'
import { advanceIntro, emptyLearningRecord, INTRO_STEPS, isIntroStepSatisfied, parseLearningRecord, type IntroFacts } from '../../src/renderer/src/features/onboarding/model'
import { LEARNING_STORAGE_KEY, useOnboardingStore as store } from '../../src/renderer/src/stores/onboarding'
import { createTerminalPaneContent, type WorkspacePaneNode } from '../../src/renderer/src/lib/workspace-pane'
import type { OpenFile, Terminal } from '../../src/renderer/src/types'

const data = new Map<string, string>()
beforeEach(() => {
  data.clear()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) })
  store.setState({ record: emptyLearningRecord(), view: 'closed' })
})

describe('learning progress and re-entry', () => {
  it('introduces empty installs once and leaves existing workspaces undisturbed', () => {
    store.getState().initialize(false)
    expect(store.getState().view).toBe('welcome')
    store.getState().close()
    store.getState().initialize(false)
    expect(store.getState().view).toBe('closed')
    store.setState({ record: emptyLearningRecord() })
    store.getState().initialize(true)
    expect(store.getState().view).toBe('closed')
    expect(store.getState().record.introduced).toBe(true)
  })

  it('restores the exact unfinished step after closing and reloading storage', () => {
    store.getState().start()
    store.getState().advance('done')
    store.getState().advance('skipped')
    store.getState().close()
    const restored = parseLearningRecord(data.get(LEARNING_STORAGE_KEY)!)
    store.setState({ record: restored })
    store.getState().openCenter()
    store.getState().start()
    expect(store.getState().view).toBe('tour')
    expect(store.getState().record.intro).toMatchObject({ step: 'split', outcomes: { workspace: 'done', terminal: 'skipped' }, finished: false })
  })

  it('never counts skips as completion and keeps prior completion when replaying', () => {
    store.getState().start()
    INTRO_STEPS.forEach(() => store.getState().advance('skipped'))
    expect(store.getState().view).toBe('finished')
    expect(store.getState().record.intro.completedAt).toBeNull()
    store.getState().start()
    INTRO_STEPS.forEach(() => store.getState().advance('done'))
    const completedAt = store.getState().record.intro.completedAt
    expect(completedAt).toBeTruthy()
    store.getState().start()
    expect(store.getState().record.intro).toMatchObject({ step: 'workspace', outcomes: {}, finished: false, completedAt })
  })

  it('handles bad storage and unavailable persistence without blocking learning', () => {
    for (const raw of ['{', 'null', '{"version":2}', '{"version":1,"intro":{"step":"missing","finished":true,"completedAt":"bad"}}']) {
      expect(parseLearningRecord(raw).intro).toMatchObject({ step: 'workspace', finished: false, completedAt: null })
    }
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('full') } })
    expect(() => store.getState().start()).not.toThrow()
    expect(store.getState().view).toBe('tour')
  })

  it('only completes an attempt after every action was verified', () => {
    let progress = emptyLearningRecord().intro
    for (let i = 0; i < 4; i++) progress = advanceIntro(progress, i === 1 ? 'skipped' : 'done', '2026-10-18T00:00:00Z')
    expect(progress.finished).toBe(true)
    expect(progress.completedAt).toBeNull()
  })
})

const terminal = (id: string, patch: Partial<Terminal> = {}): Terminal => ({
  id, name: id, workspaceId: 'ws', preset: 'shell', cwd: 'C:/project', shell: 'pwsh', pid: 123, status: 'wait', ...patch,
})
const leaf = (id: string, terminalId: string): WorkspacePaneNode => ({ type: 'leaf', id, tabs: [createTerminalPaneContent(terminalId, 'ws')], activeTabId: `terminal:${terminalId}` })
const facts = (patch: Partial<IntroFacts> = {}): IntroFacts => ({
  workspaceId: 'ws', scopePath: 'C:/project', terminals: [], paneTree: null, editorVisible: false, file: undefined, ...patch,
})

describe('real action verification', () => {
  it('requires an active project and a successfully spawned terminal from that project', () => {
    expect(isIntroStepSatisfied('workspace', facts({ workspaceId: null }))).toBe(false)
    expect(isIntroStepSatisfied('terminal', facts({ terminals: [terminal('a', { pid: null }), terminal('b', { status: 'error' }), terminal('c', { workspaceId: 'other' })] }))).toBe(false)
    expect(isIntroStepSatisfied('terminal', facts({ terminals: [terminal('ok')] }))).toBe(true)
  })

  it('requires live project terminals in separate panes, not just an empty split', () => {
    const split: WorkspacePaneNode = { type: 'split', id: 'split', direction: 'horizontal', ratio: .5, first: leaf('left', 'a'), second: leaf('right', 'b') }
    const state = facts({ terminals: [terminal('a'), terminal('b')], paneTree: split })
    expect(isIntroStepSatisfied('split', state)).toBe(true)
    expect(isIntroStepSatisfied('split', { ...state, terminals: [terminal('a')] })).toBe(false)
    expect(isIntroStepSatisfied('split', { ...state, paneTree: leaf('single', 'a') })).toBe(false)
  })

  it('accepts loaded embedded or standalone files only in the current worktree', () => {
    const file: OpenFile = { id: 'f', name: 'a.ts', path: 'a.ts', absolutePath: 'c:\\PROJECT\\a.ts', viewType: 'code', content: '', isDirty: false, isLoading: false }
    expect(isIntroStepSatisfied('files', facts({ file, editorVisible: true }))).toBe(true)
    for (const patch of [{ isLoading: true }, { error: 'failed' }, { viewType: 'binary' as const }, { absolutePath: 'C:/project-other/a.ts' }]) {
      expect(isIntroStepSatisfied('files', facts({ file: { ...file, ...patch }, editorVisible: true }))).toBe(false)
    }
    expect(isIntroStepSatisfied('files', facts({ viewedFile: { workspacePath: 'C:/PROJECT', filePath: 'C:/project/a.ts' } }))).toBe(true)
    expect(isIntroStepSatisfied('files', facts({ scopePath: 'C:/worktree', viewedFile: { workspacePath: 'C:/project', filePath: 'C:/project/a.ts' } }))).toBe(false)
  })
})
