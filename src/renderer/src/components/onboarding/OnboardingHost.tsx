// Note: .agents/notes/workbench/first-run-learning.md owns first-run, progress and replay behavior.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, FolderOpen, LayoutPanelLeft, SquareTerminal, Files, X, BookOpen } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { useOnboardingStore } from '@/stores/onboarding'
import { useWorkspaceStore } from '@/stores/workspace'
import { useWorktreeStore } from '@/stores/worktree'
import { useEditorStore } from '@/stores/editor'
import { useAppStore } from '@/stores/app'
import { useRightToolStore } from '@/stores/right-tools'
import { useExperimentalStore } from '@/stores/experimental'
import { useTeamStore } from '@/stores/team'
import { chooseAndCreateWorkspace, getActiveScopePath, loadWorkspaceFileTree } from '@/features/workspace/actions'
import { launchTerminalPreset } from '@/lib/terminal-launch'
import { INTRO_STEPS, isIntroStepSatisfied, liveIntroTerminals, type IntroFacts, type IntroStep } from '@/features/onboarding/model'
import { useBrowserOcclusion } from '@/hooks/useBrowserOcclusion'
import { ModalFrame } from '@/components/shared/ModalFrame'
import styles from './Onboarding.module.css'

const STEP_ICONS = { workspace: FolderOpen, terminal: SquareTerminal, split: LayoutPanelLeft, files: Files }
const TARGETS: Record<IntroStep, string> = {
  workspace: '[data-onboarding="add-workspace"]',
  terminal: '[data-onboarding="shell"], [data-onboarding="new-terminal"]',
  split: '[data-pane-region="project"] [data-tab-strip]',
  files: '[data-onboarding="files"]',
}

export function OnboardingHost({ workspaceReady }: { workspaceReady: boolean }) {
  const view = useOnboardingStore(s => s.view)
  const workspaceCount = useWorkspaceStore(s => s.workspaces.length)
  const experimentalLoaded = useExperimentalStore(s => s.loaded)
  const teamCollab = useExperimentalStore(s => s.teamCollab)
  const teamStatus = useTeamStore(s => s.status)
  const tenantCount = useTeamStore(s => s.tenants.length)
  const gateForced = useTeamStore(s => s.gateForced)
  const blocked = gateForced || !experimentalLoaded
    || (teamCollab && (teamStatus === 'unknown' || teamStatus === 'guest' || (teamStatus === 'authed' && tenantCount === 0)))

  useEffect(() => {
    if (workspaceReady && !blocked) useOnboardingStore.getState().initialize(workspaceCount > 0)
  }, [workspaceReady, blocked, workspaceCount])

  if (blocked || view === 'closed') return null
  return view === 'tour' ? <IntroTour /> : <LearningOverview />
}

function LearningOverview() {
  const { t } = useI18n('common')
  const view = useOnboardingStore(s => s.view)
  const intro = useOnboardingStore(s => s.record.intro)
  const rootRef = useRef<HTMLDivElement>(null)
  const welcome = view === 'welcome'
  const finished = view === 'finished'
  const title = welcome ? t('common:learning.welcomeTitle')
    : finished ? t('common:learning.finishTitle') : t('common:learning.title')
  const completed = Object.values(intro.outcomes).filter(outcome => outcome === 'done').length
  const skipped = Object.values(intro.outcomes).filter(outcome => outcome === 'skipped').length

  useEffect(() => {
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      if (!buttons?.length) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      const outside = !rootRef.current?.contains(document.activeElement)
      if (outside || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      }
    }
    document.addEventListener('keydown', trapTab)
    return () => document.removeEventListener('keydown', trapTab)
  }, [])

  return (
    <ModalFrame label={title} onClose={() => useOnboardingStore.getState().close()}
      panelClassName={styles.overview} zIndex={10020} focusPanelOnReveal>
      {({ requestClose }) => (
        <div ref={rootRef} className={styles.overviewBody}>
          <div className={styles.overviewContent}>
          <header className={styles.header}>
            <span className={styles.eyebrow}>JanusX · {t('common:learning.introTitle')}</span>
            <button type="button" className={styles.iconButton} aria-label={t('common:action.close')} onClick={requestClose}><X size={17} /></button>
          </header>
          <h1>{title}</h1>
          <p className={styles.description}>{welcome ? t('common:learning.welcomeBody')
            : finished ? t('common:learning.finishBody') : t('common:learning.centerBody')}</p>
          <div className={styles.courseMeta}>
            <span>{t('common:learning.duration')}</span>
            {intro.completedAt && <span className={styles.success}><Check size={13} />{t('common:learning.previouslyCompleted')}</span>}
          </div>
          <ol className={styles.lessons}>
            {INTRO_STEPS.map((step, index) => {
              const Icon = STEP_ICONS[step]
              const outcome = intro.outcomes[step]
              return <li key={step}>
                <span className={styles.lessonIcon}><Icon size={18} /></span>
                <div><strong>{t(`common:learning.steps.${step}.title`)}</strong>
                  <span>{t(`common:learning.steps.${step}.summary`)}</span></div>
                <span className={outcome === 'done' ? styles.success : styles.lessonState}>
                  {outcome === 'done' ? <Check size={16} aria-label={t('common:learning.done')} />
                    : outcome === 'skipped' ? t('common:learning.skipped') : String(index + 1).padStart(2, '0')}
                </span>
              </li>
            })}
          </ol>
          {intro.started && <p className={styles.progressSummary}>{t('common:learning.summary', { completed, skipped })}</p>}
          <p className={styles.returnHint}><BookOpen size={14} />{t('common:learning.returnHint')}</p>
          </div>
          <footer className={`${styles.actions} ${styles.overviewFooter}`}>
            {(welcome || finished) && <button type="button" className={styles.secondary} onClick={requestClose}>
              {welcome ? t('common:learning.directUse') : t('common:learning.continueWorking')}
            </button>}
            {!welcome && intro.started && !intro.finished && <button type="button" className={styles.secondary}
              onClick={() => useOnboardingStore.getState().start(true)}>{t('common:learning.restart')}</button>}
            <button type="button" className={styles.primary} onClick={() => useOnboardingStore.getState().start()}>
              {intro.finished ? t('common:learning.replay') : intro.started ? t('common:learning.resume') : t('common:learning.start')}
              <ArrowRight size={15} />
            </button>
          </footer>
        </div>
      )}
    </ModalFrame>
  )
}

