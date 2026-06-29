import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ModalCloseButton } from './ModalCloseButton'
import { NotificationSettingsPanel } from './NotificationSettingsPanel'
import { LlmConfigModal } from './LlmConfigModal'
import styles from './AppSettingsModal.module.css'

type SettingsTab = 'notifications' | 'llm'

interface AppSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  initialTab?: SettingsTab
}

const TAB_META: Record<SettingsTab, { title: string; subtitle: string }> = {
  notifications: {
    title: '通知设置',
    subtitle: 'Notifications · Agent 终端任务提醒策略',
  },
  llm: {
    title: 'LLM 引擎',
    subtitle: 'LLM Engine · Provider 凭证与默认模型',
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
          <div className={styles.brand}>JanusX 设置</div>
          <button
            type="button"
            className={`${styles.tabButton} ${
              activeTab === 'notifications' ? styles.tabButtonActive : ''
            }`}
            onClick={() => setActiveTab('notifications')}
          >
            通知提醒
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'llm' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('llm')}
          >
            LLM 引擎
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
            {activeTab === 'llm' && <LlmConfigModal embedded />}
          </main>
        </section>
      </div>
    </div>,
    document.body,
  )
}
