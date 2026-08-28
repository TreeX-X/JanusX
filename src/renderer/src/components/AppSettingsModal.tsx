import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ModalCloseButton } from './ModalCloseButton'
import { GeneralSettingsPanel } from './GeneralSettingsPanel'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
import { KnowledgeSettingsPanel } from './KnowledgeSettingsPanel'
import { LlmConfigModal } from './LlmConfigModal'
import { ModelCatalogPanel } from './ModelCatalogPanel'
import { AgentSettingsPanel } from './AgentSettingsPanel'
import { useI18n } from '@/i18n/useI18n'
import styles from './AppSettingsModal.module.css'

type SettingsTab = 'general' | 'notifications' | 'knowledge' | 'agent' | 'llm' | 'models'

interface AppSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: SettingsTab
}

const TAB_ORDER: SettingsTab[] = ['general', 'notifications', 'knowledge', 'agent', 'llm', 'models']

export function AppSettingsModal({ isOpen, onClose, initialTab = 'notifications' }: AppSettingsModalProps) {
  const { t } = useI18n('settings')
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab)
  }, [isOpen, initialTab])

  if (!isOpen) return null

  const meta = {
    title: t(`settings:tab.${activeTab}.title`),
    subtitle: t(`settings:tab.${activeTab}.subtitle`),
  }

  return createPortal(
    <div className={styles.backdrop}>
      <div className={styles.panel}>
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
              <span className={styles.tabLabel}>{t(`settings:tab.${tab}.nav`)}</span>
              <span className={styles.tabMeta}>{t(`settings:tab.${tab}.navMeta`)}</span>
            </button>
          ))}
        </aside>

        <section className={styles.content}>
          <header className={styles.header}>
            <div className={styles.titleWrap}>
              <h2 className={styles.title}>{meta.title}</h2>
              <div className={styles.subtitle}>{meta.subtitle}</div>
            </div>
            <ModalCloseButton onClose={onClose} />
          </header>

          <main className={styles.body}>
            {activeTab === 'general' && <GeneralSettingsPanel />}
            {activeTab === 'notifications' && <NotificationSettingsPanel />}
            {activeTab === 'knowledge' && <KnowledgeSettingsPanel />}
            {activeTab === 'agent' && <AgentSettingsPanel />}
            {activeTab === 'llm' && <LlmConfigModal embedded />}
            {activeTab === 'models' && <ModelCatalogPanel />}
          </main>
        </section>
      </div>
    </div>,
    document.body,
  )
}
