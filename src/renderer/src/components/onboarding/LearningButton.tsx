import { BookOpen } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { useOnboardingStore } from '@/stores/onboarding'
import styles from './Onboarding.module.css'

export function LearningButton({ onOpen }: { onOpen?: () => void }) {
  const { t } = useI18n('common')
  return (
    <button type="button" className={styles.entry} data-onboarding="learning"
      onClick={() => { onOpen?.(); useOnboardingStore.getState().openCenter() }}>
      <BookOpen size={14} aria-hidden="true" />
      <span>{t('common:learning.title')}</span>
    </button>
  )
}
