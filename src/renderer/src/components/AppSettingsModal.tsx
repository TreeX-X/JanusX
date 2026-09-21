import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ModalCloseButton } from './ModalCloseButton'
import { useWorkbenchPhase } from '@/components/shared/CardFrame'
import { GeneralSettingsPanel } from './GeneralSettingsPanel'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
import { KnowledgeSettingsPanel } from './KnowledgeSettingsPanel'
import { LlmConfigModal } from './LlmConfigModal'
import { ModelCatalogPanel } from './ModelCatalogPanel'
import { AgentSettingsPanel } from './AgentSettingsPanel'
import { HostedSettingsPanel } from './HostedSettingsPanel'
import { TeamSettingsPanel } from './team/TeamSettingsPanel'
import { useI18n } from '@/i18n/useI18n'
import styles from './AppSettingsModal.module.css'

export type SettingsTab = 'general' | 'notifications' | 'knowledge' | 'agent' | 'llm' | 'models' | 'team' | 'hosted'

interface AppSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: SettingsTab
}

const TAB_ORDER: SettingsTab[] = ['general', 'notifications', 'knowledge', 'agent', 'llm', 'models', 'team', 'hosted']

// Note: settings open/close mirrors the blueprint workbench card lifecycle — see .agents/notes/implemented/feature/2026-09-18-settings-workbench-transition.md
const SETTINGS_CARD_ENTER_DURATION_MS = 260
const SETTINGS_EXIT_BUFFER_MS = 60
const SETTINGS_EXIT_MS = SETTINGS_CARD_ENTER_DURATION_MS + SETTINGS_EXIT_BUFFER_MS

export function AppSettingsModal({ isOpen, onClose, initialTab = 'general' }: AppSettingsModalProps) {
  const { t } = useI18n('settings')
  const { t: tTeam } = useI18n('team')
  const { t: tCommon } = useI18n('common')
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [revealReady, setRevealReady] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<Element | null>(null)

  const handleHidden = useCallback(() => {
    const trigger = triggerRef.current as HTMLElement | null
    triggerRef.current = null
    if (trigger && typeof trigger.focus === 'function') trigger.focus()
    onClose()
  }, [onClose])

  // Shared card-frame lifecycle (§9): hidden/open/closing with a stuck-animation
  // safety net; the parent stays open until the exit animation finishes.
  const { phase, isClosing, requestClose: phaseRequestClose, handleExitFinished } = useWorkbenchPhase(
    isOpen,
    { awaitAnimation: true, exitMs: SETTINGS_EXIT_MS, onClose: handleHidden },
  )
  const requestClose = useCallback(() => {
    phaseRequestClose()
  }, [phaseRequestClose])

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement
      setActiveTab(initialTab)
      setRevealReady(false)
      const frame = requestAnimationFrame(() => setRevealReady(true))
      return () => cancelAnimationFrame(frame)
    }
    return undefined
  }, [isOpen, initialTab])

  useEffect(() => {
    if (revealReady) panelRef.current?.focus({ preventScroll: true })
  }, [revealReady, phase])

  useEffect(() => {
    if (!isOpen || isClosing) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      requestClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isClosing, requestClose])

  if (phase === 'hidden') return null

  // team 页文案走 team 命名空间（settings.json 存在历史编码损坏，不再追加 key）。
  // hosted 页同理走 common 命名空间。
  const tabNav = (tab: SettingsTab) =>
    tab === 'team'
      ? tTeam('team:settingsTab.nav')
      : tab === 'hosted'
        ? tCommon('common:hosted.nav')
        : t(`settings:tab.${tab}.nav`)
  const tabNavMeta = (tab: SettingsTab) =>
    tab === 'team'
      ? tTeam('team:settingsTab.navMeta')
      : tab === 'hosted'
        ? tCommon('common:hosted.navMeta')
        : t(`settings:tab.${tab}.navMeta`)
  const meta = activeTab === 'team'
    ? { title: tTeam('team:settingsTab.title'), subtitle: tTeam('team:settingsTab.subtitle') }
    : activeTab === 'hosted'
      ? { title: tCommon('common:hosted.title'), subtitle: tCommon('common:hosted.subtitle') }
      : {
        title: t(`settings:tab.${activeTab}.title`),
        subtitle: t(`settings:tab.${activeTab}.subtitle`),
      }

  return createPortal(
    <div
      className={styles.backdrop}
      data-closing={isClosing ? 'true' : undefined}
      data-reveal-ready={revealReady ? 'true' : undefined}
      onAnimationEnd={(event) => {
        if (!isClosing || event.target !== event.currentTarget) return
        handleExitFinished()
      }}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        requestClose()
      }}
      style={{ '--workbench-exit-duration': `${SETTINGS_EXIT_MS}ms` } as CSSProperties}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={meta.title}
        tabIndex={-1}
        ref={panelRef}
      >
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <span className={styles.brandTitle}>JanusX</span>
            <span className={styles.brandMeta}>{t('settings:brand')}</span>
          </div>
          {TAB_ORDER.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.tabButton} ${activeTab === tab ? styles.tabButtonActive : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              <span className={styles.tabLabel}>{tabNav(tab)}</span>
              <span className={styles.tabMeta}>{tabNavMeta(tab)}</span>
            </button>
          ))}
        </aside>

        <section className={styles.content}>
          <header className={styles.header}>
            <div className={styles.titleWrap}>
              <h2 className={styles.title}>{meta.title}</h2>
              <div className={styles.subtitle}>{meta.subtitle}</div>
            </div>
            <ModalCloseButton onClose={requestClose} />
          </header>

          <main className={styles.body}>
            {activeTab === 'general' && <GeneralSettingsPanel />}
            {activeTab === 'notifications' && <NotificationSettingsPanel />}
            {activeTab === 'knowledge' && <KnowledgeSettingsPanel />}
            {activeTab === 'agent' && <AgentSettingsPanel />}
            {activeTab === 'llm' && <LlmConfigModal embedded />}
            {activeTab === 'models' && <ModelCatalogPanel />}
            {activeTab === 'team' && <TeamSettingsPanel />}
            {activeTab === 'hosted' && <HostedSettingsPanel />}
          </main>
        </section>
      </div>
    </div>,
    document.body,
  )
}
