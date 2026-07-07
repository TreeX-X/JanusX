import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ModalCloseButton } from './ModalCloseButton'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
import { KnowledgeSettingsPanel } from './KnowledgeSettingsPanel'
import { LlmConfigModal } from './LlmConfigModal'
import styles from './AppSettingsModal.module.css'

type SettingsTab = 'notifications' | 'knowledge' | 'llm'

interface AppSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: SettingsTab
}

const TAB_META: Record<
  SettingsTab,
  { title: string; subtitle: string; nav: string; navMeta: string }
> = {
  notifications: {
    title: '通知提醒',
    subtitle: 'Notifications · Agent 终端任务完成与失败提醒策略',
    nav: '通知提醒',
    navMeta: 'System reminders',
  },
  knowledge: {
    title: '知识库',
    subtitle: 'Knowledge Engine · 采集开关与 observation 记录策略',
    nav: '知识库',
    navMeta: '记忆采集',
  },
  llm: {
    title: 'LLM 引擎',
    subtitle: 'LLM Engine · Provider 凭证、默认模型与连接检测',
    nav: 'LLM 引擎',
    navMeta: 'Providers',
  },
}

export function AppSettingsModal({ isOpen, onClose, initialTab = 'notifications' }: AppSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab)
  }, [isOpen, initialTab])

  if (!isOpen) return null

  const meta = TAB_META[activeTab]

  return createPortal(
    <div className={styles.backdrop}>
      <div className={styles.panel}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <span className={styles.brandTitle}>JanusX</span>
            <span className={styles.brandMeta}>设置中心</span>
          </div>
          <button
            type="button"
            className={`${styles.tabButton} ${
              activeTab === 'notifications' ? styles.tabButtonActive : ''
            }`}
            onClick={() => setActiveTab('notifications')}
          >
            <span className={styles.tabLabel}>{TAB_META.notifications.nav}</span>
            <span className={styles.tabMeta}>{TAB_META.notifications.navMeta}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${
              activeTab === 'knowledge' ? styles.tabButtonActive : ''
            }`}
            onClick={() => setActiveTab('knowledge')}
          >
            <span className={styles.tabLabel}>{TAB_META.knowledge.nav}</span>
            <span className={styles.tabMeta}>{TAB_META.knowledge.navMeta}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'llm' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('llm')}
          >
            <span className={styles.tabLabel}>{TAB_META.llm.nav}</span>
            <span className={styles.tabMeta}>{TAB_META.llm.navMeta}</span>
          </button>
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
            {activeTab === 'notifications' && <NotificationSettingsPanel />}
            {activeTab === 'knowledge' && <KnowledgeSettingsPanel />}
            {activeTab === 'llm' && <LlmConfigModal embedded />}
          </main>
        </section>
      </div>
    </div>,
    document.body,
  )
}
