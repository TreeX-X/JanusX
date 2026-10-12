// Note: preserve the existing personal workspace while retiring engineering assets — see .agents/notes/knowledge/personal-memory-workspace.md
import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/i18n/useI18n'
import { useWorkbenchPhase } from '../shared/CardFrame'
import { UserPersonaTool } from './UserPersonaTool'
import { MemoryReviewTool } from './MemoryReviewTool'
import { PersonalMemorySettingsPanel } from '../PersonalMemorySettingsPanel'
import styles from './KnowledgeWorkbench.module.css'

export function PersonalMemoryWorkbench({ isOpen, onClose }: { isOpen: boolean; onClose(): void }) {
  const { t } = useI18n('knowledge')
  const [view, setView] = useState<'profile' | 'review' | 'settings'>('profile')
  const { phase, isClosing, requestClose, handleExitFinished } = useWorkbenchPhase(isOpen, { awaitAnimation: true, exitMs: 600, onClose })
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    if (!isOpen) return
    setRevealed(false)
    const frame = requestAnimationFrame(() => setRevealed(true))
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); requestClose() }
    }
    window.addEventListener('keydown', escape)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', escape) }
  }, [isOpen, requestClose])
  if (phase === 'hidden') return null
  const card = (index: number) => ({ '--card-index': index } as CSSProperties)
  return createPortal(<div className={styles.backdrop} data-closing={isClosing || undefined}
    style={{ '--workbench-exit-duration': '540ms' } as CSSProperties}
    onAnimationEnd={event => { if (isClosing && event.target === event.currentTarget) handleExitFinished() }}>
    <section className={styles.shell} data-closing={isClosing || undefined} data-reveal-ready={revealed || undefined}
      style={{ '--card-count': 4, '--card-enter-stagger': '180ms', '--card-enter-duration': '260ms', '--card-exit-stagger': '60ms' } as CSSProperties}
      aria-label={t('knowledge:domains.personal')}>
      <header className={styles.header} style={card(0)}>
        <button type="button" className={styles.closeButton} onClick={requestClose} aria-label={t('knowledge:action.close')}><span aria-hidden="true" /></button>
        <nav className={styles.breadcrumb}><span className={styles.bcCurrent}>{t('knowledge:domains.personal')}</span><span aria-hidden="true">/</span><span>{t(`knowledge:domains.${view}`)}</span></nav>
      </header>
      <div className={styles.statusCard} data-domain="personal" style={card(1)}><div className={styles.personalStatus}><strong>{t('knowledge:domains.personal')}</strong><span>{t('knowledge:personalBoard.description')}</span></div></div>
      <main className={styles.grid} data-domain="personal" data-detail-open="false">
        <nav className={styles.leftPane} style={card(2)} aria-label={t('knowledge:domains.personal')}>
          {(['profile', 'review', 'settings'] as const).map(item => <button key={item} type="button" className={`${styles.navButton} ${view === item ? styles.navActive : ''}`} aria-pressed={view === item} onClick={() => setView(item)}>{t(`knowledge:domains.${item}`)}</button>)}
        </nav>
        <section key={view} className={`${styles.stage} ${styles.personalContent}`} style={card(3)}>
          {view === 'profile' && <UserPersonaTool expanded active={isOpen} onOpenReview={() => setView('review')} />}
          {view === 'review' && <MemoryReviewTool expanded active={isOpen} domain="user" />}
          {view === 'settings' && <PersonalMemorySettingsPanel />}
        </section>
      </main>
    </section>
  </div>, document.body)
}