/** Highlight a visible, stable anchor; never capture input or freeze the workspace. */
function TargetHighlight({ selector, enabled }: { selector: string; enabled: boolean }) {
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useEffect(() => {
    if (!enabled) return
    const update = () => {
      const target = [...document.querySelectorAll<HTMLElement>(selector)].find(node => {
        const bounds = node.getBoundingClientRect()
        return bounds.width > 0 && bounds.height > 0 && !node.closest('[inert], [aria-hidden="true"]')
      })
      if (!target) { setRect(null); return }
      const bounds = target.getBoundingClientRect()
      const left = Math.max(3, bounds.left - 4)
      const top = Math.max(3, bounds.top - 4)
      const next = { left, top, width: Math.max(0, Math.min(bounds.right + 4, window.innerWidth - 3) - left),
        height: Math.max(0, Math.min(bounds.bottom + 4, window.innerHeight - 3) - top) }
      setRect(previous => previous && previous.left === next.left && previous.top === next.top
        && previous.width === next.width && previous.height === next.height ? previous : next)
    }
    update()
    let frame: number | null = null
    const scheduleUpdate = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => { frame = null; update() })
    }
    const observer = new MutationObserver(scheduleUpdate)
    // Do not observe our highlight's style updates (which would create a loop).
    observer.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })
    const timer = window.setInterval(update, 300)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { observer.disconnect(); if (frame !== null) window.cancelAnimationFrame(frame); window.clearInterval(timer); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [selector, enabled])
  return enabled && rect ? createPortal(<div className={styles.highlight} style={rect} aria-hidden="true" />, document.body) : null
}

