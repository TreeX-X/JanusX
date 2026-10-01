import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ModalCloseButton } from './ModalCloseButton'
import { ModalFrame } from '@/components/shared/ModalFrame'
import { GeneralSettingsPanel } from './GeneralSettingsPanel'
import { ExperimentalSettingsPanel } from './ExperimentalSettingsPanel'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
import { KnowledgeSettingsPanel } from './KnowledgeSettingsPanel'
import { LlmConfigModal } from './LlmConfigModal'
import { ModelCatalogPanel } from './ModelCatalogPanel'
import { AgentSettingsPanel } from './AgentSettingsPanel'
import { HostedSettingsPanel } from './HostedSettingsPanel'
import { TeamSettingsPanel } from './team/TeamSettingsPanel'
import { useExperimentalStore } from '@/stores/experimental'
import { useI18n } from '@/i18n/useI18n'
import styles from './AppSettingsModal.module.css'

export type SettingsTab = 'general' | 'experimental' | 'notifications' | 'knowledge' | 'agent' | 'llm' | 'models' | 'team' | 'hosted'

interface AppSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: SettingsTab
}

const TAB_ORDER: SettingsTab[] = ['general', 'experimental', 'notifications', 'knowledge', 'agent', 'llm', 'models', 'team', 'hosted']

// Note: the modal mounts only while open, so ModalFrame owns the whole
// open/closing/hidden lifecycle — see shared/ModalFrame.css and
// .agents/notes/2026-09-18-settings-workbench-transition--5a07c410.md
export function AppSettingsModal({ isOpen, onClose, initialTab = 'general' }: AppSettingsModalProps) {
  const { t } = useI18n('settings')
  const { t: tTeam } = useI18n('team')
  const { t: tCommon } = useI18n('common')
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  // 创新开关门控团队页：关闭时 tab 隐藏；正停在 team 页则退回 general，避免悬空态。
  const teamCollabEnabled = useExperimentalStore((s) => s.teamCollab)
  const loadExperimental = useExperimentalStore((s) => s.load)
  const tabOrder = teamCollabEnabled ? TAB_ORDER : TAB_ORDER.filter((tab) => tab !== 'team')

  useEffect(() => {
    void loadExperimental()
  }, [loadExperimental])

  useEffect(() => {
    if (!teamCollabEnabled) setActiveTab((prev) => (prev === 'team' ? 'general' : prev))
  }, [teamCollabEnabled])

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab)
  }, [isOpen, initialTab])

  if (!isOpen) return null

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

  return (
    <ModalFrame
      label={meta.title}
      onClose={onClose}
      backdropClassName={styles.backdrop}
      panelClassName={styles.panel}
      focusPanelOnReveal
      zIndex={9999}
    >
      {({ requestClose }) => (
        <>
          <aside className={styles.sidebar}>
            <div className={styles.brand}>
              <span className={styles.brandTitle}>JanusX</span>
              <span className={styles.brandMeta}>{t('settings:brand')}</span>
            </div>
            {tabOrder.map((tab) => (
              <button
                key={tab}
                type="button"
                data-tab={tab}
                className={`${styles.tabButton} ${activeTab === tab ? styles.tabButtonActive : ''} ${tab === 'experimental' ? styles.tabButtonExperimental : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                <span className={styles.tabLabel}>
                  {tab === 'experimental' ? (
                    <Sparkles size={12} strokeWidth={2} aria-hidden="true" className={styles.tabSpark} />
                  ) : null}
                  <span>{tabNav(tab)}</span>
                  {tab === 'experimental' ? <span className={styles.tabBadge}>NEW</span> : null}
                </span>
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
              {activeTab === 'experimental' && <ExperimentalSettingsPanel />}
              {activeTab === 'notifications' && <NotificationSettingsPanel />}
              {activeTab === 'knowledge' && <KnowledgeSettingsPanel />}
              {activeTab === 'agent' && <AgentSettingsPanel />}
              {activeTab === 'llm' && <LlmConfigModal embedded />}
              {activeTab === 'models' && <ModelCatalogPanel />}
              {activeTab === 'team' && <TeamSettingsPanel />}
              {activeTab === 'hosted' && <HostedSettingsPanel />}
            </main>
          </section>
        </>
      )}
    </ModalFrame>
  )
}
