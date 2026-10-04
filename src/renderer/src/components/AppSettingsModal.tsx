import { useEffect, useState } from 'react'
import { Bell, BookOpen, Brain, ChartNoAxesCombined, Cloud, ListFilter, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Users, type LucideIcon } from 'lucide-react'
import { ModalCloseButton } from './ModalCloseButton'
import { ModalFrame } from '@/components/shared/ModalFrame'
import { GeneralSettingsPanel } from './GeneralSettingsPanel'
import { ExperimentalSettingsPanel } from './ExperimentalSettingsPanel'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
import { PersonalMemorySettingsPanel } from './PersonalMemorySettingsPanel'
import { KnowledgeSettingsPanel } from './KnowledgeSettingsPanel'
import { LlmConfigModal } from './LlmConfigModal'
import { ModelCatalogPanel } from './ModelCatalogPanel'
import { AgentSettingsPanel } from './AgentSettingsPanel'
import { UsageStatsPanel } from './UsageStatsPanel'
import { HostedSettingsPanel } from './HostedSettingsPanel'
import { TeamSettingsPanel } from './team/TeamSettingsPanel'
import { useExperimentalStore } from '@/stores/experimental'
import { useI18n } from '@/i18n/useI18n'
import styles from './AppSettingsModal.module.css'

export type SettingsTab = 'general' | 'experimental' | 'notifications' | 'personal' | 'knowledge' | 'agent' | 'llm' | 'usage' | 'models' | 'team' | 'hosted'

interface AppSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: SettingsTab
}

// Note: grouped navigation preserves independent feature gates — see .agents/notes/2026-10-04-assistant-persona-layout--6e9c114d.md
const TAB_GROUPS: { id: string; tabs: SettingsTab[] }[] = [
  { id: 'application', tabs: ['general', 'notifications', 'experimental'] },
  { id: 'memory', tabs: ['knowledge', 'personal'] },
  { id: 'models', tabs: ['llm', 'models', 'usage'] },
  { id: 'collaboration', tabs: ['agent', 'team', 'hosted'] },
]
const TAB_ICONS: Record<SettingsTab, LucideIcon> = {
  general: Settings, notifications: Bell, experimental: Sparkles,
  knowledge: BookOpen, personal: Brain, llm: SlidersHorizontal,
  models: ListFilter, usage: ChartNoAxesCombined, agent: ShieldCheck,
  team: Users, hosted: Cloud,
}

// Note: the modal mounts only while open, so ModalFrame owns the whole
// open/closing/hidden lifecycle — see shared/ModalFrame.css and
// .agents/notes/2026-09-18-settings-workbench-transition--5a07c410.md
export function AppSettingsModal({ isOpen, onClose, initialTab = 'general' }: AppSettingsModalProps) {
  const { t } = useI18n('settings')
  const { t: tTeam } = useI18n('team')
  const { t: tKnowledge } = useI18n('knowledge')
  const { t: tCommon } = useI18n('common')
  const [selectedTab, setActiveTab] = useState<SettingsTab>(initialTab)
  // 创新开关门控团队页：关闭时 tab 隐藏；正停在 team 页则退回 general，避免悬空态。
  const teamCollabEnabled = useExperimentalStore((s) => s.teamCollab)
  const personaEnabled = useExperimentalStore((s) => s.persona)
  const knowledgeEnabled = useExperimentalStore((s) => s.knowledge)
  const loadExperimental = useExperimentalStore((s) => s.load)
  const groups = TAB_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) =>
      (tab !== 'team' || teamCollabEnabled) &&
      (tab !== 'knowledge' || knowledgeEnabled) &&
      (tab !== 'personal' || personaEnabled)),
  })).filter((group) => group.tabs.length > 0)
  const tabOrder = groups.flatMap((group) => group.tabs)
  // Note: disabled knowledge entries never mount, including direct navigation — see .agents/notes/2026-10-03-knowledge-accumulate-review-wiki-rereview--3944b368.md
  const activeTab = tabOrder.includes(selectedTab) ? selectedTab : 'general'

  useEffect(() => {
    void loadExperimental()
  }, [loadExperimental])

  useEffect(() => {
    setActiveTab((prev) => (prev === 'team' && !teamCollabEnabled || prev === 'knowledge' && !knowledgeEnabled || prev === 'personal' && !personaEnabled) ? 'general' : prev)
  }, [teamCollabEnabled, knowledgeEnabled, personaEnabled])

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab)
  }, [isOpen, initialTab])

  if (!isOpen) return null

  // team 页文案走 team 命名空间（settings.json 存在历史编码损坏，不再追加 key）。
  // hosted 页同理走 common 命名空间。
  const tabNav = (tab: SettingsTab) =>
    tab === 'personal' ? tKnowledge('knowledge:memorySettings.title') : tab === 'team'
      ? tTeam('team:settingsTab.nav')
      : tab === 'hosted'
        ? tCommon('common:hosted.nav')
        : t(`settings:tab.${tab}.nav`)
  const tabNavMeta = (tab: SettingsTab) =>
    tab === 'personal' ? tKnowledge('knowledge:memorySettings.navMeta') : tab === 'team'
      ? tTeam('team:settingsTab.navMeta')
      : tab === 'hosted'
        ? tCommon('common:hosted.navMeta')
        : t(`settings:tab.${tab}.navMeta`)
  const meta = activeTab === 'personal' ? { title: tKnowledge('knowledge:memorySettings.title'), subtitle: tKnowledge('knowledge:memorySettings.navMeta') } : activeTab === 'team'
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
            <nav className={styles.navigation} aria-label={t('settings:brand')}>
              {groups.map((group) => (
                <section key={group.id} className={styles.navGroup} aria-label={t(`settings:groups.${group.id}`)}>
                  <h3 className={styles.groupTitle}>{t(`settings:groups.${group.id}`)}</h3>
                  <div className={styles.groupItems}>
                    {group.tabs.map((tab) => {
                      const Icon = TAB_ICONS[tab]
                      return (
                        <button
                          key={tab}
                          type="button"
                          data-tab={tab}
                          className={`${styles.tabButton} ${activeTab === tab ? styles.tabButtonActive : ''}`}
                          aria-current={activeTab === tab ? 'page' : undefined}
                          onClick={() => setActiveTab(tab)}
                        >
                          <Icon size={16} strokeWidth={1.7} aria-hidden="true" className={styles.tabIcon} />
                          <span className={styles.tabText}>
                            <span className={styles.tabLabel}>{tabNav(tab)}</span>
                            <span className={styles.tabMeta}>{tabNavMeta(tab)}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </nav>
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
              {activeTab === 'personal' && <PersonalMemorySettingsPanel />}
              {activeTab === 'knowledge' && <KnowledgeSettingsPanel />}
              {activeTab === 'agent' && <AgentSettingsPanel />}
              {activeTab === 'llm' && <LlmConfigModal embedded />}
              {activeTab === 'usage' && <UsageStatsPanel />}
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