function IntroTour() {
  const { t } = useI18n('common')
  const step = useOnboardingStore(s => s.record.intro.step)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)
  const workspace = useWorkspaceStore(s => s.workspaces.find(w => w.id === s.activeWorkspaceId))
  const worktreePath = useWorktreeStore(s => workspaceId ? s.activePaths[workspaceId] : undefined)
  const terminals = useWorkspaceStore(s => s.terminals)
  const paneTree = useWorkspaceStore(s => s.paneTree)
  const file = useEditorStore(s => s.openFiles.find(f => f.id === s.activeFileId))
  const editorVisible = useEditorStore(s => s.isVisible)
  const scopePath = worktreePath ?? workspace?.path ?? null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [viewedFile, setViewedFile] = useState<IntroFacts['viewedFile']>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)
  const facts: IntroFacts = { workspaceId, scopePath, terminals, paneTree, file, editorVisible, viewedFile }
  const satisfied = isIntroStepSatisfied(step, facts)
  const liveTerminals = liveIntroTerminals(facts)
  const needsWorkspace = step !== 'workspace' && !workspace
  const target = needsWorkspace ? TARGETS.workspace : TARGETS[step]
  useBrowserOcclusion(!modalOpen)

  useEffect(() => {
    const update = () => setModalOpen(Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')))
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] })
    return () => observer.disconnect()
  }, [])
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); setError(false) }, [step])
  useEffect(() => window.electron.window.onEditorViewed(setViewedFile), [])
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const performAction = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(false)
    try {
      if (needsWorkspace) { useOnboardingStore.getState().goTo('workspace'); return }
      if (step === 'workspace') {
        const created = await chooseAndCreateWorkspace()
        if (!created) return
        const store = useWorkspaceStore.getState()
        if (!store.workspaces.some(w => w.id === created.id)) store.addWorkspace(created)
        store.setActiveWorkspace(created.id)
        useAppStore.getState().setLoadState('no-terminal')
        await loadWorkspaceFileTree(created.path, () => getActiveScopePath() === created.path, { visualTransition: true })
      } else if ((step === 'terminal' || step === 'split') && workspace && scopePath) {
        const result = await launchTerminalPreset({ preset: 'shell', workspaceId: workspace.id, workspacePath: workspace.path, cwd: scopePath })
        if (!result?.ok) throw new Error('Terminal launch failed')
      } else if (step === 'files') {
        useRightToolStore.getState().openTool('files')
        useAppStore.getState().setPanelCollapsed(false)
      }
    } catch {
      if (mountedRef.current) setError(true)
    } finally {
      busyRef.current = false
      if (mountedRef.current) setBusy(false)
    }
  }
  const actionAvailable = needsWorkspace || (step === 'workspace' && !satisfied)
    || (step === 'terminal' && !satisfied) || (step === 'split' && liveTerminals.length < 2) || (step === 'files' && !satisfied)
  const actionLabel = needsWorkspace ? t('common:learning.chooseProject')
    : step === 'workspace' ? t('common:learning.chooseFolder')
      : step === 'files' ? t('common:learning.openFiles')
        : step === 'split' ? t('common:learning.addShell') : t('common:learning.openShell')

  if (modalOpen) return null
  return createPortal(
    <>
      <TargetHighlight selector={target} enabled={!busy} />
      <section role="region" aria-label={t('common:learning.introTitle')} className={styles.tour} data-onboarding-step={step}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); useOnboardingStore.getState().close() } }}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>{t('common:learning.stepCount', { current: INTRO_STEPS.indexOf(step) + 1, total: INTRO_STEPS.length })}</span>
          <button type="button" disabled={busy} className={styles.iconButton} aria-label={t('common:learning.exit')}
            onClick={() => useOnboardingStore.getState().close()}><X size={16} /></button>
        </header>
        <div className={styles.stepTrack} aria-hidden="true">{INTRO_STEPS.map((item, index) => <span key={item} data-current={index <= INTRO_STEPS.indexOf(step)} />)}</div>
        <h2 ref={headingRef} tabIndex={-1}>{t(`common:learning.steps.${step}.title`)}</h2>
        <p className={styles.description}>{needsWorkspace ? t('common:learning.projectMissing') : t(`common:learning.steps.${step}.body`)}</p>
        {scopePath && (step === 'workspace' || step === 'terminal') && <p className={styles.path} title={scopePath}>{scopePath}</p>}
        {step === 'terminal' && <p className={styles.note}>{t('common:learning.cliHint')}</p>}
        {step === 'split' && !needsWorkspace && <div className={styles.splitExample} aria-hidden="true"><span>Shell 01</span><ArrowRight size={15} /><div><span>Shell 01</span><span>Shell 02</span></div></div>}
        <p className={satisfied ? styles.success : styles.note} role="status">
          {satisfied ? <><Check size={14} />{t('common:learning.verified')}</> : t(`common:learning.steps.${step}.waiting`)}
        </p>
        {error && <p className={styles.error} role="alert">{t('common:learning.actionError')}</p>}
        {actionAvailable && <button type="button" className={styles.secondary} disabled={busy} onClick={() => void performAction()}>
          {busy ? t('common:status.loading') : actionLabel}
        </button>}
        <p className={styles.savedHint}>{t('common:learning.savedHint')}</p>
        <footer className={styles.actions}>
          <button type="button" className={styles.textButton} disabled={busy} onClick={() => useOnboardingStore.getState().advance('skipped')}>{t('common:learning.skipStep')}</button>
          <button type="button" className={styles.primary} disabled={!satisfied || busy} onClick={() => useOnboardingStore.getState().advance('done')}>
            {step === 'files' ? t('common:learning.finish') : t('common:learning.next')}<ArrowRight size={14} />
          </button>
        </footer>
      </section>
    </>, document.body,
  )
}
